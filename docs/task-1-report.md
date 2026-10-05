# Task 1: strict IPL observation and transport

Implemented only the assigned modules and tests: `src/ipl.ts`, `src/transport.ts`, `test/ipl.test.ts`, `test/transport.test.ts`, and this report. No commits were made. No household connections, captures, addresses, object IDs, or private credentials were accessed for these tests.

## Protocol provenance and implementation

Read `/Users/asingh/lutron-protocols/lib/ipl.ts`. Its `parseFrame`, `decodeRuntimeTelemetry`, `level16ToPct`, and Command.Ping framing establish the version-dependent header, absent ACK/Response operation IDs, 16-byte Resend acknowledgement set, runtime property body, 0xfeff scaling and Ping defaults. The standalone module includes only the required observational layout and the Ping encoder. It does not import any parent code at runtime or include the broader command writer surface.

The decoder requires LEI magic at each boundary; accepts versions 1–3 and message types 0–5; preserves unknown operation bodies; retains partial magic/header/body/Resend bytes; and checks a ten-second deadline anchored to the current pending frame. Pending allocation is bounded at 128 KiB, while large coalesced reads containing complete frames are consumed in bounded portions. Reset clears fragments and deadlines.

`levelEvent` requires Telemetry operation 1, UI object type 9, matching configured UI object ID, property 1, exactly two value bytes, and wire value no greater than 0xfeff. It emits each report, including repeated values and an initial unsolicited report, with a receipt timestamp and session identifier. It cannot determine physical gesture freshness. Tests use synthetic object/device IDs and the five specified sanitized wire values (0x2f30, 0xd5d6, 0x4041, 0x7f80, 0xe1e2).

`startTransport` uses OpenSSL through argument-array spawn, never a shell. Arguments include explicit certificate/key/CA, `-quiet`, and `-verify_return_error`; optional expected DNS name/IP adds the appropriate verification flag. IPv6 connect addresses are bracketed. The default policy remains CA-chain verification without expected-identity checking.

A monotonic-clock state machine requires an initial valid frame within 30 seconds, disconnects after 75 seconds without valid frames, checks parser deadlines every 250 ms, and sends only diagnostic Pings every 20 seconds. Health begins offline and becomes healthy only upon a valid frame. UUID session IDs and parser state change per connection. Backoff doubles from one second to a 30-second maximum and resets after 60 seconds continuously healthy. A session that becomes unhealthy cannot earn that reset while waiting for child close.

Session failure sends SIGTERM, escalates to SIGKILL after two seconds, and waits for the child close event before reconnecting. Stop is idempotent, prevents new frames/reconnects, cancels the state timer, and resolves after child close or a bounded three-second shutdown deadline. A missing child-close event is logged categorically; no overlapping child is started. Stderr is drained without forwarding arbitrary content. Logs contain fixed categories only.

## Red/green evidence

- `node --import tsx --test test/ipl.test.ts`: first failed because the implementation module was absent. With intentionally empty API stubs, all eight substantive tests failed (0 passed): packet counts, filtering, version parsing, invalid-header rejection, deadlines, bounds, and Ping bytes. This confirms assertion-level red evidence before implementing the parser.
- `node --import tsx --test test/transport.test.ts`: with empty transport stubs, all eight initial tests failed (0 passed), including the CA-verification flag and initial offline health assertions. Lifecycle implementation followed that run.
- `node --import tsx --test test/ipl.test.ts test/transport.test.ts`: initial implementation passed 16/16. Added maximum-body, unsolicited-initial-report, backoff cap, delayed child reaping, and generated TLS cases for final coverage.
- The first generated local-TLS run failed with `listen EPERM` because the restricted sandbox disallows loopback binding. Re-running with authorized sandbox escalation allowed the local-only fixture. The next run exposed the macOS default LibreSSL lacking the expected-identity flags. The fixture now selects installed OpenSSL 3 (or `OPENSSL_TEST_BIN`) through test runtime injection; production still spawns `openssl` provided by the app container.
- Final command: `node --import tsx --test test/ipl.test.ts test/transport.test.ts` with localhost binding allowed. Result: **21 passed, 0 failed, 0 skipped**.
- `npm run typecheck`: **passed**, including both assigned modules and tests. An earlier run during parallel implementation failed only because root's then-unwritten runtime module was referenced by another test; the later complete check passed.

The generated local TLS fixture makes four real OpenSSL-to-Node TLS connections: valid mutual TLS with matching expected DNS name, valid chain-only compatibility mode, rejection of an unrelated CA, and rejection of a mismatched expected DNS name. Fixture certificates and private keys are generated under the OS temporary directory and removed afterward; none are committed. Fake-child tests cover initial/idle/incomplete timeouts, repeated reconnects and fresh sessions, delayed reap, process and malformed-stream failures, no stderr-secret passthrough, Ping-only writes, backoff reset/cap and bounded shutdown.

## Boundaries and integration concerns

- Root validates credential path confinement, certificate expiry, and key/certificate match before starting transport. Those checks belong to root's config module and tests; transport does not duplicate them.
- Expected-identity flags require OpenSSL support; the macOS system LibreSSL fails closed if given unsupported flags. The packaged app installs OpenSSL 3. Offline tests support `OPENSSL_TEST_BIN` for other environments.
- Loopback TLS tests need socket-binding permissions. They use only 127.0.0.1, an ephemeral port, and synthetic temporary material.
- A kernel/process that ignores SIGKILL or never delivers close cannot be guaranteed reaped by a user-space timeout. Normal real children are awaited through close; the explicit last-resort stop deadline is bounded and prohibits reconnect.
- No live processor, MQTT delivery, Home Assistant installation, or gesture behavior was verified by this task.

## Independent review R1 follow-up

Read `.superpowers/sdd/implementation-plan/task-1-review.md` and reproduced its P1 callback-safety finding before changing the transport. Added four deterministic fake-child regressions for a throwing first healthy notification, a throwing connection logger, throwing offline notifications and teardown logs, and a throwing frame handler.

Red command: `node --import tsx --test --test-name-pattern='throwing' test/transport.test.ts`. Result before the fix: **1 passed, 3 failed**. The healthy and connecting-log exceptions escaped; the initial/offline callback exception prevented start. The existing frame-handler guard passed its new explicit regression.

The fix contains every health/log notification through no-throw wrappers and installs child error/close/stream handlers before the connection notification. A failed healthy notification terminates the session before delivering any frames. A failed connecting notification terminates the child without recursively invoking the failed logger for a fallback. Offline and teardown notification failures cannot bypass signals, reconnect scheduling, stop-promise construction, settlement, or timer clearing. Callback exception text is discarded. The stop promise is created before notifying external health code so shutdown remains usable even if notification code reenters it.

Green regression command: the same four targeted tests now **4 passed, 0 failed**. Final `node --import tsx --test test/ipl.test.ts test/transport.test.ts` with authorized localhost binding: **25 passed, 0 failed, 0 skipped**. `npm run typecheck` also passed. Regression assertions verify SIGTERM/SIGKILL escalation, waiting for close before replacement, bounded stop settlement, timer clearing, installed error/close handlers, no recursive logger fallback, and no subsequent frame delivery from the failed session. This follow-up changes only the owned transport implementation/test and this report; no commits or household connections were made.
