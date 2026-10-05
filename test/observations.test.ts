import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeObservation, describeObject, validateObservedObject } from '../src/observations.js';
import { IplStreamDecoder } from '../src/ipl.js';
import type { IplFrame } from '../src/contracts.js';

const RECEIPT = '2026-01-01T00:00:00.000Z';
const SESSION = 'synthetic-session';
function body(type: number, suffix: number[] = [], objectId = 9001): Buffer {
  const bytes = Buffer.alloc(6 + suffix.length);
  bytes.writeUInt32BE(objectId, 0); bytes.writeUInt16BE(type, 4);
  Buffer.from(suffix).copy(bytes, 6);
  return bytes;
}
function frame(type: number, op: number, bytes: Buffer): IplFrame {
  return {version: 3, msgType: type, receiverProcessing: 'NoAck', attempt: 'Original', systemId: 7, senderId: 2, receiverId: 255, messageId: 123, operationId: op, body: bytes};
}
function decode(f: IplFrame) { return decodeObservation(f, SESSION, RECEIPT); }
function identity(type: number) { return {system_id: 7, object_type: type, object_id: 9001}; }
function expected(type: number, op: number, eventType: string, source: string, fields = {}) {
  return {...identity(type), operation_id: op, event_type: eventType, source_kind: source, session_id: SESSION, received_at: RECEIPT, ...fields};
}
function assertExactWidth(f: IplFrame) {
  for (let length = 0; length < f.body.length; length++) assert.equal(decode({...f, body: f.body.subarray(0, length)}), null, `truncated ${length}`);
  for (const extra of [1, 2, 20]) assert.equal(decode({...f, body: Buffer.concat([f.body, Buffer.alloc(extra)])}), null, `extended ${extra}`);
}

test('button reports use exact observed widths and preserve opaque release suffix', () => {
  const press = frame(3, 0, body(57));
  const release = frame(3, 1, body(57, [0xaa, 0x01]));
  assert.deepEqual(decode(press), expected(57, 0, 'button_press_report', 'ipl_event_report'));
  assert.deepEqual(decode(release), expected(57, 1, 'button_release_report', 'ipl_event_report', {trailing_hex: 'aa01'}));
  assertExactWidth(press); assertExactWidth(release);
  for (const type of [7, 9, 66]) assert.equal(decode(frame(3, 0, body(type))), null);
  for (const op of [2, 3, 34, 35, 38]) assert.equal(decode(frame(3, op, body(57))), null);
});

test('occupancy events preserve known and unknown numeric statuses without inferred transitions', () => {
  for (const [status, name] of [[1, 'unknown'], [3, 'occupied'], [4, 'unoccupied'], [255, 'disabled'], [0, undefined], [2, undefined]] as const) {
    for (const type of [38, 66]) {
      const suffix = type === 66 ? [status, 0xaa, 0x02] : [status];
      const f = frame(3, 6, body(type, suffix));
      assert.deepEqual(decode(f), expected(type, 6, 'occupancy_report', 'ipl_event_report', {status, ...(name ? {status_name: name} : {}), ...(type === 66 ? {trailing_hex: 'aa02'} : {})}));
      assertExactWidth(f);
    }
  }
  for (const type of [2, 7, 57]) assert.equal(decode(frame(3, 6, body(type, [3]))), null);
  assert.equal(decode(frame(3, 38, body(66, [0, 0xaa, 0]))), null);
});

test('runtime level type/property combinations and rounding are exact', () => {
  for (const [type, property, eventType] of [[9, 1, 'ui_level_report'], [15, 1, 'zone_level_report'], [3, 1, 'load_level_report'], [198, 1, 'shade_level_report'], [3, 4, 'current_level_report']] as const) {
    for (const [wire, percent] of [[0, 0], [0x7f80, 50], [0xfeff, 100]]) {
      const f = frame(5, 1, body(type, [property, wire >> 8, wire & 255]));
      assert.deepEqual(decode(f), expected(type, 1, eventType, 'runtime_property_report', {property_number: property, wire_value: wire, level: percent}));
      assertExactWidth(f);
    }
    for (const wire of [0xff00, 0xffff]) assert.equal(decode(frame(5, 1, body(type, [property, wire >> 8, wire & 255]))), null);
  }
  for (const type of [2, 38, 57, 66, 365, 370]) assert.equal(decode(frame(5, 1, body(type, [1, 0, 0]))), null);
  for (const type of [9, 15, 198]) assert.equal(decode(frame(5, 1, body(type, [4, 0, 0]))), null);
});

