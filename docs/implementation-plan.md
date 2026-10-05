# Lutron IPL Events Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development; the user explicitly selected parallel subagents after approving the design. Each worker owns distinct files. Steps use checkbox syntax.

**Goal:** Build a separate local repository containing a read-only IPL-to-MQTT Home Assistant app for Green / HA OS, with a complete GitHub App store build context and alternate local app package.

**Architecture:** Strict IPL framing and an OpenSSL transport feed experimental UI-Level events and optional frame diagnostics to an MQTT publisher. Home Assistant discovers configured event entities and connection health. Root owns shared contracts, configuration/credentials validation and process orchestration; three independent workers implement transport, MQTT, and packaging.

**Tech Stack:** Node 22, TypeScript, OpenSSL, MQTT.js 5.15.2, node:test, esbuild, HA OS local apps.

**Spec:** docs/design.md; independent technical review: docs/design-review.md.

## Global constraints

- Observational input only; Ping every 20 seconds is the only outbound IPL operation. No lighting, LED, enrollment, programming, HA-automation, or firmware writes.
- No live household connections or additional physical gesture tests in this build. Tests use sanitized packets and generated local TLS credentials only.
- No household IDs/addresses/certificates/captures or private keys in committed defaults, examples or package artifacts.
- Preserve experimental UI-report semantics and unclassified processor startup/cached reports. Receipt timestamps do not prove physical timing.
- Frame versions 1-3/types 0-5 only; incomplete-frame deadline 10 seconds, pending bytes 128 KiB maximum. First valid inbound frame within 30 seconds; dead session after 75 seconds; backoff 1s doubling to 30s, reset after 60s healthy.
- Events/debug QoS0/nonretained, clean MQTT sessions, queueQoSZero false, no offline event cache. Config/health retained. Explicitly bounded backpressure; best-effort delivery.
- Local slug lutron-ipl; build context /addons/lutron-ipl, private host credentials /addon_configs/local_lutron-ipl, read-only mount /config. services mqtt:want, hassio_api true, no host networking/privilege/USB access.
- OpenSSL CA chain verification required; default chain-only identity boundary explicit, optional expected DNS/IP identity verified when configured.
- Source/reports authored in isolated staging git repo, delivered to /Users/asingh/projects/lutron-ipl-app. Public GitHub publication at thetimetraveler/lutron-ipl-app was explicitly authorized during implementation.

## Review focus

1. Startup UI telemetry must not be relabeled as a proven fresh touch: payload source_kind/session_id and documentation in Tasks 1/3.
2. Disconnect races/slow transports cannot queue stale events: Task 2 connected gates, queue disabling, bounded writes and drop diagnostics.
3. Split/junk/resend framing cannot grow memory or restart fragment timeouts forever: Task 1 exact-boundary/timeout tests.
4. A self-contained Green app cannot depend on the parent checkout or floating runtime npx: Task 3 isolated staging/build-context tests.
5. Lifecycle shutdown/missing broker cannot leak OpenSSL children or expose secrets: root config/runtime tests and final review.

## Interfaces and file ownership

Root defines `src/contracts.ts`, `src/config.ts`, `src/main.ts`, `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`, `AGENTS.md`, root lifecycle/config tests and ledger. Workers must not edit these without a root message.

Contracts (all exported from src/contracts.ts):

```typescript
interface UiMapping { id: string; name: string; device_id: number; ui_object_id: number }
interface AppConfig {
  processor_host: string; processor_port: number;
  credential_dir: string; client_cert: string; client_key: string; ca_cert: string;
  expected_server_name: string; expected_server_ip: string;
  mqtt_url: string; mqtt_username: string; mqtt_password: string;
  instance_id: string; base_topic: string; discovery_prefix: string; ha_birth_topic: string;
  publish_debug: boolean; mappings: UiMapping[]; data_dir: string;
}
interface IplFrame {
  version: number; msgType: number; receiverProcessing: string; attempt: string;
  systemId: number; senderId: number; receiverId: number;
  messageId: number; operationId?: number; body: Buffer;
}
interface LevelEvent {
  event_type: 'level_adjustment'; source_kind: 'ui_level_report';
  device_id: number; ui_object_id: number; level: number; wire_value: number;
  received_at: string; session_id: string;
}
interface TransportOptions {
  host: string; port: number; cert: string; key: string; ca: string;
  expectedName?: string; expectedIp?: string;
  onFrame(frame: IplFrame, sessionId: string): void;
  onHealth(healthy: boolean): void; log(message: string): void;
}
interface Publisher {
  setIplHealth(healthy: boolean): void;
  publishLevel(mappingId: string, event: LevelEvent): boolean;
  publishDebug(frame: IplFrame, sessionId: string): boolean;
  stop(): Promise<void>;
}
interface Broker { url: string; username?: string; password?: string }
```

