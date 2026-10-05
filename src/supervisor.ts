import { isIP } from 'node:net';
import type { AppConfig, Broker } from './contracts.js';

export interface ResolveOptions {
  token?: string;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
}

/** One bounded lookup. The service runtime owns retry policy. */
export async function resolveBroker(config: AppConfig, options: ResolveOptions = {}): Promise<Broker | null> {
  if (config.mqtt_url) return { url: config.mqtt_url, username: config.mqtt_username || undefined, password: config.mqtt_password || undefined };
  const token = Object.hasOwn(options, 'token') ? options.token : process.env.SUPERVISOR_TOKEN;
  if (!token) return null;
  const log = options.log ?? (() => {});
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Race the entire operation, not only fetch headers. Injected fetch implementations
  // and stalled body readers may ignore abort, so abort alone is insufficient.
  const deadline = new Promise<null>(resolve => {
    timer = setTimeout(() => { controller.abort(); log('[mqtt] Supervisor lookup timed out'); resolve(null); }, 5000);
  });
  const request = (async (): Promise<Broker | null> => {
    try {
      const response = await (options.fetchImpl ?? globalThis.fetch)('http://supervisor/services/mqtt', {
        headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
      });
      if (!response.ok) { log('[mqtt] Supervisor MQTT service unavailable'); return null; }
      const body: unknown = await response.json();
      if (!object(body) || body.result !== 'ok' || !object(body.data)) return null;
      const data = body.data;
      if (typeof data.host !== 'string' || !validHost(data.host) ||
          !Number.isInteger(data.port) || Number(data.port) < 1 || Number(data.port) > 65535 ||
          (data.ssl !== undefined && typeof data.ssl !== 'boolean') ||
          (data.username !== undefined && typeof data.username !== 'string') ||
          (data.password !== undefined && typeof data.password !== 'string')) {
        log('[mqtt] Supervisor MQTT service response invalid'); return null;
      }
      const host = isIP(data.host) === 6 ? `[${data.host}]` : data.host;
      return { url: `${data.ssl ? 'mqtts' : 'mqtt'}://${host}:${data.port}`, username: data.username || undefined, password: data.password || undefined } as Broker;
    } catch {
      if (!controller.signal.aborted) log('[mqtt] Supervisor lookup failed');
      return null;
    }
  })();
  try { return await Promise.race([request, deadline]); }
  finally { if (timer) clearTimeout(timer); }
}

function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function validHost(host: string): boolean {
  return isIP(host) !== 0 || (host.length <= 253 && host.split('.').every(label => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label)));
}
