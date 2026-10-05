# Task 3: Green / HA OS packaging report

Implemented the app manifest, pinned Docker runtime, executable startup script, self-contained stage command, full locked-production dependency notices, synthetic options, disabled automation example, and repository/app installation documentation. The subsequent explicitly authorized GitHub App store extension adds root repository metadata, safe release packaging, and the install-ready tracked `lutron-ipl/` directory. Shared package/build/runtime sources were not edited by this worker.

## Package and safety

- `app/manifest.yaml` declares `lutron-ipl`, primary `aarch64` plus `amd64`, experimental status, manual startup, `mqtt:want`, default-role Supervisor API access, and only read-only `addon_config` mapped to `/config`. Staging names it `config.yaml`; the source template no longer looks like an extra app to Supervisor. No privileged capabilities, host networking, USB, device mappings, Docker API, or HA Core API access are requested.
- Flat options match the runtime contract; numeric IPL IDs use the u32 bound, passwords use HA's password schema, and mappings have stable identifier/name validation. Credential/data directory control remains environmental.
- `scripts/stage.mjs` copies a fixed file allowlist and generates a dependency-free ESM runtime manifest/lock plus `.lutron-ipl-package.json`. MQTT is already bundled by the root build. Startup uses `node /app/dist/main.js` and never downloads a runtime transpiler/dependency.
- Staging prevalidates all regular input files, rejects symlinks in source paths and destination ancestors, refuses live `/addons`/`/addon_configs` destinations, and exclusively creates a **fresh destination**. Every existing destination is refused, including an owned prior package. It performs no recursive removal/overwrite. Repeat builds are documented with fresh `build/` paths. A mid-copy failure leaves an unmarked incomplete directory for manual inspection.
- Credentials/config/captures/history/development dependencies are excluded. Documentation separates transfer to `/addons/lutron-ipl` from IPL credentials in `/addon_configs/local_lutron-ipl` mounted at `/config`.
- The docs explicitly cover CA-chain-only IPL compatibility mode, optional DNS/IP certificate identity checking, experimental UI-source/cached-report semantics, receipt versus gesture time, best-effort MQTT/drop/no-replay behavior, debug scope, opt-in HA automation, and app-only rollback. No live installation or promised Sunnata LED control is implied.

## Primary-source base verification

The [Docker Official Images Node manifest](https://raw.githubusercontent.com/docker-library/official-images/master/library/node) listed `22.23.3-bookworm-slim` for `amd64` and `arm64v8`. Its [upstream Dockerfile at the referenced commit](https://raw.githubusercontent.com/nodejs/docker-node/81f419144a1251854c6d9afb09eaa39928e724e8/22/bookworm-slim/Dockerfile) was inspected. The [Node release schedule](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json) lists Node 22 maintenance support through 2027-04-30.

An authenticated **public pull** of Docker Hub's `library/node` manifest (no household or user credentials) verified the multiarch index digest:

```text
node:22.23.3-bookworm-slim
sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c
platform architecture entries: amd64, arm, arm64, ppc64le, unknown (attestations)
```

The Dockerfile pins both version and index digest, installs OpenSSL and CA certificates explicitly, and uses current `io.hass.version`, `io.hass.type="app"`, and `io.hass.arch` labels per [HA configuration docs](https://developers.home-assistant.io/docs/apps/configuration/). The image base is immutable; Debian package installation is not separately snapshot-pinned and should receive normal security-update review.

## Verification evidence

1. **Red first:** `node --import tsx --test test/package.test.ts` failed 6/6 before the package files existed (`ENOENT`), as expected.
2. **Green:** the same focused suite now passes **6/6**. It parses YAML options/schema and automation, checks permissions/services/mount/architectures/runtime metadata, creates a synthetic detached package with secret sentinels in excluded source trees, verifies exact staged file inventory, runs its standalone ESM runtime, tests repository-rooted default output, and tests existing/symlink/incomplete-source refusal without altering existing contents.
3. `npm run typecheck` passed after the packaging tests were added.
4. `npm run stage -- build/task-3-review` built the real bundled service and produced the complete staged context.
5. A second real context was staged under a fresh `/private/tmp/ipl-standalone-review-*` directory and `node dist/main.js --help` ran there successfully **without `node_modules`**. This confirms detached module import/startup help; it did not connect to IPL, MQTT, or HA. That temporary context was removed afterward.
6. `sh -n app/run.sh` and executable mode checks passed within the suite. `git diff --check` passed for tracked changes; all new Task 3 files were also reviewed.
7. `THIRD_PARTY.md` preserves full license texts for **46 locked production dependency entries**, read from the root-owned lockfile and its independent `npm ci` installation; versions were checked against installed metadata. Unrelated shared-checkout modules are excluded.

`command -v docker` found no Docker executable. **No local Docker image build/run, Home Assistant Green installation, live MQTT delivery, HA entity behavior, or automation action was verified.** Primary multiarch metadata verifies the base selection, not the completed image on either architecture. No household device calls, physical tests, commits, or additional agents were used for this task.

## Authorized GitHub App store extension

- Root `repository.yaml` identifies the explicitly authorized public URL `https://github.com/thetimetraveler/lutron-ipl-app`. README and app DOCS now make adding this URL to HA's App store the primary installation path. HACS is explicitly distinguished from this background app. Local `/addons/lutron-ipl` installation remains an alternate path.
- GitHub credentials are documented at `/addon_configs/<repository-id>_lutron-ipl`, using the actual full slug copied from HA information. `local_lutron-ipl` is reserved for a local app installation. Both mount read-only at `/config`.
- `scripts/package-release.mjs` stages into a fresh ignored `build/.release-*` directory, checks the exact 13-file inventory/marker, and exclusively creates `lutron-ipl/`. It refuses every existing release path, including unowned files, extras and symlinks. No recursive overwrite/deletion occurs; prior releases must be reviewed and moved explicitly before replacement. The script neither creates nor pushes a remote.
- `npm run package:release` (integrated by the coordinator) rebuilt the real MQTT-bundled service and generated the install-ready release. Root-managed gitignore exceptions permit tracking its bundle and synthetic options. The release includes no original design/reports, captures, real configuration, certificates, source checkout history, or development dependencies.
- New repository/release tests failed **2/2 before implementation**, then passed. The independent reviewer found a build-only destination bypass for an in-repository `..not-build` child; its regression was reproduced failing before the guard was fixed to compare complete `..` path components.
- The focused package suite now passes **10/10**: the prior 6 cases plus repository metadata/source-manifest uniqueness, fresh release/refusal safety, the path regression, and the actual tracked release's inventory/current docs/detached executable startup. Final `npm run typecheck` also passed. A public-release scan found no private-key blocks, operator home paths, or household config; bundled `ip-address` contains upstream RFC1918 examples, which are generic library documentation rather than household data. Docker/Green/live validation boundaries remain unchanged. Public publication is handled by the coordinator, not this worker.
