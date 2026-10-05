import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { connect, type IClientOptions } from 'mqtt';
import { describeObject, validateObservedObject } from './observations.js';
import {createNameResolver} from './naming.js';
import type { AppConfig, Broker, IplFrame, LevelEvent, ObservedObject, ObservationEvent, Publisher } from './contracts.js';

export interface ClientLike {
  readonly connected: boolean;
  stream?: { writableLength?: number; destroyed?: boolean; closed?: boolean; destroy(): unknown; once?(event: string, listener: () => void): unknown; removeListener?(event: string, listener: () => void): unknown };
  options?: { reconnectPeriod?: number };
  publish(topic: string, payload: string, options: { retain?: boolean; qos?: 0 | 1 | 2 }, callback?: (error?: Error) => void): unknown;
  subscribe(topic: string, options?: { qos?: 0 | 1 | 2 }, callback?: (error?: Error | null) => void): unknown;
  on(event: string, listener: (...args: any[]) => void): unknown;
  end(force?: boolean, callback?: () => void): unknown;
}
export interface PublisherOptions {
  clientFactory?: (url: string, options: IClientOptions) => ClientLike;
  maxInflight?: number;
  maxBufferedBytes?: number;
  writeTimeoutMs?: number;
  stopTimeoutMs?: number;
  debugPerSecond?: number;
  now?: () => number;
}
export interface Diagnostics { droppedLevels: number; droppedDebug: number; droppedObservations: number; writeTimeouts: number; publishErrors: number }
export type ObservablePublisher = Publisher & { diagnostics(): Readonly<Diagnostics> };
type Control = { topic: string; payload: string };
const MAX_OBJECTS = 256, OBJECT_FILE_BYTES = 64 * 1024, TOPIC_FILE_BYTES = 2 * 1024 * 1024;

