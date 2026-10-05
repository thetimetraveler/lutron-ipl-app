import type { IplFrame, ObservationEvent, ObservedObject } from './contracts.js';

const LEVEL_MAX = 0xfeff;
const OBJECTS: Readonly<Record<number, {label: string; eventTypes: readonly string[]}>> = {
  2: {label: 'Area', eventTypes: ['occupancy_report', 'scene_selection_report', 'area_lighting_report']},
  3: {label: 'Load Controller', eventTypes: ['load_level_report', 'current_level_report']},
  9: {label: 'UI', eventTypes: ['ui_level_report']},
  15: {label: 'Zone', eventTypes: ['zone_level_report', 'go_to_level_observed']},
  38: {label: 'Occupancy Group', eventTypes: ['occupancy_report']},
  57: {label: 'Button', eventTypes: ['button_press_report', 'button_release_report']},
  66: {label: 'Object Type 66', eventTypes: ['occupancy_report']},
  133: {label: 'Shade Group', eventTypes: ['scene_selection_report']},
  198: {label: 'Shade Object', eventTypes: ['shade_level_report']},
};

function integerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** Accept only supported numeric identities, never persisted names or topics. */
export function validateObservedObject(input: unknown): ObservedObject | null {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return null;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const keys = Reflect.ownKeys(input);
  const expected = ['system_id', 'object_type', 'object_id'] as const;
  if (keys.length !== expected.length || expected.some(key => !keys.includes(key))) return null;
  // Persisted JSON has data properties. Do not invoke accessors on untrusted input.
  const values = expected.map(key => Object.getOwnPropertyDescriptor(input, key));
  if (values.some(value => !value || !('value' in value))) return null;
  const [system, type, object] = values.map(value => value!.value as unknown);
  if (!integerInRange(system, 0, 0xffff) || !integerInRange(type, 0, 0xffff) ||
      !integerInRange(object, 1, 0xffffffff) || !Object.hasOwn(OBJECTS, type)) return null;
  return {system_id: system, object_type: type, object_id: object};
}

export function describeObject(object: ObservedObject): {id: string; name: string; eventTypes: string[]} | null {
  const valid = validateObservedObject(object);
  if (!valid) return null;
  const {system_id: system, object_type: type, object_id: id} = valid;
  const definition = OBJECTS[type];
  return {
    id: `auto_s${system}_t${type}_o${id}`,
    name: `IPL ${definition.label} ${id} (System ${system})`,
    eventTypes: [...definition.eventTypes],
  };
}

function occupancy(status: number): Pick<ObservationEvent, 'status' | 'status_name'> {
  const names: Record<number, string> = {1: 'unknown', 3: 'occupied', 4: 'unoccupied', 255: 'disabled'};
  return {status, ...(Object.hasOwn(names, status) ? {status_name: names[status]} : {})};
}

/** Decode only exact capture-supported shapes; all other IPL bodies stay opaque. */
export function decodeObservation(frame: IplFrame, sessionId: string, receivedAt = new Date().toISOString()): ObservationEvent | null {
  const {body, msgType, operationId} = frame;
  if (!integerInRange(frame.version, 1, 3) || body.length < 6 || operationId === undefined) return null;
  const object = validateObservedObject({system_id: frame.systemId, object_type: body.readUInt16BE(4), object_id: body.readUInt32BE(0)});
  if (!object) return null;
  const type = object.object_type;
  const event = (eventType: string, source: ObservationEvent['source_kind'], fields: Partial<ObservationEvent> = {}): ObservationEvent => ({
    ...object, event_type: eventType, source_kind: source, operation_id: operationId,
    received_at: receivedAt, session_id: sessionId, ...fields,
  });
  const level = (offset: number): {level: number; wire_value: number} | null => {
    const wire = body.readUInt16BE(offset);
    return wire <= LEVEL_MAX ? {level: Math.round(wire * 100 / LEVEL_MAX), wire_value: wire} : null;
  };

  if (msgType === 3) {
    if (type === 57 && operationId === 0 && body.length === 6) return event('button_press_report', 'ipl_event_report');
    if (type === 57 && operationId === 1 && body.length === 8) return event('button_release_report', 'ipl_event_report', {trailing_hex: body.subarray(6).toString('hex')});
    if (operationId === 6 && ((type === 38 && body.length === 7) || (type === 66 && body.length === 9))) {
      return event('occupancy_report', 'ipl_event_report', {...occupancy(body[6]), ...(type === 66 ? {trailing_hex: body.subarray(7).toString('hex')} : {})});
    }
    return null;
  }

  if (msgType === 5 && operationId === 1 && body.length >= 7) {
    const property = body[6];
    const propertyFields = {property_number: property};
    if (body.length === 9 && ((property === 1 && [9, 15, 3, 198].includes(type)) || (property === 4 && type === 3))) {
      const fields = level(7);
      if (!fields) return null;
      const names: Record<number, string> = {9: 'ui_level_report', 15: 'zone_level_report', 3: 'load_level_report', 198: 'shade_level_report'};
      return event(property === 4 ? 'current_level_report' : names[type], 'runtime_property_report', {...propertyFields, ...fields});
    }
    if (property === 16 && body.length === 8 && [38, 2, 66].includes(type)) return event('occupancy_report', 'runtime_property_report', {...propertyFields, ...occupancy(body[7])});
    if (property === 67 && body.length === 9 && [2, 133].includes(type)) return event('scene_selection_report', 'runtime_property_report', {...propertyFields, selection: body.readUInt16BE(7)});
    if (property === 91 && body.length === 8 && type === 2) return event('area_lighting_report', 'runtime_property_report', {...propertyFields, state: body[7]});
    return null;
  }

  if (msgType === 0 && operationId === 13 && type === 15 && body.length === 14) {
    const fields = level(6);
    if (!fields) return null;
    return event('go_to_level_observed', 'ipl_command_observation', {
      ...fields, originator_feature: body.readUInt16BE(8), fade_quarters: body.readUInt16BE(10), delay_quarters: body.readUInt16BE(12),
    });
  }
  return null;
}
