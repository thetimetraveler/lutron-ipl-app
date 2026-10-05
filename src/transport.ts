import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { IplStreamDecoder, buildPing } from './ipl.js';
import type { TransportOptions } from './contracts.js';

interface Runtime {
  now(): number;
  uuid(): string;
  spawn(command: string, args: string[], options: {stdio: ['pipe', 'pipe', 'pipe']}): ChildProcessWithoutNullStreams;
  setInterval(callback: () => void, ms: number): ReturnType<typeof setInterval>;
  clearInterval(timer: ReturnType<typeof setInterval>): void;
}
interface Connection {
  child: ChildProcessWithoutNullStreams;
  decoder: IplStreamDecoder;
  session: string;
  started: number;
  lastFrame?: number;
  healthySince?: number;
  lastPing: number;
  terminatingAt?: number;
  killed: boolean;
}

export function transportArgs(options: TransportOptions): string[] {
  const host = options.host.includes(':') && !options.host.startsWith('[') ? `[${options.host}]` : options.host;
  const args = ['s_client', '-quiet', '-connect', `${host}:${options.port}`, '-cert', options.cert, '-key', options.key, '-CAfile', options.ca, '-verify_return_error'];
  if (options.expectedName) args.push('-verify_hostname', options.expectedName);
  if (options.expectedIp) args.push('-verify_ip', options.expectedIp);
  return args;
}

/** Runtime injection supports deterministic lifecycle tests; production uses
 * monotonic time, a real OpenSSL child, and a single bounded state-machine timer. */
export function startTransport(options: TransportOptions & {runtime?: Partial<Runtime>}): {stop(): Promise<void>} {
  const runtime: Runtime = {now: () => performance.now(), uuid: randomUUID, spawn: (command, args, settings) => spawn(command, args, settings), setInterval, clearInterval, ...options.runtime};
  let active: Connection | undefined;
  let stopped = false;
  let healthy = false;
  let backoff = 1000;
  let reconnectAt = 0;
  let messageId = 0;
  let stopPromise: Promise<void> | undefined;
  let finishStop: (() => void) | undefined;
  let stopAt: number | undefined;
  notifyHealth(false);

  function notifyHealth(value: boolean): boolean {
    try { options.onHealth(value); return true; } catch { return false; }
  }
  function log(message: string): boolean {
    // Notification failures cannot escape into child/timer event listeners.
    // No recursive fallback or thrown-message forwarding to a failed logger.
    try { options.log(message); return true; } catch { return false; }
  }
  function setHealth(value: boolean): boolean {
    if (healthy !== value) { healthy = value; return notifyHealth(value); }
    return true;
  }
  function scheduleReconnect() {
    reconnectAt = runtime.now() + backoff;
    backoff = Math.min(backoff * 2, 30_000);
  }
  function finish() {
    runtime.clearInterval(timer);
    finishStop?.(); finishStop = undefined;
  }
  function terminate(connection: Connection, category: string, notifyLog = true) {
    if (connection.terminatingAt !== undefined) return;
    connection.terminatingAt = runtime.now();
    connection.decoder.reset();
    setHealth(false);
    if (notifyLog) log(`IPL disconnected: ${category}`);
    // Never end/reuse the stdin stream to send anything except the Ping above.
    connection.child.kill('SIGTERM');
  }
  function connect() {
    if (stopped || active) return;
    const started = runtime.now();
    let child: ChildProcessWithoutNullStreams;
    try { child = runtime.spawn('openssl', transportArgs(options), {stdio: ['pipe', 'pipe', 'pipe']}); }
    catch { log('IPL connection failed: spawn'); scheduleReconnect(); return; }
    const connection: Connection = {child, decoder: new IplStreamDecoder(runtime.now), session: runtime.uuid(), started, lastPing: started, killed: false};
    active = connection;
    // Drain untrusted diagnostics without persisting certificate data, arbitrary
    // server text, paths or passwords. Failure is described by category only.
    child.stderr.resume();
    child.on('error', () => { if (active === connection) terminate(connection, 'process error'); });
    child.stdin.on('error', () => { if (active === connection) terminate(connection, 'write error'); });
    child.stdout.on('error', () => { if (active === connection) terminate(connection, 'read error'); });
    child.stderr.on('error', () => { if (active === connection) terminate(connection, 'diagnostic stream error'); });
    child.stdout.on('data', (chunk: Buffer) => {
      if (active !== connection || stopped || connection.terminatingAt !== undefined) return;
      let frames;
      try { frames = connection.decoder.push(chunk); }
      catch { terminate(connection, 'invalid or incomplete stream'); return; }
      if (frames.length) {
        connection.lastFrame = runtime.now();
        connection.healthySince ??= connection.lastFrame;
        if (!setHealth(true)) { terminate(connection, 'health callback error'); return; }
      }
      for (const frame of frames) {
        if (stopped || connection.terminatingAt !== undefined) break;
        try { options.onFrame(frame, connection.session); }
        catch { terminate(connection, 'frame handler error'); break; }
      }
    });
    child.on('close', () => {
      if (active !== connection) return;
      const healthyUntil = connection.terminatingAt ?? runtime.now();
      if (connection.healthySince !== undefined && healthyUntil - connection.healthySince >= 60_000) backoff = 1000;
      connection.decoder.reset(); active = undefined; setHealth(false);
      log('IPL process closed');
      if (stopped) finish(); else scheduleReconnect();
    });
    // Install every resource/error/close handler before notifying external code.
    if (!log('IPL connecting')) terminate(connection, 'log callback error', false);
  }
  function tick() {
    const now = runtime.now();
    const connection = active;
    if (connection) {
      if (connection.terminatingAt !== undefined) {
        if (!connection.killed && now - connection.terminatingAt >= 2000) {
          connection.killed = true; connection.child.kill('SIGKILL');
        }
      } else {
        if (connection.healthySince !== undefined && now - connection.healthySince >= 60_000) backoff = 1000;
        try { connection.decoder.checkDeadline(); }
        catch { terminate(connection, 'incomplete frame timeout'); return; }
        if (connection.lastFrame === undefined && now - connection.started >= 30_000) terminate(connection, 'initial frame timeout');
        else if (connection.lastFrame !== undefined && now - connection.lastFrame >= 75_000) terminate(connection, 'idle timeout');
        else if (now - connection.lastPing >= 20_000) {
          connection.lastPing = now;
          try {
            if (!connection.child.stdin.write(buildPing(messageId++ & 0xffff))) terminate(connection, 'write congestion');
          } catch { terminate(connection, 'write error'); }
        }
      }
    } else if (!stopped && now >= reconnectAt) connect();
    // Real SIGKILL is reaped through close. An unresponsive process/event loop
    // cannot hold shutdown forever; never reconnect while it remains active.
    if (stopped && stopAt !== undefined && now - stopAt >= 3000) {
      if (active) log('IPL shutdown: child close deadline exceeded');
      finish();
    }
  }
  const timer = runtime.setInterval(tick, 250);
  connect();
  return {
    stop(): Promise<void> {
      if (stopPromise) return stopPromise;
      stopped = true; stopAt = runtime.now();
      stopPromise = new Promise<void>(resolve => { finishStop = resolve; });
      setHealth(false);
      if (active) terminate(active, 'shutdown'); else finish();
      return stopPromise;
    },
  };
}