// Bound allocation before parsing and do not follow an inventory symlink.
function readInventory(path: string, maxBytes: number): unknown {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('invalid inventory');
    const buffer = Buffer.alloc(maxBytes + 1);
    const size = readSync(fd, buffer, 0, buffer.length, 0);
    if (size > maxBytes) throw new Error('invalid inventory');
    return JSON.parse(buffer.subarray(0, size).toString('utf8'));
  } finally { closeSync(fd); }
}
function writeInventory(path: string, contents: unknown, maxBytes: number): void {
  const payload = JSON.stringify(contents) + '\n';
  if (Buffer.byteLength(payload) > maxBytes) throw new Error('invalid inventory');
  try { if (!lstatSync(path).isFile()) throw new Error('invalid inventory'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const temp = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temp, payload, { mode: 0o600, flag: 'wx' }); renameSync(temp, path); }
  finally { try { unlinkSync(temp); } catch { /* Rename removed it, or creation failed. */ } }
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Stateless observations; only discovery and current health may be republished. */
export function createPublisher(config: AppConfig, broker: Broker, log: (message: string) => void = () => {}, options: PublisherOptions = {}): ObservablePublisher {
  const owner = createHash('sha256').update(JSON.stringify([config.discovery_prefix, config.base_topic, config.instance_id])).digest('hex');
  const uniquePrefix = `lutron_ipl_${owner.slice(0, 16)}_`;
  const root = `${config.base_topic}/${config.instance_id}`;
  const availability = `${root}/availability`, healthTopic = `${root}/ipl_health`;
  const healthDiscovery = `${config.discovery_prefix}/binary_sensor/${uniquePrefix}connection/config`;
  const mappings = new Map(config.mappings.map(m => [m.id, m]));
  const discovery = new Map<string, string>();
  const device = { identifiers: [`${uniquePrefix}app`], name: `Lutron IPL ${config.instance_id}`, manufacturer: 'Lutron', model: 'Experimental IPL observer' };
  const resolveName=createNameResolver(config,log);
  for (const mapping of config.mappings) {
    const id = `${uniquePrefix}${mapping.id}`;
    discovery.set(`${config.discovery_prefix}/event/${id}/config`, JSON.stringify({
      name: `${mapping.name} (experimental)`, unique_id: id, object_id: id, state_topic: `${root}/${mapping.id}/event`,
      event_types: ['level_adjustment'], availability: [{ topic: availability }, { topic: healthTopic }],
      availability_mode: 'all', device,
    }));
  }
  discovery.set(healthDiscovery, JSON.stringify({
    name: 'IPL connection', unique_id: `${uniquePrefix}connection`, object_id: `${uniquePrefix}connection`,
    state_topic: healthTopic, payload_on: 'online', payload_off: 'offline', device_class: 'connectivity',
    availability_topic: availability, entity_category: 'diagnostic', device,
  }));
  const inventoryPath = join(config.data_dir, `lutron-ipl-discovery-${owner}.json`);
  const isOwned = (topic: unknown): topic is string => {
    if (typeof topic !== 'string') return false;
    if (topic === healthDiscovery) return true;
    const prefix = `${config.discovery_prefix}/event/${uniquePrefix}`;
    return topic.startsWith(prefix) && topic.endsWith('/config') && /^[a-zA-Z0-9_-]+$/.test(topic.slice(prefix.length, -7));
  };
  let previousTopics: string[] = [];
  try {
    const stored = readInventory(inventoryPath, TOPIC_FILE_BYTES);
    if (!record(stored) || stored.version !== 1 || stored.owner !== owner || !Array.isArray(stored.topics) ||
      stored.topics.length > 257 || !stored.topics.every(isOwned)) throw new Error('invalid inventory');
    previousTopics = [...new Set<string>(stored.topics)];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') log('[mqtt] discovery inventory invalid or unreadable; cleanup skipped');
  }
  const manualTopics = [...discovery.keys()];
  const objectsPath = join(config.data_dir, `lutron-ipl-objects-${owner}.json`);
  const registry = new Map<string, ObservedObject>();
  let previousObjects = new Map<string, ObservedObject>();
  const mappedUi = new Set(config.mappings.map(mapping => mapping.ui_object_id));
  const suppressed = (object: ObservedObject) => object.object_type === 9 && mappedUi.has(object.object_id);
  const autoTopic = (id: string) => `${config.discovery_prefix}/event/${uniquePrefix}auto/${id}/config`;
  const addDiscovery = (object: ObservedObject) => {
    const descriptor = describeObject(object)!;
    discovery.set(autoTopic(descriptor.id), JSON.stringify({
      name: `${resolveName(object)} (experimental)`, unique_id: `${uniquePrefix}auto:${descriptor.id}`,
      object_id: `${uniquePrefix}auto_${descriptor.id}`, state_topic: `${root}/auto/${descriptor.id}/event`,
      event_types: descriptor.eventTypes, availability: [{ topic: availability }, { topic: healthTopic }],
      availability_mode: 'all', device,
    }));
  };
  try {
    const stored = readInventory(objectsPath, OBJECT_FILE_BYTES);
    if (!record(stored) || Object.keys(stored).sort().join(',') !== 'objects,owner,version' || stored.version !== 1 ||
      stored.owner !== owner || !Array.isArray(stored.objects) || stored.objects.length > MAX_OBJECTS) throw new Error('invalid inventory');
    const validated = new Map<string, ObservedObject>();
    for (const input of stored.objects) {
      const object = validateObservedObject(input), descriptor = object && describeObject(object);
      if (!object || !descriptor || validated.has(descriptor.id)) throw new Error('invalid inventory');
      validated.set(descriptor.id, object);
    }
    previousObjects = validated;
    if (config.auto_discover) for (const [id, object] of validated) {
      if (!suppressed(object)) { registry.set(id, object); addDiscovery(object); }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') log('[mqtt] object inventory invalid or unreadable; cleanup skipped');
  }
  const saveObjects = (objects: Map<string, ObservedObject>) => {
    try {
      mkdirSync(config.data_dir, { recursive: true });
      writeInventory(objectsPath, { version: 1, owner, objects: [...objects.values()] }, OBJECT_FILE_BYTES);
    } catch { log('[mqtt] object inventory could not be saved'); }
  };
  const persist = () => {
    try {
      mkdirSync(config.data_dir, { recursive: true });
      writeInventory(inventoryPath, { version: 1, owner, topics: manualTopics }, TOPIC_FILE_BYTES);
      previousTopics = manualTopics;
    } catch { log('[mqtt] discovery inventory could not be saved'); }
    if (config.auto_discover || previousObjects.size) saveObjects(registry);
    previousObjects = new Map(registry);
  };
  const client = (options.clientFactory ?? ((url, opts) => connect(url, opts) as ClientLike))(broker.url, {
    username: broker.username, password: broker.password, clientId: `${uniquePrefix}client`,
    clean: true, queueQoSZero: false, reconnectPeriod: 1000, connectTimeout: 10_000,
    will: { topic: availability, payload: 'offline', qos: 0, retain: true },
  });
  const limit = options.maxInflight ?? 16, bufferLimit = options.maxBufferedBytes ?? 64 * 1024;
  const timeout = options.writeTimeoutMs ?? 5000, now = options.now ?? Date.now;
  const counters: Diagnostics = { droppedLevels: 0, droppedDebug: 0, droppedObservations: 0, writeTimeouts: 0, publishErrors: 0 };
  let stopped = false, ready = false, healthy = false, draining = false, inflight = 0, generation = 0, batch = 0;
  let controls: Control[] = [], batchRemaining = 0, batchFailed = false, controlsSince = 0;
  let drainTimer: ReturnType<typeof setTimeout> | undefined;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let debugWindow = now(), debugCount = 0;
  let observationWindow = now(), observationCount = 0;
  const clearPending = () => {
    generation++; inflight = 0; for (const timer of timers) clearTimeout(timer); timers.clear();
    controls = []; batchRemaining = 0; batchFailed = true;
    if (drainTimer) clearTimeout(drainTimer); drainTimer = undefined;
  };
  const resetSocket = () => {
    ready = false; clearPending();
    try { if (client.stream) client.stream.destroy(); else client.end(true); } catch { log('[mqtt] socket reset failed'); }
  };
  const canWrite = () => !stopped && ready && client.connected && inflight < limit && (client.stream?.writableLength ?? 0) < bufferLimit;
  const send = (topic: string, payload: string, retain: boolean, done?: (ok: boolean) => void): boolean => {
    const packetBytes = Buffer.byteLength(topic) + Buffer.byteLength(payload) + 16;
    if (!canWrite() || packetBytes + (client.stream?.writableLength ?? 0) > bufferLimit) return false;
    const current = generation; inflight++;
    let completed = false, failed = false;
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (completed || current !== generation) return;
      counters.writeTimeouts++; log('[mqtt] publish timed out; resetting socket'); resetSocket();
    }, timeout);
    timer.unref(); timers.add(timer);
    const callback = (error?: Error) => {
      if (completed || current !== generation) return;
      completed = true; clearTimeout(timer); timers.delete(timer); inflight--;
      if (error) { failed = true; counters.publishErrors++; log('[mqtt] publish failed'); }
      done?.(!error); drain();
    };
    try { client.publish(topic, payload, { retain, qos: 0 }, callback); }
    catch { callback(new Error('publish failed')); return false; }
    return !failed;
  };
  function drain() {
    if (draining || stopped || !ready || !client.connected) return;
    draining = true;
    while (controls.length && canWrite()) {
      const next = controls[0];
      const packetBytes = Buffer.byteLength(next.topic) + Buffer.byteLength(next.payload) + 16;
      if (packetBytes > bufferLimit) {
        controls.shift(); batchFailed = true; batchRemaining--;
        log('[mqtt] discovery payload exceeds publication bound'); continue;
      }
      if (packetBytes + (client.stream?.writableLength ?? 0) > bufferLimit) break;
      const control = controls.shift()!, currentBatch = batch;
      if (!send(control.topic, control.payload, true, ok => {
        if (batch !== currentBatch) return;
        batchFailed ||= !ok;
        if (--batchRemaining === 0 && !batchFailed) persist();
      })) batchFailed = true;
    }
    draining = false;
    if (controls.length && !drainTimer) {
      drainTimer = setTimeout(() => {
        drainTimer = undefined;
        if (now() - controlsSince >= timeout) { counters.writeTimeouts++; log('[mqtt] retained publication congested; resetting socket'); resetSocket(); }
        else drain();
      }, 25); drainTimer.unref();
    }
  }
  function announce() {
    if (stopped || !ready || !client.connected) return;
    batch++; batchFailed = false;
    // Replace, never append, a pending announcement on repeated HA births.
    controls = [
      ...previousTopics.filter(topic => !discovery.has(topic)).map(topic => ({ topic, payload: '' })),
      ...[...previousObjects.keys()].map(autoTopic).filter(topic => !discovery.has(topic)).map(topic => ({ topic, payload: '' })),
      ...[...discovery].map(([topic, payload]) => ({ topic, payload })),
      { topic: availability, payload: 'online' }, { topic: healthTopic, payload: healthy ? 'online' : 'offline' },
    ];
    batchRemaining = controls.length; controlsSince = now(); drain();
  }
  client.on('error', () => log('[mqtt] connection error'));
  client.on('close', () => { ready = false; clearPending(); log('[mqtt] disconnected'); });
  client.on('offline', () => { ready = false; clearPending(); });
  client.on('reconnect', () => { if (client.options) client.options.reconnectPeriod = Math.min((client.options.reconnectPeriod ?? 1000) * 2, 30_000); });
  client.on('connect', () => {
    if (stopped) return;
    clearPending(); ready = true;
    if (client.options) client.options.reconnectPeriod = 1000;
    log('[mqtt] connected');
    try { client.subscribe(config.ha_birth_topic, { qos: 0 }, error => { if (error) log('[mqtt] HA birth subscription failed'); }); }
    catch { log('[mqtt] HA birth subscription failed'); }
    announce();
  });
  client.on('message', (topic: string, payload: Buffer) => {
    if (topic === config.ha_birth_topic && payload.toString() === 'online') announce();
  });
  let stopPromise: Promise<void> | undefined;
  const dropped = (key: 'droppedLevels' | 'droppedDebug' | 'droppedObservations') => {
    counters[key]++;
    if (counters[key] === 1 || counters[key] % 100 === 0) log(`[mqtt] ${key}=${counters[key]}`);
    return false;
  };
  return {
    diagnostics: () => ({ ...counters }),
    setIplHealth(value) {
      if (stopped || healthy === value) return; healthy = value;
      if (ready && client.connected) announce();
    },
    publishLevel(mappingId: string, event: LevelEvent) {
      if (!mappings.has(mappingId)) return dropped('droppedLevels');
      return send(`${root}/${mappingId}/event`, JSON.stringify(event), false) || dropped('droppedLevels');
    },
    publishObservation(event: ObservationEvent) {
      if (!config.auto_discover || stopped) return false;
      const object = validateObservedObject({ system_id: event.system_id, object_type: event.object_type, object_id: event.object_id });
      const descriptor = object && describeObject(object);
      if (!object || !descriptor || !descriptor.eventTypes.includes(event.event_type)) return dropped('droppedObservations');
      if (suppressed(object)) return false;
      const time = now();
      if (time - observationWindow >= 1000 || time < observationWindow) { observationWindow = time; observationCount = 0; }
      if (observationCount >= 50) return dropped('droppedObservations');
      if (!registry.has(descriptor.id)) {
        const cap = config.max_discovered_objects ?? 128;
        // Restored quiet objects survive a lowered cap. Pending removals still
        // occupy persistence slots until their retained cleanup completes.
        if (registry.size >= cap || (previousObjects.size >= MAX_OBJECTS && !previousObjects.has(descriptor.id))) return dropped('droppedObservations');
        registry.set(descriptor.id, object); addDiscovery(object);
        const pending = new Map([...previousObjects, ...registry]);
        saveObjects(pending); previousObjects = pending;
        announce();
      }
      observationCount++;
      return send(`${root}/auto/${descriptor.id}/event`, JSON.stringify(event), false) || dropped('droppedObservations');
    },
    publishDebug(frame: IplFrame, sessionId: string) {
      if (!config.publish_debug) return false;
      const time = now(); if (time - debugWindow >= 1000 || time < debugWindow) { debugWindow = time; debugCount = 0; }
      if (debugCount >= (options.debugPerSecond ?? 20)) return dropped('droppedDebug');
      debugCount++;
      const { body, ...headers } = frame;
      return send(`${root}/debug`, JSON.stringify({ ...headers, raw_body_hex: body.toString('hex'), received_at: new Date(time).toISOString(), session_id: sessionId }), false) || dropped('droppedDebug');
    },
    stop() {
      if (stopPromise) return stopPromise;
      stopped = true; ready = false; clearPending();
      if (client.options) client.options.reconnectPeriod = 0;
      stopPromise = new Promise(resolve => {
        let finishing = false;
        const finish = () => {
          if (finishing) return; finishing = true; clearTimeout(timer);
          const stream = client.stream;
          if (!stream || stream.closed) { resolve(); return; }
          // MQTT.js ignores a second end(true) once end(false) sets disconnecting.
          // Destroy the actual transport, including when a disconnected client's
          // graceful callback fires before its stream closes. Await normal close,
          // but do not depend on emitClose or a completing custom _destroy.
          let completed = false;
          const complete = () => {
            if (completed) return; completed = true;
            clearTimeout(closeTimer); stream.removeListener?.('close', complete); resolve();
          };
          const closeTimer = setTimeout(() => { log('[mqtt] shutdown stream close timed out'); complete(); }, 250);
          if (stream.once) stream.once('close', complete);
          try { stream.destroy(); }
          catch { log('[mqtt] shutdown socket cleanup failed'); complete(); }
          if (!stream.once) complete();
        };
        const timer = setTimeout(finish, options.stopTimeoutMs ?? 2000);
        try {
          if (client.connected) client.publish(availability, 'offline', { retain: true, qos: 0 });
          client.end(false, finish);
        } catch { finish(); }
      });
      return stopPromise;
    },
  };
}
