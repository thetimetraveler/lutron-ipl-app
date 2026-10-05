import type { IplFrame, UiMapping, LevelEvent } from './contracts.js';

// Layout provenance: lutron-protocols/lib/ipl.ts, parseFrame and
// RuntimeTelemetry.MarshalPayload. Deliberately excludes lighting writers.
const MAGIC = Buffer.from('LEI');
const MAX_PENDING = 128 * 1024;
const INCOMPLETE_MS = 10_000;
const LEVEL_MAX = 0xfeff;

export class IplStreamDecoder {
  private pending: Buffer = Buffer.alloc(0);
  private pendingSince: number | undefined;
  constructor(private readonly now: () => number = Date.now) {}

  push(chunk: Buffer): IplFrame[] {
    const frames: IplFrame[] = [];
    if (chunk.length === 0) return this.consume(chunk);
    // A large coalesced read may contain many complete frames. Only pending
    // bytes are capped, and concatenation never allocates above that cap.
    for (let offset = 0; offset < chunk.length;) {
      const length = Math.min(chunk.length - offset, MAX_PENDING - this.pending.length);
      if (length === 0) throw new Error('IPL input buffer limit exceeded');
      frames.push(...this.consume(chunk.subarray(offset, offset + length)));
      offset += length;
    }
    return frames;
  }

  private consume(chunk: Buffer): IplFrame[] {
    this.checkDeadline();
    if (this.pending.length + chunk.length > MAX_PENDING) throw new Error('IPL input buffer limit exceeded');
    if (chunk.length === 0) return [];
    if (this.pending.length === 0) this.pendingSince = this.now();
    this.pending = Buffer.concat([this.pending, chunk]);
    const frames: IplFrame[] = [];
    let offset = 0;
    while (offset < this.pending.length) {
      const bytes = this.pending.subarray(offset);
      for (let i = 0; i < Math.min(3, bytes.length); i++) {
        if (bytes[i] !== MAGIC[i]) throw new Error('Invalid IPL frame magic');
      }
      if (bytes.length < 4) break;
      const packed = bytes[3];
      const version = (packed >>> 5) + 1;
      const msgType = packed & 7;
      if (version > 3) throw new Error('Invalid IPL frame version');
      if (msgType > 5) throw new Error('Invalid IPL message type');
      const systemBytes = version - 1;
      let cursor = 4;
      if (bytes.length < cursor + systemBytes + 4) break;
      const systemId = systemBytes === 0 ? 0 : systemBytes === 1 ? bytes[cursor] : bytes.readUInt16BE(cursor);
      cursor += systemBytes;
      const senderId = bytes[cursor++];
      const receiverId = bytes[cursor++];
      const messageId = bytes.readUInt16BE(cursor); cursor += 2;
      const attempt = packed & 8 ? 'Resend' : 'Original';
      if (attempt === 'Resend') {
        if (bytes.length < cursor + 16) break;
        cursor += 16;
      }
      let operationId: number | undefined;
      if (msgType !== 1 && msgType !== 2) {
        if (bytes.length < cursor + 2) break;
        operationId = bytes.readUInt16BE(cursor); cursor += 2;
      }
      let body = Buffer.alloc(0);
      if (msgType !== 1) {
        if (bytes.length < cursor + 2) break;
        const length = bytes.readUInt16BE(cursor); cursor += 2;
        if (bytes.length < cursor + length) break;
        body = Buffer.from(bytes.subarray(cursor, cursor + length)); cursor += length;
      }
      frames.push({version, msgType, receiverProcessing: packed & 16 ? 'Normal' : 'NoAck', attempt, systemId, senderId, receiverId, messageId, operationId, body});
      offset += cursor;
      // A following frame gets its own deadline. Receiving further fragments
      // of that same pending frame never extends it.
      this.pendingSince = offset < this.pending.length ? this.now() : undefined;
    }
    this.pending = Buffer.from(this.pending.subarray(offset));
    return frames;
  }

  checkDeadline(): void {
    if (this.pendingSince !== undefined && this.now() - this.pendingSince >= INCOMPLETE_MS) throw new Error('IPL incomplete frame timeout');
  }
  reset(): void { this.pending = Buffer.alloc(0); this.pendingSince = undefined; }
}

export function levelEvent(frame: IplFrame, mappings: UiMapping[], sessionId: string, receivedAt = new Date().toISOString()): { mappingId: string, event: LevelEvent } | null {
  if (frame.msgType !== 5 || frame.operationId !== 1 || frame.body.length !== 9) return null;
  const objectId = frame.body.readUInt32BE(0);
  if (frame.body.readUInt16BE(4) !== 9 || frame.body[6] !== 1) return null;
  const mapping = mappings.find(m => m.ui_object_id === objectId);
  const wire = frame.body.readUInt16BE(7);
  if (!mapping || wire > LEVEL_MAX) return null;
  return {mappingId: mapping.id, event: {event_type: 'level_adjustment', source_kind: 'ui_level_report', device_id: mapping.device_id, ui_object_id: objectId, level: Math.round(wire * 100 / LEVEL_MAX), wire_value: wire, received_at: receivedAt, session_id: sessionId}};
}

/** The only outbound IPL primitive: diagnostic Command.Ping (11). */
export function buildPing(messageId: number): Buffer {
  if (!Number.isInteger(messageId) || messageId < 0 || messageId > 0xffff) throw new Error('Invalid Ping message ID');
  const ping = Buffer.from('4c454950000101ff0000000b0000', 'hex');
  ping.writeUInt16BE(messageId, 8);
  return ping;
}
