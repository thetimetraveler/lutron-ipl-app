# Event Explorer implementation

User-approved scope: implement the proposed event explorer in the existing app,
publish its GitHub update, and install it in the previously authorized HA instance.
The previous response is the feature spec; no further physical tests are needed.

## Global Constraints

- Read-only observer. Diagnostic Ping remains the only outbound IPL message.
- Existing MQTT identities, payloads, topics, admission/rate/backpressure and no-replay behavior remain unchanged.
- Private room/name metadata stays out of GitHub. Expose only validated structured reports, descriptor names/topics and safe numeric diagnostics; never configuration, credentials, raw frames or arbitrary errors.
- History is a display-only in-memory ring of at most 1000 reports, lost on app restart. It is never sent to MQTT, disk, or HA automations.
- Start web UI on port 8099, deny direct requests except actual Supervisor Ingress peer 172.30.32.2 (including IPv4-mapped form) and local loopback for offline testing. Do not trust proxy headers to allow a peer. No published host ports, privileged permissions or HA API token.
- Serve local embedded assets and a read-only JSON snapshot endpoint. Poll using a bounded sequence cursor, not an unbounded stream/client buffer. All URLs relative for Ingress path support. Cache-Control no-store and restrictive CSP. GET only; bound request lifetime/connections.
- The UI does not claim physical gesture freshness, execution, scene names or original command source. Show session changes/reconnect context; scene selections remain numeric.
- Use imported area_name directly for grouping, never infer room/device parents from names or ID arithmetic. Manual mappings preserve their names; attach an exact room only where identity is verified, otherwise use Unassigned.
- Owner file boundaries below enable the user's requested parallel work. No worker-created agents, commits or publishing; coordinator serializes commits.

## Task 1: Backend and integration

Owner: src/explorer.ts, src/explorer-server.ts, src/mqtt.ts, src/naming.ts, src/main.ts, test/explorer.test.ts, test/explorer-server.test.ts, targeted additions in test/mqtt.test.ts. Shared src/explorer-types.ts is coordinator-owned and authoritative; coordinate any changes.

Implement the snapshot contract in src/explorer-types.ts. Store manual mappings and only actually admitted/restored automatic descriptors, bounded to existing mapping+registry limits. Do not create silent metadata objects. Names, structured room and named provenance should reuse one validated metadata snapshot without duplicating file-security code. Existing createNameResolver API remains compatible. Manual mapping systems are initially null; do not guess a system from device_id. Exact metadata join needs unambiguous verified identity; unresolved manual room can remain null.

Hook publisher to register descriptors and observe supported manual/admitted auto reports. Preserve repeated reports and payloads; latest report per object is display-only. Include whether MQTT accepted the publication attempt, not a delivery guarantee. Show known-object reports even during MQTT disconnection, but do not admit additional objects beyond existing MQTT admission behavior. Track IPL/MQTT health and existing numeric drop diagnostics. A display failure must not interrupt IPL/MQTT. Keep hooks optional for tests/standalone use.

Build HTTP server using node:http with GET /, /app.js, /style.css, /api/snapshot?after=<nonnegative-safe-integer>. Snapshot returns bounded events newer than cursor and all objects, oldest/last cursor, reset instance UUID and truncation flag. Initial request returns buffered reports. Import assets EXPLORER_HTML, EXPLORER_JS, EXPLORER_CSS from src/explorer-ui.ts owned by Task 2. Header security, actual-peer allowlist, denied mutations/path traversal, safe errors, finite shutdown required. Default host 0.0.0.0/port8099, injectable host/port/peer for offline tests without weakening production policy. Start server before broker resolution so an offline UI works. Clean shutdown closes server and observer. Handle bind failure clearly, never silently run a manifest-enabled broken web interface.

Write focused tests before implementation, verify failure then success; include bounded history/cursor/reset, unknown/generic/override room cases, offline display and no MQTT replay, duplicate preservation, unsupported/capped object exclusion, peer denial/header-spoof denial, no secret exposure, relative assets/CSP, GET-only, finite shutdown. Report commands and outputs in assigned report file.

## Task 2: Frontend explorer

Owner: src/explorer-ui.ts, test/explorer-ui.test.ts. Read src/explorer-types.ts for exact JSON snapshot contract. Export EXPLORER_HTML, EXPLORER_JS, EXPLORER_CSS as embedded strings; no external fonts, libraries, CDNs or build dependencies. No household fixtures. Backend serves /, /app.js, /style.css and /api/snapshot?after=<cursor>. Frontend polls relative ./api/snapshot about once a second with no overlapping requests and backoff on failure.

Build a polished responsive room sidebar, report-category controls, search, pause/resume, display-only changes-only mode and unnamed-object filter. Default activity feed and an Objects view keep quiet/restored descriptors explorable. Event rows use Time, Room, Object, readable Report, Value and publication status. Select row/object to open details: identity, supported event types, latest structured payload, MQTT topic, semantic explanation and copyable MQTT trigger/example automation. Exact event_type is a MQTT JSON field, not HA event-bus type. The YAML must use modern HA MQTT trigger syntax and a specific event_type value_template filter; optional action remains visibly placeholder/disabled, never installed. Quote topic/type safely with JSON-string YAML scalars. Clipboard can fail on HTTP; provide selectable text fallback and visible feedback.

Bound local history to history_limit; use sequence cursors, instance reset and history_truncated recovery without duplicates. Preserve repeated raw rows; changes-only comparison ignores receipt timestamp/session noise but treats first report in a new session as a new context. Pause freezes display but does not stop data collection. Show session boundaries/reconnect context. Meaningful loading, empty, offline and reconnect states. Imported strings are only rendered with textContent/DOM safe attributes, never innerHTML or executable markup. No untrusted selectors. Keyboard focus/selection, contrast, labels, mobile responsive and reduced-motion support.

Follow frontend-design skill: write compact design tokens/wireframe/critique in report before building; home-lighting activity is the design subject. Keep UI practical and calm, distinct from generic card dashboards. Test client logic using synthetic snapshots/DOM harness where practical; actual browser review will be coordinator-run. Validate generated JS syntax and exact contract consumption. Report commands and outputs in assigned report file.

## Task 3: Packaging, docs and verification

Coordinator owns manifests/package version/shared types/docs/release packaging. Release version 0.4.0; add ingress true/8099/panel_title IPL Events/panel_icon mdi:timeline-text; preserve permissions/options. Assets embedded in main.js mean packaging allowlist remains unchanged. Update docs/changelog with explorer entry, limits, copied triggers, nonpersisted UI history vs unchanged MQTT no-replay. Regenerate tracked release only from fresh local locked dependencies. Run full tests/typecheck/build/stage, compare tracked release, independent backend/frontend task review and full branch review. Build Green/AMD64 in existing CI, create one-app backup before HA update, verify installed UI/options/connections without physical trials or automation changes.