test('runtime occupancy, selection and area state retain numeric values', () => {
  for (const type of [2, 38, 66]) for (const status of [0, 1, 3, 4, 255]) {
    const f = frame(5, 1, body(type, [16, status]));
    const names: Record<number, string> = {1: 'unknown', 3: 'occupied', 4: 'unoccupied', 255: 'disabled'};
    assert.deepEqual(decode(f), expected(type, 1, 'occupancy_report', 'runtime_property_report', {property_number: 16, status, ...(names[status] ? {status_name: names[status]} : {})}));
    assertExactWidth(f);
  }
  for (const type of [2, 133]) for (const selection of [0, 30, 255, 65535]) {
    const f = frame(5, 1, body(type, [67, selection >> 8, selection & 255]));
    assert.deepEqual(decode(f), expected(type, 1, 'scene_selection_report', 'runtime_property_report', {property_number: 67, selection}));
    assertExactWidth(f);
  }
  for (const state of [0, 1, 17, 255]) {
    const f = frame(5, 1, body(2, [91, state]));
    assert.deepEqual(decode(f), expected(2, 1, 'area_lighting_report', 'runtime_property_report', {property_number: 91, state}));
    assertExactWidth(f);
  }
});

test('incoming GoToLevel observations expose numeric intent fields without success or client attribution', () => {
  const f = frame(0, 13, body(15, [0x7f, 0x80, 0x12, 0x34, 0xab, 0xcd, 0x01, 0x23]));
  assert.deepEqual(decode(f), expected(15, 13, 'go_to_level_observed', 'ipl_command_observation', {wire_value: 0x7f80, level: 50, originator_feature: 0x1234, fade_quarters: 0xabcd, delay_quarters: 0x123}));
  assertExactWidth(f);
  assert.equal(decode(frame(0, 13, body(3, Array.from(f.body.subarray(6))))), null);
  for (const wire of [0xff00, 0xffff]) {
    const bytes = Buffer.from(f.body); bytes.writeUInt16BE(wire, 6);
    assert.equal(decode({...f, body: bytes}), null);
  }
  const zero = frame(0, 13, body(15, [0, 0, 0, 0, 0, 0, 0, 0]));
  assert.equal(decode(zero)?.originator_feature, 0);
  const maximum = frame(0, 13, body(15, [0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]));
  assert.equal(decode(maximum)?.level, 100);
});

test('unrecognized categories, operations, properties and malformed identities remain opaque', () => {
  for (const msgType of [0, 1, 2, 3, 4, 6]) assert.equal(decode(frame(msgType, 1, body(9, [1, 0, 0]))), null);
  for (const op of [0, 2, 13, 38, 349]) assert.equal(decode(frame(5, op, body(9, [1, 0, 0]))), null);
  for (const [type, property, suffix] of [[107, 66, [1]], [3, 135, [1]], [9, 23, [1]], [9, 16, [3]], [15, 67, [0, 30]], [66, 91, [1]] ] as const) assert.equal(decode(frame(5, 1, body(type, [property, ...suffix]))), null);
  const valid = frame(3, 0, body(57));
  for (const systemId of [-1, 65536, 1.5, NaN, Infinity]) assert.equal(decode({...valid, systemId}), null);
  assert.equal(decode({...valid, operationId: undefined}), null);
  assert.equal(decode({...valid, version: 4}), null);
});

test('receipt defaults are timestamps and routing does not imply device or radio attribution', () => {
  const f = frame(5, 1, body(9, [1, 0, 0]));
  const a = decodeObservation(f, SESSION);
  assert.ok(a && !Number.isNaN(Date.parse(a.received_at)));
  const b = decode({...f, senderId: 0, receiverId: 1, attempt: 'Resend'});
  assert.deepEqual(b, decode(f));
  for (const field of ['device_id', 'component', 'component_number', 'radio_family', 'sender_id', 'success', 'client']) assert.ok(!(field in b!));
});

