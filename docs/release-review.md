# Final independent full-app review

Reviewed 2026-10-05 by `/root/app_final_review` after the coordinator confirmed the final MQTT shutdown fix and regenerated GitHub App store release were ready.

## Verdict

**Spec compliance: approved. Code quality: approved. Public-release packaging: approved for the authorized experimental release.** No unresolved material findings were identified in the final snapshot. This verdict covers source, offline verification, and the complete App store repository build context; it is not evidence of a successful container build, Green installation, live MQTT delivery, or physical-device behavior.

The review read AGENTS.md, design/design review, implementation plan, all four task reports, the prior scoped review records, all production modules, configuration/CLI/runtime tests, package scripts/tests, automation example, deployment documentation, dependency manifests, and CI workflow. The reviewer made no implementation edits, commits, publication, HA changes, household connections, or physical tests.

## Integration and safety assessment

- Config validation rejects invalid hosts/ports/topics, duplicate identifiers/UI mappings, unknown options, unsafe credential paths, invalid certificates, expired/not-yet-valid certificates, and mismatched keys before either connection opens. Runtime composition keeps absent Supervisor MQTT offline, retries every 30 seconds, and rejects late startup after stop. The bundled CLI's actual validation-only path was independently exercised with generated credentials.
- IPL decoding enforces exact framing, version/type validation, fragmented headers and bodies, supported ACK/Response/Resend layouts, bounded pending bytes, and an independent incomplete-frame deadline. UI reports require the specified telemetry operation, object/property/value shape, allowlisted UI object, and valid level range. Repeated reports are preserved; receipt/session/source semantics and cached initial-report ambiguity remain explicit.
- Transport uses argument-array OpenSSL execution, explicit CA trust with fail-closed verification, optional expected DNS/IP identity, bounded health/reconnect/shutdown lifecycle, and contained callback errors. The only IPL writer is diagnostic Ping. No lighting, programming, LED, enrollment, firmware, or automation writer was added.
- MQTT uses clean sessions, QoS 0, unretained events/debug, disabled offline QoS-zero queueing, connected gating, bounded write/backpressure handling, and no observation cache. Discovery/current health refresh independently of observed events. Stable mapping identity, instance ownership, retained stale-discovery cleanup, and experimental entity labeling match the contract. Supervisor lookup has a whole-response deadline and fixed-category error reporting.
- The prior MQTT close-wait finding is resolved: actual stream destruction is followed by a finite 250 ms close-observation fallback, listener removal, and timeout cleanup. Both real-MQTT.js regressions for `emitClose: false` and a noncompleting custom destruction path passed, alongside ordinary forced stream close and reconnect cancellation. The fallback reports inability to confirm closure rather than waiting indefinitely.

## Public App store package and CI

The repository contains one installable `lutron-ipl/config.yaml`; the source template is `app/manifest.yaml`, avoiding duplicate discovery by Supervisor's recursive configuration scan. Root `repository.yaml` names the authorized public URL. The tracked app directory is a complete 13-file Docker context. A fresh allowlisted stage compared byte-for-byte equal to every release file, including the freshly built runtime bundle.

Installation correctly uses Home Assistant's App store repository mechanism and distinguishes HACS. GitHub installations use `/addon_configs/<repository-id>_lutron-ipl`; local installations use `/addon_configs/local_lutron-ipl`. Both mount the app's separate credential directory read-only at `/config`. Manifest permissions are limited to default-role Supervisor access, optional MQTT service use, and that mount. No host networking, privileged capabilities, hardware mapping, Docker API, or HA Core API is requested. These conventions agree with current [HA app configuration](https://developers.home-assistant.io/docs/apps/configuration/) and [repository documentation](https://developers.home-assistant.io/docs/apps/repository/).

Staging/release generation refuses existing destinations and unsafe symlinks, uses fixed file inventories, and does not copy captures, credentials, checkout history, or node_modules. Runtime dependencies are bundled; Docker explicitly installs OpenSSL and pins the Node base by version/digest. Startup performs no package download. THIRD_PARTY notices are present. The opt-in example automation remains disabled and explains report-freshness limitations.

CI uses read-only repository permissions, SHA-pinned official actions, locked dependency installation, tests/typecheck/build, a fresh-versus-committed bundle comparison, and ARM64/AMD64 image builds without image publication. All four pinned action metadata files resolved from their official repositories during this review: [checkout](https://raw.githubusercontent.com/actions/checkout/11d5960a326750d5838078e36cf38b85af677262/action.yml), [setup-node](https://raw.githubusercontent.com/actions/setup-node/49933ea5288caeca8642d1e84afbd3f7d6820020/action.yml), [setup-qemu](https://raw.githubusercontent.com/docker/setup-qemu-action/c7c53464625b32c7a7e944ae62b3e17d2b600130/action.yml), and [setup-buildx](https://raw.githubusercontent.com/docker/setup-buildx-action/8d2750c68a42422c14e847fe6c8ac0403b4cbd6f/action.yml). The workflow itself has not yet run remotely.

## Independent verification

- `npm test`: **70 passed, 0 failed, 0 skipped**. Authorized socket access was used only for the generated temporary mutual-TLS fixture bound to `127.0.0.1` on an ephemeral port. MQTT shutdown tests use synthetic streams, not a broker.
- `npm run typecheck`: passed.
- `npm run build` followed by `cmp dist/main.js lutron-ipl/dist/main.js`: passed.
- Fresh external stage: exact 13-file inventory and byte equality with the public app directory passed.
- Detached bundled CLI with generated temporary certificates: `--check-config` succeeded and reported no connections opened; an invalid MQTT URL containing a synthetic password failed with a fixed error and no sentinel exposure.
- Candidate-public-file scan: 54 files; no private-key PEM material, recognizable credential token, sensitive artifact path, or nonregular file found. All staged files were also checked for private-key material and operator home paths. This is a scoped scan, not a guarantee against every possible secret format.
- `git diff --check`: passed.

Local verification used Node **22.17.1**; CI/container specify **22.23.3**. Docker is absent locally. Successful CI image builds, container execution, Supervisor installation, actual Green behavior, and live MQTT/HA delivery remain separate unverified steps. No further physical tests are required to accept this observational implementation.
