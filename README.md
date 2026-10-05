# Lutron IPL Events

A standalone TypeScript IPL listener installable through the Home Assistant OS App store. It publishes experimental MQTT event entities for configured UI level reports and a connection-health sensor. Home Assistant Green (`aarch64`) is the primary target; the package also declares `amd64`.

This service observes the authenticated IPL stream. It does not change Lutron programming, lights, enrollment, firmware, or LED behavior. Its `level_adjustment` event describes a received UI report: cached reports after reconnect cannot be distinguished from fresh physical gestures. MQTT delivery is best effort, with no event replay or offline event cache. Optional automations require your own review and installation.

## Install through the HA App store

[Add this repository to Home Assistant](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fthetimetraveler%2Flutron-ipl-app)

In Home Assistant, open Settings → Apps → App store → menu → Repositories (older releases say Add-ons). Add this repository URL:

```text
https://github.com/thetimetraveler/lutron-ipl-app
```

Install **Lutron IPL Events**, then follow [the installation guide](lutron-ipl/DOCS.md) to copy IPL certificates into this installation's separate `/addon_configs/<repository-id>_lutron-ipl` directory, configure MQTT and UI mappings, and start it. Copy the exact app slug from HA's app information rather than guessing the repository prefix. This background service is an HA OS app; it is not a HACS custom integration. The repository contains its complete build context, so no local Node setup or manual source transfer is needed for this installation path.

## Build, stage, and prepare a repository release

Use Node 22 or later on the build computer:

```sh
npm ci
npm test
npm run typecheck
npm run stage
```

The build bundles MQTT into `dist/main.js`. Staging produces a complete Docker build context at `build/lutron-ipl`, with only allowlisted files. The runtime needs Node and OpenSSL; startup does not install packages or download a transpiler. No credentials, captures, real configuration, checkout history, or `node_modules` are copied.

For a second build, choose a fresh output:

```sh
npm run stage -- build/lutron-ipl-next
```

Staging refuses **every existing destination**, including a previously owned package marked `.lutron-ipl-package.json`. It never recursively deletes or overwrites a directory. Source symlinks and destination ancestors containing symlinks are rejected; use a physical path (for example `/private/tmp/...` instead of macOS `/tmp/...`) for an external output. A failed copy can leave an incomplete directory; it receives no ownership marker and should be inspected manually. Installation is a separate manual transfer.

See [the HA OS installation guide](app/DOCS.md), [example options](examples/options.json), and [disabled automation example](examples/automation.yaml). The example hostname and IDs are synthetic placeholders; replace them with your own processor and UI mapping.

The tracked `lutron-ipl/` folder is the complete App store Docker build context. Its source manifest is `app/manifest.yaml`, renamed to `config.yaml` only during staging so Supervisor sees one installable app in the repository. To prepare a new release after reviewing/bumping versions, move the prior `lutron-ipl/` to an ignored `build/` backup yourself, then run:

```sh
npm run package:release
```

This rebuilds the bundle, stages into a fresh ignored `build/.release-*` directory, verifies its exact allowlist, and exclusively creates `lutron-ipl/`. It refuses any existing release folder or symlink and never recursively overwrites/deletes prior releases. Review and commit the generated folder with the source changes. It does not create or push a GitHub repository.

## Standalone Docker

After staging, build from the staged context:

```sh
docker build -t lutron-ipl:local build/lutron-ipl
```

Create separate local `credentials/` and `runtime-data/` directories, put the three IPL PEM files in `credentials/`, and write `runtime-data/options.json` using the example flat fields. Set an explicit `mqtt_url`, broker credentials as needed, and your processor host/mappings. Run from that directory:

```sh
docker run --rm --name lutron-ipl \
  --mount type=bind,source="$(pwd)/credentials",target=/config,readonly \
  --mount type=bind,source="$(pwd)/runtime-data",target=/data \
  lutron-ipl:local
```

Ordinary container networking is used. Standalone mode requires an explicit broker; Supervisor discovery only exists in HA OS. For direct Node execution, set `IPL_OPTIONS_FILE`, `IPL_CREDENTIAL_DIR`, and `IPL_DATA_DIR` to your separate local paths, then run `node dist/main.js`; `--config /path/to/options.json` is also supported. Keep secrets outside the repository and build context.

## Verification boundaries

The [initial GitHub CI run](https://github.com/thetimetraveler/lutron-ipl-app/actions/runs/37276359612) passed all 70 tests, typecheck, bundle consistency, and ARM64/AMD64 container image builds. This verifies image construction, not installation or runtime behavior on Green.

Offline parser, transport, publisher, and packaging tests are the local checks. Packaging tests use an isolated synthetic runtime so they can verify staging without connecting to any household device. No Docker executable is available in this development environment: the image has not been built/run locally, installed on Green, or verified against live HA/MQTT. Declared architectures and the pinned base's architecture metadata do not constitute hardware testing.

See [design and verification requirements](docs/design.md) and [third-party notices](THIRD_PARTY.md).