test('the observation decoder composes with strict version-dependent IPL framing', () => {
  for (const version of [1, 2, 3]) {
    const b = body(57); const systemBytes = version - 1;
    const packet = Buffer.alloc(12 + systemBytes + b.length);
    packet.write('LEI'); packet[3] = ((version - 1) << 5) | 3;
    let offset = 4;
    if (systemBytes === 1) packet[offset++] = 7;
    else if (systemBytes === 2) { packet.writeUInt16BE(7, offset); offset += 2; }
    packet[offset++] = 0; packet[offset++] = 255; packet.writeUInt16BE(123, offset); offset += 2;
    packet.writeUInt16BE(0, offset); offset += 2; packet.writeUInt16BE(b.length, offset); offset += 2; b.copy(packet, offset);
    const decoder = new IplStreamDecoder(); const decoded: IplFrame[] = [];
    for (const byte of packet) decoded.push(...decoder.push(Buffer.from([byte])));
    assert.equal(decoded.length, 1);
    assert.equal(decode(decoded[0])?.system_id, version === 1 ? 0 : 7);
  }
});

const types: Record<number, string[]> = {
  2: ['occupancy_report', 'scene_selection_report', 'area_lighting_report'],
  3: ['load_level_report', 'current_level_report'],
  9: ['ui_level_report'],
  15: ['zone_level_report', 'go_to_level_observed'],
  38: ['occupancy_report'],
  57: ['button_press_report', 'button_release_report'],
  66: ['occupancy_report'],
  133: ['scene_selection_report'],
  198: ['shade_level_report'],
};

test('numeric descriptors derive stable identities and complete fixed event type sets', () => {
  for (const [type, events] of Object.entries(types)) {
    const object = identity(Number(type));
    assert.deepEqual(validateObservedObject(object), object);
    const descriptor = describeObject(object)!;
    assert.equal(descriptor.id, `auto_s7_t${type}_o9001`);
    assert.deepEqual(descriptor.eventTypes, events);
    assert.match(descriptor.name, /IPL/); assert.match(descriptor.name, /7/); assert.match(descriptor.name, /9001/);
    descriptor.eventTypes.push('invented');
    assert.deepEqual(describeObject(object)?.eventTypes, events, 'callers cannot mutate the fixed registry');
  }
  assert.match(describeObject(identity(66))!.name, /Type 66/);
  assert.notEqual(describeObject(identity(57))!.id, describeObject({...identity(57), system_id: 8})!.id);
  assert.equal(describeObject({system_id: 0, object_type: 57, object_id: 1})?.id, 'auto_s0_t57_o1');
  assert.equal(describeObject({system_id: 65535, object_type: 57, object_id: 4294967295})?.id, 'auto_s65535_t57_o4294967295');
});

test('descriptor validation rejects corrupt, extra, nonnumeric and unsupported identities', () => {
  for (const value of [null, undefined, false, 7, 'object', [], new Date(), {}, {system_id: 7, object_type: 57}, {...identity(57), name: 'injected'}, {...identity(57), topic: 'other/config'}, {...identity(57), [Symbol('extra')]: 1}, identity(107)]) assert.equal(validateObservedObject(value), null);
  for (const key of ['system_id', 'object_type', 'object_id']) for (const value of [-1, 0.5, NaN, Infinity, '7', null, undefined]) assert.equal(validateObservedObject({...identity(57), [key]: value}), null);
  for (const object of [{...identity(57), system_id: 65536}, {...identity(57), object_type: 65536}, {...identity(57), object_id: 4294967296}, {...identity(57), object_id: 0}]) assert.equal(validateObservedObject(object), null);
  const accessor = {...identity(57)}; Object.defineProperty(accessor, 'object_id', {get: () => {throw new Error('must not execute');}});
  assert.equal(validateObservedObject(accessor), null);
  assert.equal(describeObject({...identity(57), object_type: 107}), null);
  assert.equal(describeObject({...identity(57), object_id: -1}), null);
});
