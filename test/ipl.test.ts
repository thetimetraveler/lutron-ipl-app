import test from 'node:test';
import assert from 'node:assert/strict';
import { IplStreamDecoder, levelEvent, buildPing } from '../src/ipl.js';
import type { IplFrame } from '../src/contracts.js';

function packet(version = 3, type = 5, body = Buffer.alloc(0), op = 1, resend = false) {
  const sys = version - 1;
  const header = Buffer.alloc(4 + sys + 4 + (resend ? 16 : 0) + (type === 1 || type === 2 ? 0 : 2) + (type === 1 ? 0 : 2));
  header.write('LEI'); header[3] = ((version - 1) << 5) | type | (resend ? 8 : 0);
  let p = 4; if (sys === 1) header[p++] = 7; else if (sys === 2) { header.writeUInt16BE(7, p); p += 2; }
  header[p++] = 2; header[p++] = 255; header.writeUInt16BE(123, p); p += 2;
  if (resend) p += 16;
  if (type !== 1 && type !== 2) { header.writeUInt16BE(op, p); p += 2; }
  if (type !== 1) header.writeUInt16BE(body.length, p);
  return Buffer.concat([header, type === 1 ? Buffer.alloc(0) : body]);
}
function body(wire: number, object = 456, type = 9, property = 1) {
  const b = Buffer.alloc(9); b.writeUInt32BE(object); b.writeUInt16BE(type, 4); b[6] = property; b.writeUInt16BE(wire, 7); return b;
}
const mapping = [{ id: 'synthetic_ui', name: 'Synthetic UI', device_id: 123, ui_object_id: 456 }];
test('sanitized wire values scale and repeated UI reports remain separate', () => {
  const decoder = new IplStreamDecoder();
  const values = [0x2f30, 0xd5d6, 0x4041, 0x7f80, 0xe1e2, 0xfeff, 0];
  const frames = decoder.push(Buffer.concat([...values, 0x2f30].map(v => packet(3, 5, body(v)))));
  assert.equal(frames.length, 8);
  const events = frames.map(f => levelEvent(f, mapping, 'session-test', '2026-01-01T00:00:00.000Z'));
  assert.deepEqual(events.map(e => e?.event.level), [19, 84, 25, 50, 89, 100, 0, 19]);
  assert.deepEqual(events[0], { mappingId: 'synthetic_ui', event: { event_type: 'level_adjustment', source_kind: 'ui_level_report', device_id: 123, ui_object_id: 456, wire_value: 0x2f30, level: 19, session_id: 'session-test', received_at: '2026-01-01T00:00:00.000Z' } });
});
test('only exact runtime UI Level bodies produce events', () => {
  const f = new IplStreamDecoder().push(packet(3, 5, body(0x4041)))[0];
  const rejects: IplFrame[] = [
    {...f, msgType: 0}, {...f, msgType: 3}, {...f, operationId: 2},
    {...f, body: body(0x4041, 456, 3)}, {...f, body: body(0x4041, 456, 15)},
    {...f, body: body(0x4041, 457)}, {...f, body: body(0x4041, 456, 9, 4)},
    {...f, body: body(0xff00)}, {...f, body: Buffer.alloc(0)},
    {...f, body: f.body.subarray(0, 8)}, {...f, body: Buffer.concat([f.body, Buffer.from([0])])},
  ];
  for (const rejected of rejects) assert.equal(levelEvent(rejected, mapping, 's'), null);
});
test('versions, ACK, Response and Resend parse with fragmented headers', () => {
  for (const version of [1, 2, 3]) for (const type of [0, 1, 2, 3, 4, 5]) for (const resend of [false, true]) {
    const bytes = packet(version, type, Buffer.from([42, 43]), 999, resend);
    const d = new IplStreamDecoder(); let frames: IplFrame[] = [];
    for (const byte of bytes) frames.push(...d.push(Buffer.from([byte])));
    assert.equal(frames.length, 1); const f = frames[0];
    assert.equal(f.version, version); assert.equal(f.msgType, type);
    assert.equal(f.systemId, version === 1 ? 0 : 7); assert.equal(f.messageId, 123);
    assert.equal(f.operationId, type === 1 || type === 2 ? undefined : 999);
    assert.equal(f.attempt, resend ? 'Resend' : 'Original');
    assert.deepEqual(f.body, type === 1 ? Buffer.alloc(0) : Buffer.from([42,43]));
  }
});
test('rejects junk and unsupported headers at the exact boundary', () => {
  for (const bytes of [Buffer.from('junk'), Buffer.from('LX'), Buffer.from([76,69,73,0xe0]), Buffer.from([76,69,73,6]), Buffer.from([76,69,73,7]), Buffer.from([76,69,73,0x60])]) {
    assert.throws(() => new IplStreamDecoder().push(bytes), /invalid|magic|version|type/i);
  }
  assert.throws(() => new IplStreamDecoder().push(Buffer.concat([packet(), Buffer.from('X')])), /magic|invalid/i);
});
test('incomplete deadline is anchored to pending frame; reset removes fragments', () => {
  let now = 0; const d = new IplStreamDecoder(() => now);
  d.push(Buffer.from('L')); now = 9999; d.push(Buffer.from('E')); d.checkDeadline();
  now = 10000; assert.throws(() => d.checkDeadline(), /timeout|deadline/i);
  d.reset(); assert.equal(d.push(packet()).length, 1);
  d.push(Buffer.from('L')); now += 10000;
  assert.throws(() => d.push(Buffer.concat([Buffer.from('EI'), packet().subarray(3)])), /timeout|deadline/i);
});
test('completed traffic does not extend the following incomplete frame deadline', () => {
  let now = 0; const d = new IplStreamDecoder(() => now);
  d.push(Buffer.concat([packet(), packet().subarray(0, 10)]));
  now = 9000; d.push(packet().subarray(10, 11)); now = 10000;
  assert.throws(() => d.checkDeadline(), /timeout|deadline/i);
});
test('unconsumed input is bounded', () => {
  assert.throws(() => new IplStreamDecoder().push(Buffer.alloc(128 * 1024 + 1)), /limit|bound|large|magic/i);
  const many = Buffer.concat(Array.from({length: 20000}, () => packet()));
  assert.equal(new IplStreamDecoder().push(many).length, 20000);
});
test('Ping is the sole writer and has the original observational defaults', () => {
  assert.equal(buildPing(123).toString('hex'), '4c454950000101ff007b000b0000');
  for (const bad of [-1, 65536, 1.5, NaN]) assert.throws(() => buildPing(bad));
});
test('maximum unknown-operation body is preserved and truncated body waits for deadline', () => {
  let now = 0;
  const bytes = packet(3, 4, Buffer.alloc(65535, 0xab), 4242, true);
  const d = new IplStreamDecoder(() => now);
  assert.deepEqual(d.push(bytes.subarray(0, bytes.length - 1)), []);
  now = 9999; const frame = d.push(bytes.subarray(bytes.length - 1))[0];
  assert.equal(frame.operationId, 4242); assert.equal(frame.body.length, 65535); assert.equal(frame.body[65534], 0xab);
  d.push(bytes.subarray(0, bytes.length - 1)); now += 10000;
  assert.throws(() => d.checkDeadline(), /timeout/i);
});
test('first unsolicited report is emitted with receipt semantics after a fresh decoder', () => {
  const frame = new IplStreamDecoder().push(packet(3, 5, body(0x4041)))[0];
  const result = levelEvent(frame, mapping, 'new-connection');
  assert.equal(result?.event.event_type, 'level_adjustment');
  assert.equal(result?.event.session_id, 'new-connection');
  assert.ok(result && !Number.isNaN(Date.parse(result.event.received_at)));
});
