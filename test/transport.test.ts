import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { startTransport, transportArgs } from '../src/transport.js';
import { buildPing, IplStreamDecoder } from '../src/ipl.js';
import type { TransportOptions, IplFrame } from '../src/contracts.js';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:tls';
import type { TLSSocket } from 'node:tls';

class FakeChild extends EventEmitter {
  stdin = new PassThrough(); stdout = new PassThrough(); stderr = new PassThrough();
  signals: string[] = []; autoClose = true; writes: Buffer[] = [];
  constructor() { super(); this.stdin.on('data', b => this.writes.push(Buffer.from(b))); }
  kill(signal: string) { this.signals.push(signal); if (this.autoClose) this.emit('close', null, signal); return true; }
}
function harness(callbacks: Partial<Pick<TransportOptions, 'onHealth' | 'onFrame' | 'log'>> = {}) {
  let now = 0; let ticker: (() => void) | undefined; const children: FakeChild[] = [];
  const health: boolean[] = []; const frames: {frame: IplFrame, session: string}[] = []; const logs: string[] = [];
  const opts: TransportOptions = {host: '127.0.0.1', port: 8443, cert: '/synthetic/cert.pem', key: '/synthetic/key.pem', ca: '/synthetic/ca.pem', onFrame: (frame, session) => {frames.push({frame, session}); callbacks.onFrame?.(frame, session);}, onHealth: h => {health.push(h); callbacks.onHealth?.(h);}, log: l => {logs.push(l); callbacks.log?.(l);}};
  const runtime = {now: () => now, uuid: () => `session-${children.length}`, spawn: () => { const c = new FakeChild(); children.push(c); return c as unknown as ChildProcessWithoutNullStreams; }, setInterval: (cb: () => void) => {ticker = cb; return 1 as unknown as ReturnType<typeof setInterval>; }, clearInterval: () => { ticker = undefined; }};
  const transport = startTransport({...opts, runtime});
  return {transport, children, health, frames, logs, timerActive: () => ticker !== undefined, advance(ms: number) {now += ms; ticker?.();}, receive() {children.at(-1)!.stdout.write(buildPing(12));}};
}
test('OpenSSL verifies the explicit CA and optional identity, including IPv6', () => {
  const opts = {host: '::1', port: 8443, cert: '/synthetic/cert', key: '/synthetic/key', ca: '/synthetic/ca'} as TransportOptions;
  const args = transportArgs(opts);
  assert.ok(args.includes('-verify_return_error')); assert.equal(args[args.indexOf('-connect') + 1], '[::1]:8443');
  assert.equal(args[args.indexOf('-CAfile') + 1], opts.ca);
  assert.ok(!args.includes('-verify_hostname')); assert.ok(!args.includes('-verify_ip'));
  assert.ok(transportArgs({...opts, expectedName: 'processor.example'}).includes('-verify_hostname'));
  assert.ok(transportArgs({...opts, expectedIp: '127.0.0.1'}).includes('-verify_ip'));
});
test('starts offline, valid frame makes healthy, only Ping is written', async () => {
  const h = harness(); assert.deepEqual(h.health, [false]); assert.equal(h.children.length, 1);
  h.advance(20000); assert.equal(h.children[0].writes.length, 1);
  const sent = new IplStreamDecoder().push(h.children[0].writes[0])[0];
  assert.equal(sent.msgType, 0); assert.equal(sent.operationId, 11); assert.equal(sent.body.length, 0);
  h.receive(); assert.deepEqual(h.health, [false, true]); assert.equal(h.frames.length, 1);
  await h.transport.stop(); assert.deepEqual(h.health, [false, true, false]);
});
test('initial timeout retries with fresh session and exponential backoff', async () => {
  const h = harness(); h.advance(30000); assert.deepEqual(h.children[0].signals, ['SIGTERM']);
  h.advance(999); assert.equal(h.children.length, 1); h.advance(1); assert.equal(h.children.length, 2);
  h.receive(); const session = h.frames[0].session;
  h.children[1].emit('close', 1, null); h.advance(1999); assert.equal(h.children.length, 2);
  h.advance(1); h.receive(); assert.equal(h.children.length, 3); assert.notEqual(h.frames[1].session, session);
  await h.transport.stop();
});
test('75-second idle timeout and ten-second incomplete-frame timeout', async () => {
  const h = harness(); h.receive(); h.advance(74999); assert.deepEqual(h.children[0].signals, []);
  h.advance(1); assert.deepEqual(h.children[0].signals, ['SIGTERM']); h.advance(1000);
  h.children[1].stdout.write(Buffer.from('L')); h.advance(9999); assert.deepEqual(h.children[1].signals, []);
  h.advance(1); assert.deepEqual(h.children[1].signals, ['SIGTERM']); await h.transport.stop();
});
test('backoff resets only after sixty seconds continuously healthy', async () => {
  const h = harness(); h.children[0].emit('close', 1, null); h.advance(1000);
  h.receive(); h.advance(59000); h.children[1].emit('close', 1, null);
  h.advance(1999); assert.equal(h.children.length, 2); h.advance(1); h.receive();
  h.advance(60000); h.children[2].emit('close', 1, null); h.advance(999); assert.equal(h.children.length, 3);
  h.advance(1); assert.equal(h.children.length, 4); await h.transport.stop();
});
test('errors drain and reap children before reconnect, never log raw stderr', async () => {
  const h = harness(); const child = h.children[0]; child.autoClose = false;
  child.stderr.write('PRIVATE KEY OR PASSWORD SECRET'); child.emit('error', new Error('SECRET'));
  h.advance(5000); assert.equal(h.children.length, 1); assert.deepEqual(child.signals, ['SIGTERM', 'SIGKILL']);
  child.emit('close', 1, null); h.advance(1000); assert.equal(h.children.length, 2);
  assert.ok(!h.logs.join(' ').includes('SECRET')); await h.transport.stop();
});
test('invalid stream resets pending input and closes the session', async () => {
  const h = harness(); h.children[0].stdout.write(Buffer.from('junk')); assert.deepEqual(h.children[0].signals, ['SIGTERM']);
  h.advance(1000); h.receive(); assert.equal(h.frames.length, 1); await h.transport.stop();
});
test('bounded stop escalates SIGTERM to SIGKILL and clears timers without reconnect', async () => {
  const h = harness(); h.children[0].autoClose = false; const done = h.transport.stop();
  assert.deepEqual(h.children[0].signals, ['SIGTERM']); h.advance(2000);
  assert.deepEqual(h.children[0].signals, ['SIGTERM', 'SIGKILL']); h.advance(1000); await done;
  h.advance(30000); assert.equal(h.children.length, 1); await h.transport.stop();
});
test('backoff remains elevated when a short healthy session takes time to reap', async () => {
  const h = harness(); h.children[0].emit('close', 1, null); h.advance(1000); h.receive();
  h.children[1].autoClose = false; h.children[1].stdout.write(Buffer.from('junk')); h.advance(61000);
  h.children[1].emit('close', 1, null); h.advance(1000); assert.equal(h.children.length, 2);
  h.advance(1000); assert.equal(h.children.length, 3); await h.transport.stop();
});
test('reconnect backoff caps at thirty seconds and late data after stop is ignored', async () => {
  const h = harness();
  for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
    const count = h.children.length; h.children.at(-1)!.emit('close', 1, null);
    h.advance(delay - 1); assert.equal(h.children.length, count); h.advance(1); assert.equal(h.children.length, count + 1);
  }
  const child = h.children.at(-1)!; await h.transport.stop(); child.stdout.write(buildPing(1));
  assert.equal(h.frames.length, 0);
});
test('throwing first healthy callback is contained and terminates before frame delivery', async () => {
  const h = harness({onHealth: healthy => {if (healthy) throw new Error('SECRET health failure');}});
  assert.doesNotThrow(() => h.children[0].stdout.write(Buffer.concat([buildPing(1), buildPing(2)])));
  assert.deepEqual(h.children[0].signals, ['SIGTERM']); assert.equal(h.frames.length, 0);
  h.children[0].stdout.write(buildPing(3)); assert.equal(h.frames.length, 0);
  await h.transport.stop(); assert.equal(h.timerActive(), false);
  assert.ok(!h.logs.join(' ').includes('SECRET'));
});
test('throwing connection logger cannot orphan child, and never receives recursive fallback', async () => {
  let logCalls = 0; let h!: ReturnType<typeof harness>;
  assert.doesNotThrow(() => {h = harness({log: () => {logCalls++; throw new Error('SECRET log failure');}});});
  assert.ok(h.children[0].listenerCount('error') > 0); assert.ok(h.children[0].listenerCount('close') > 0);
  assert.deepEqual(h.children[0].signals, ['SIGTERM']); assert.equal(logCalls, 2); // connecting and process close only
  await h.transport.stop(); assert.equal(h.timerActive(), false); assert.equal(h.children.length, 1);
});
test('throwing offline health and teardown logs cannot prevent kill, reap, stop or timer cleanup', async () => {
  const h = harness({onHealth: healthy => {if (!healthy) throw new Error('SECRET offline failure');}, log: message => {if (message !== 'IPL connecting') throw new Error('SECRET teardown failure');}});
  h.receive(); const child = h.children[0]; child.autoClose = false;
  assert.doesNotThrow(() => child.emit('error', new Error('SECRET process failure')));
  assert.deepEqual(child.signals, ['SIGTERM']); h.advance(2000); assert.deepEqual(child.signals, ['SIGTERM', 'SIGKILL']);
  h.advance(30000); assert.equal(h.children.length, 1);
  assert.doesNotThrow(() => child.emit('close', 1, null)); h.advance(1000); assert.equal(h.children.length, 2);
  h.receive(); h.children[1].autoClose = false;
  const stopped = h.transport.stop(); assert.deepEqual(h.children[1].signals, ['SIGTERM']);
  h.advance(2000); assert.deepEqual(h.children[1].signals, ['SIGTERM', 'SIGKILL']);
  h.advance(1000); await stopped; assert.equal(h.timerActive(), false);
  h.children[1].emit('close', 1, null); h.advance(30000); assert.equal(h.children.length, 2);
  assert.ok(!h.logs.join(' ').includes('SECRET'));
});
test('throwing frame callback disconnects and suppresses subsequent frames in batch and stale data', async () => {
  const h = harness({onFrame: () => {throw new Error('SECRET frame failure');}});
  assert.doesNotThrow(() => h.children[0].stdout.write(Buffer.concat([buildPing(1), buildPing(2)])));
  assert.equal(h.frames.length, 1); assert.deepEqual(h.children[0].signals, ['SIGTERM']);
  h.children[0].stdout.write(buildPing(3)); assert.equal(h.frames.length, 1);
  await h.transport.stop(); assert.equal(h.timerActive(), false);
});
test('generated local mutual TLS verifies chain and optional name and rejects wrong CA/name', {timeout: 15000}, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ipl-transport-test-'));
  const cert = join(dir, 'synthetic-cert.pem'); const key = join(dir, 'synthetic-key.pem');
  const other = join(dir, 'synthetic-other.pem');
  let server: ReturnType<typeof createServer> | undefined;
  const sockets = new Set<TLSSocket>();
  const transports: ReturnType<typeof startTransport>[] = [];
  try {
    // macOS supplies LibreSSL without expected-identity flags. Exercise the
    // OpenSSL 3 shipped in the app image, using an installed test binary there.
    const openssl = process.env.OPENSSL_TEST_BIN || (execFileSync('openssl', ['version'], {encoding: 'utf8'}).startsWith('OpenSSL') ? 'openssl' : existsSync('/opt/homebrew/opt/openssl@3/bin/openssl') ? '/opt/homebrew/opt/openssl@3/bin/openssl' : 'openssl');
    execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=processor.test', '-addext', 'subjectAltName=DNS:processor.test,IP:127.0.0.1'], {stdio: 'ignore'});
    execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'synthetic-other-key.pem'), '-out', other, '-days', '1', '-subj', '/CN=other.test'], {stdio: 'ignore'});
    server = createServer({cert: readFileSync(cert), key: readFileSync(key), ca: readFileSync(cert), requestCert: true, rejectUnauthorized: true}, socket => {
      sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
      assert.equal(socket.authorized, true); socket.write(buildPing(10));
    });
    server.on('tlsClientError', () => {});
    await new Promise<void>((resolve, reject) => {server!.once('error', reject); server!.listen(0, '127.0.0.1', resolve);});
    const port = (server.address() as {port: number}).port;
    async function attempt(ca: string, expectedName: string, expectedSuccess: boolean) {
      const health: boolean[] = []; const frames: IplFrame[] = []; const logs: string[] = [];
      let complete!: () => void;
      const result = new Promise<void>(resolve => {complete = resolve;});
      const transport = startTransport({host: '127.0.0.1', port, cert, key, ca, expectedName, runtime: {spawn: (_command, args, settings) => spawn(openssl, args, settings)}, onHealth: h => health.push(h), onFrame: f => {frames.push(f); complete();}, log: l => {logs.push(l); if (l === 'IPL process closed') complete();}});
      transports.push(transport);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([result, new Promise<never>((_, reject) => {timeout = setTimeout(() => reject(new Error('local TLS attempt timeout')), 4000);})]);
        assert.equal(frames.length, expectedSuccess ? 1 : 0); assert.equal(health.includes(true), expectedSuccess);
        assert.ok(!logs.some(l => /PEM|BEGIN|verify error|synthetic-/i.test(l)));
      } finally {if (timeout) clearTimeout(timeout); await transport.stop();}
    }
    await attempt(cert, 'processor.test', true);
    await attempt(cert, '', true);
    await attempt(other, 'processor.test', false);
    await attempt(cert, 'wrong.test', false);
  } finally {
    for (const transport of transports) await transport.stop();
    for (const socket of sockets) socket.destroy();
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    rmSync(dir, {recursive: true, force: true});
  }
});