### Task 1: Strict IPL input and transport (agent 1)

**Create:** src/ipl.ts, src/transport.ts, test/ipl.test.ts, test/transport.test.ts. Own only these files. Read the original parser/layout from /Users/asingh/lutron-protocols/lib/ipl.ts for protocol provenance; extract required observational primitives only, not the broad command writer surface.

**Produces:** `IplStreamDecoder` with constructor `(now?:()=>number)`, `push(chunk:Buffer):IplFrame[]`, `checkDeadline():void`, `reset():void`; `levelEvent(frame:IplFrame,mappings:UiMapping[],sessionId:string,receivedAt?:string):{mappingId:string,event:LevelEvent}|null`; `buildPing(messageId:number):Buffer`; `startTransport(options:TransportOptions):{stop():Promise<void>}`. Export `transportArgs(options)` for testing chain and identity flags. Optional injection of clock/timers/spawn belongs to this module, must preserve these public signatures.

- [x] Write failing packet tests using synthetic IDs and captured wire values 0x2f30, 0xd5d6, 0x4041, 0x7f80, 0xe1e2. Assert exact Level filter, valid scaling 0xfeff=100, and rejection of zone/object/property/payload mismatches.
- [x] Run `node --import tsx --test test/ipl.test.ts`; confirm meaningful failure before implementation.
- [x] Implement strict decoder/body conversion and only Ping builder. Exercise version 1/2/3, ACK/Response with absent op, fragmented magic/body, Resend ackset, repeated equal reports, invalid versions/types/junk, incomplete timeout and cap. Example: `assert.throws(()=>decoder.push(Buffer.from('junk')), /frame|magic|invalid/i)`.
- [x] Write lifecycle tests before transport implementation; simulated process/local TLS only. Check Ping-only output, initial/idle/fragment timeout, backoff reset, fresh session IDs, errors/close reaping, bounded SIGTERM->SIGKILL shutdown, no duplicate child and no stderr-secret passthrough. Example: `assert.deepEqual(transportArgs(opts).includes('-verify_return_error'),true)` and `assert.equal(health[0],false)`.
- [x] Implement transport and run the two focused test files. Record commands, red/green evidence and concerns in docs/task-1-report.md. Do not commit during parallel execution; root commits reviewed integration.

### Task 2: MQTT publication and Supervisor lookup (agent 2)

**Create:** src/mqtt.ts, src/supervisor.ts, test/mqtt.test.ts, test/supervisor.test.ts. Own only these files. Existing helper and MQTT sink in /Users/asingh/lutron-protocols/lib provide precedents, not unchanged lifecycle reuse.

**Consumes:** AppConfig/UiMapping/LevelEvent/IplFrame; produces `createPublisher(config:AppConfig,broker:Broker,log?:(message:string)=>void):Publisher` and `resolveBroker(config:AppConfig,options?:{token?:string;fetchImpl?:typeof fetch;log?:(message:string)=>void}):Promise<Broker|null>`. Allow injectable MQTT client/testing factory as an additional parameter without breaking root's call.

- [x] Write failing tests for eager retained event discovery, stable instance/mapping identifiers, health sensor versus IPL event availability, last will, HA birth/reconnect and no event replay.
- [x] Run focused tests to confirm failure. Implement a minimal publisher with clean sessions, queueQoSZero false, connected gate and bounded in-flight/write buffer, explicit drop return value/counters and debug rate bounding. Example assertions: `assert.equal(publish.retain,false); assert.equal(publish.qos,0); assert.equal(connectOptions.queueQoSZero,false)`.
- [x] Persist only app-owned discovery topics under data_dir and delete removed mapping discovery with retained empty payload, never an unrelated prefix. Test rename stability/removal/corrupt inventory and slow publisher timeout behavior.
- [x] Write Supervisor tests before implementation: explicit broker override; missing token/no service/null, full response timeout 5s, safe credential handling. Implement helper with configurable fetch and AbortSignal; retry policy is owned by root main.
- [x] Run `node --import tsx --test test/mqtt.test.ts test/supervisor.test.ts`; report red/green evidence and any interface adjustments in docs/task-2-report.md. Do not commit during parallel execution.

### Task 3: Green app packaging and docs (agent 3)

