# Lutron IPL Events

A standalone TypeScript IPL listener installable through the Home Assistant OS App store. It publishes experimental MQTT event entities for configured UI level reports, optional passive discovery of supported observed IPL objects, and a connection-health sensor. Home Assistant Green (`aarch64`) is the primary target; the package also declares `amd64`.

This service observes the authenticated IPL stream. It does not change Lutron programming, lights, enrollment, firmware, or LED behavior. Manual UI mappings retain their `level_adjustment` event contract. Automatic discovery defaults off; enable `auto_discover` to admit supported observed objects with numeric system/type/object identities and generic names. Silent objects cannot be discovered passively. Startup, cached, and repeated reports in every family cannot establish fresh physical actions; receipt time is not physical action time. MQTT delivery is best effort, with no event replay or offline event cache. Optional automations require your own review and installation.

## Install through the HA App store

[Add this repository to Home Assistant](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fthetimetraveler%2Flutron-ipl-app)

In Home Assistant, open Settings → Apps → App store → menu → Repositories (older releases say Add-ons). Add this repository URL:

```text
https://github.com/thetimetraveler/lutron-ipl-app
```

Install **Lutron IPL Events**, then follow [the installation guide](lutron-ipl/DOCS.md) to copy IPL certificates into this installation's separate `/app_configs/<full-app-slug>` directory (older tools expose `/addon_configs/<repository-id>_lutron-ipl`), configure MQTT and manual UI mappings or automatic discovery, and start it. Copy the exact app slug from HA's app information rather than guessing the repository prefix. This background service is an HA OS app; it is not a HACS custom integration. The repository contains its complete build context, so no local Node setup or manual source transfer is needed for this installation path.

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

See [the HA OS installation guide](app/DOCS.md), [example options](examples/options.json), and [disabled automation example](examples/automation.yaml). The example hostname and IDs are synthetic placeholders; replace them with your own processor and UI mapping, or enable `auto_discover` to use generic observed-object entities.

The tracked `lutron-ipl/` folder is the complete App store Docker build context. Its source manifest is `app/manifest.yaml`, renamed to `config.yaml` only during staging so Supervisor sees one installable app in the repository. To prepare a new release after reviewing/bumping versions, move the prior `lutron-ipl/` to an ignored `build/` backup yourself, then run:

```sh
npm run package:release
```

This rebuilds the bundle, stages into a fresh ignored `build/.release-*` directory, verifies its exact allowlist, and exclusively creates `lutron-ipl/`. It refuses any existing release folder or symlink and never recursively overwrites/deletes prior releases. Review and commit the generated folder with the source changes. It does not create or push a GitHub repository.

## Supported passive observations

With `auto_discover: true`, supported exact IPL shapes produce button press/release, occupancy, UI/zone/load/shade/current-level, scene-selection, area-lighting, and observed GoToLevel command events. The [signal reference](app/DOCS.md#passive-discovery-and-supported-observations) lists numeric object types, event names, fields, and limits. Scene selections and lighting states stay numeric. A GoToLevel observation proves neither original client nor device execution/RF delivery. Unsupported types/properties/RPC/configuration messages create no semantic events.

`max_discovered_objects` defaults to 128 and accepts 1–256; at the cap, existing entities continue but new objects are refused. Numeric descriptors persist without event payloads/last values, so quiet entities survive restarts. Explicit UI mappings suppress matching automatic UI duplicates. Disabling automatic discovery cleans only this instance's automatic configs. Lowering the cap preserves previously discovered objects.

Events are QoS 0/nonretained, bounded to best-effort connected publication, with automatic reports capped at 50 per second. Discovery can precede HA's first subscription and lose the first event. Reconnect and HA birth restore configs/health without replaying events.

The stream observes the processor, including supported reports it exposes for CCA/CCX devices; it is not RF sniffing and does not promise complete radio/device coverage or infer radio family. No new hardware is needed for IPL. Independent RF capture would need suitable separate radio hardware and tooling.

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

For v0.1.0, the [initial GitHub CI run](https://github.com/thetimetraveler/lutron-ipl-app/actions/runs/37276359612) passed all 70 tests, typecheck, bundle consistency, and ARM64/AMD64 container image builds. This verifies v0.1.0 image construction, not installation or runtime behavior on Green, and is not verification of v0.2.0.

Offline parser, transport, publisher, and packaging tests are the local checks. Packaging tests use an isolated synthetic runtime so they can verify staging without connecting to any household device. Offline checks do not establish live HA/MQTT behavior or physical-device coverage; deployment validation is separate. No extra physical-device tests are prerequisites. Earlier deployment notes and CI results do not validate these new event families. Declared architectures and the pinned base's architecture metadata do not constitute hardware testing.

See [design and verification requirements](docs/design.md) and [third-party notices](THIRD_PARTY.md).