**Create:** app/manifest.yaml, app/Dockerfile, app/run.sh, app/DOCS.md, app/README.md, app/CHANGELOG.md, scripts/stage.mjs, test/package.test.ts, examples/options.json, examples/automation.yaml, README.md, THIRD_PARTY.md. Own only these files; root owns package manifests/build script definitions. Approved design overrides old wording requiring main checkout: this new repository is independent.

**Consumes:** `npm run build` produces dist/*.js; `npm run stage` invokes scripts/stage.mjs; root package dependencies mqtt5.15.2 and dev esbuild/typescript/tsx. Service entrypoint dist/main.js. Staging default build/lutron-ipl, optional destination argument; refuse overwriting any existing non-owned destination and never install into live HA automatically. App manifest schema exactly matches AppConfig flat fields; credential_dir/data_dir determined by environment/mount, not user-exposed traversal.

- [x] Write failing tests for standalone staged context, no secrets/config/captures, valid YAML schema/options mapping, safe mount and required service declaration, amd64/aarch64, pinned base/OpenSSL install, runtime executable presence and no floating npx.
- [x] Run package test and observe failure. Implement self-contained staging with file allowlist and ownership marker. Bundle JS including MQTT dependency through esbuild (root build script), copy only compiled runtime and packaging/docs; no root node_modules/certificates/captures needed at runtime. Docker uses explicit Node22 supported multiarch pinned version (verify primary registry), installs OpenSSL, labels io.hass.*, starts node /app/dist/main.js.
- [x] Document local install /addons/lutron-ipl, certificate copy /addon_configs/local_lutron-ipl -> /config, options, MQTT discovery/topic inspection, experimental UI semantics/startup limitation, chain-only TLS and optional expected identity, exact app-only rollback and no promised LED control. HA automation example is opt-in and uses received level with state-event readiness checks, not automatically installed.
- [x] Verify staging from this repository alone with independent temp destination and secret-sentinel tests. If Docker unavailable, state no local container/Green build validation, do not claim supported architecture is tested.
- [x] Run packaging tests and report in docs/task-3-report.md. No shared package edits or concurrent commits.

### Task 4: Root integration, validation and independent review

**Create:** contracts/config/main, test/config.test.ts, test/main.test.ts, package/lock/tsconfig, ledger and AGENTS; revise approved design's repo location only. Interfaces above must remain aligned.

- [x] Write failing config tests: typed/ranged options, duplicate mappings, credentials constrained to realpath root, expired/mismatched certificate/key, MQTT URL credentials not printed. Use generated temporary test PEM files, never household files.
- [x] Implement config defaults/validation and credential validation using Node crypto X509Certificate/createPrivateKey/createPublicKey. Parse options from --config or IPL_OPTIONS_FILE/default /data/options.json; environment IPL_CREDENTIAL_DIR and IPL_DATA_DIR determine mount roots.
- [x] Write runtime tests before main logic: missing broker retries 30s without connecting IPL; SIGINT/SIGTERM clear timers/publisher/transport; resolveBroker/config errors logged without secrets; health initially offline; only fresh parsed observations to publisher and no startup UI-state query.
- [x] Integrate interfaces and compose service with testable lifecycle helpers; bundle using esbuild for node22 without external parent paths. Generate a minimal lockfile; no unrelated radio/serial dependencies.
- [x] Run full `npm test`, `npm run typecheck`, `npm run build`, `npm run stage`; inspect staged context and archive for secrets. Docker build if usable engine, otherwise record limitation. Use saved capture offline to confirm observed UI counts without copying it to repo.
- [x] Dispatch independent per-task spec/quality reviews after worker handoff and a broad final review; fix material issues and rerun affected checks. Record rulings/review verdicts and commits.
- [x] Remove temporary node_modules symlink and install this repo's locked dependencies independently. Commit only app repo artifacts, then move repo to /Users/asingh/projects/lutron-ipl-app with scoped permission. Verify moved tests/package and clean git status. Publish the reviewed code to the explicitly authorized public GitHub repository; do not deploy HA automatically.

## Pre-flight rulings

- User explicitly approved the design, requested a separate repository and fan-out implementation; this is authorization to implement with parallel agents, overriding the skill's default sequential dispatch and redundant execution-method selection. Boundaries above avoid shared-file conflicts.
- A brand-new repo on feat/ipl-app is isolated; no linked worktree is required to protect an existing branch. Parent repository modifications remain untouched.
- Local repo creation is authorized; public GitHub publication was subsequently explicitly authorized. Finish with an independent local git repo and reviewed public repository and installable package.
- Local app package can be built by Green's Supervisor later. This environment has no docker command on PATH, so container/Green deployment cannot be asserted based on local JS verification.
