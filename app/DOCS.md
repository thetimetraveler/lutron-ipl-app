# Install Lutron IPL Events on Home Assistant OS

This experimental app observes the authenticated processor IPL stream and publishes MQTT event entities for manual UI mappings and optional passive discovery of supported objects. Green / `aarch64` is the primary packaging target, with `amd64` also declared. Offline checks do not establish live HA/MQTT behavior or physical-device coverage; deployment validation is separate. No extra physical-device tests are prerequisites.

## Install from the GitHub App store repository

1. Open Settings → Apps → App store → menu → Repositories (older HA releases say Add-ons). Add **`https://github.com/thetimetraveler/lutron-ipl-app`** and refresh the store.
2. Find **Lutron IPL Events** and install it. Supervisor builds the complete packaged app for your machine; no developer tools or manual source transfer are needed. This is an HA OS background app, not a HACS custom integration. Start remains manual by default.
3. Open this app's information and copy its **exact full slug**. A GitHub repository installation has a generated repository prefix, so its credential directory is **`/app_configs/<full-app-slug>`**, with the actual full slug replacing the placeholder. Do not use `local_lutron-ipl` for a GitHub installation or guess the prefix.
4. Put `ipl_client_cert.pem`, `ipl_client_key.pem`, and `processor_ca.pem` in that directory using an exposed app-config file share or an HA Terminal/SSH app with access. Supervisor mounts the app's separate directory **read-only at `/config` inside the container**. These are existing project/SubSystem-CA IPL credentials, distinct from normal HA LEAP pairing credentials. Never place credentials in the repository, package/image, or examples. Missing, invalid, expired, mismatched, or unreadable credentials fail before connecting; automatic renewal is not provided.
5. Install/configure an MQTT broker and HA's MQTT integration. Leave `mqtt_url` empty to discover a Supervisor MQTT-service app, or configure an explicit broker (which takes precedence). Configure `processor_host`, MQTT, and either your `mappings` or opt-in `auto_discover` in the app's Configuration tab, review the options below, save, and start. Inspect logs and entities. No HA API token, USB/radio hardware, privileged access, or host networking is needed.

Current HA installations expose the app credential folder as `/app_configs/<full-app-slug>`; older tools/documentation use `/addon_configs/<full-app-slug>` (for a repository install, `/addon_configs/<repository-id>_lutron-ipl`). Use the folder exposed by your installation and its exact slug. The manifest retains the compatible `addon_config` mount type and maps it read-only to `/config`, as described in [HA's app configuration guidance](https://developers.home-assistant.io/docs/apps/configuration/).

## Alternate local installation

1. On your build computer, run `npm ci` and `npm run stage` from this repository. Transfer the **contents** of `build/lutron-ipl` to `/addons/lutron-ipl` on the HA OS machine, using the Samba addons share or an HA SSH app. Keep the packaged directory self-contained. No Git repository or published image is required.
2. Open Settings → Apps (called Add-ons on some HA releases), open the store, and reload/check for updates using its menu. Find the local **Lutron IPL Events** app and install it. The app starts manually by default.
3. Put these existing IPL credentials in **`/app_configs/local_lutron-ipl`** using an exposed app-config file share or an SSH app with access to that directory:

   ```text
   ipl_client_cert.pem
   ipl_client_key.pem
   processor_ca.pem
   ```

   Supervisor mounts this separate directory **read-only at `/config` inside the app**. These are project/SubSystem-CA IPL credentials, distinct from normal HA LEAP pairing credentials. Never copy them into `/addons/lutron-ipl`, the staged package, the image, or examples. Limit private-key file access to the app/operator. Invalid, expired, mismatched, missing, or unreadable credentials fail before connecting; automatic credential renewal is not provided.
4. Install/configure an MQTT broker and the HA MQTT integration. An HA MQTT-service app such as Mosquitto can provide Supervisor service discovery. Leave `mqtt_url` empty for that path, or configure an explicit broker (which takes precedence). Missing discovered MQTT keeps the app offline and retrying; it does not publish elsewhere.
5. In this app's Configuration tab, set `processor_host` and your manual `mappings` or opt-in `auto_discover`, review the options below, then save and start. Check its logs and MQTT discovery in HA. The app requests only Supervisor MQTT-service access, ordinary networking, and its separate read-only config mount. It does not require an HA API token, USB/radio hardware, host networking, or privileged access.

The local app code path and separate credential path follow [HA's local app tutorial](https://developers.home-assistant.io/docs/apps/tutorial/) and [app configuration guidance](https://developers.home-assistant.io/docs/apps/configuration/).

## Options

The configuration is flat except for the `mappings` and `name_overrides` arrays. `examples/options.json` is a complete synthetic example. HA writes the real options to `/data/options.json`; the writable `/data` also stores app-owned discovery topics and bounded numeric object descriptors, without event payloads, receipt timestamps, or last values. Credential and data directories are controlled by the environment, not exposed as options.

| Option | Default / meaning |
| --- | --- |
| `processor_host` | Required: your reachable processor IP or DNS host; default empty. |
| `processor_port` | `8902`; IPL TLS port, integer 1–65535. |
| `client_cert`, `client_key`, `ca_cert` | `ipl_client_cert.pem`, `ipl_client_key.pem`, `processor_ca.pem`; relative to read-only `/config`. Paths/symlinks escaping it are rejected. |
| `expected_server_name` | Empty by default; optionally require a known certificate DNS identity. |
| `expected_server_ip` | Empty by default; optionally require a known certificate IP identity. Use one expected identity option, based on the certificate. |
| `mqtt_url` | Empty uses Supervisor service discovery; explicit `mqtt://broker.example.invalid:1883` or `mqtts://...` overrides it. |
| `mqtt_username`, `mqtt_password` | Empty by default; for an explicit broker. Password is masked in HA's configuration schema and excluded from logs. |
| `instance_id` | `default`; stable identifier. Use distinct namespaces/instances for independent installations. |
| `base_topic` | `lutron_ipl`; app publication namespace, without wildcards. |
| `discovery_prefix` | `homeassistant`; must match the HA MQTT integration. |
| `ha_birth_topic` | `homeassistant/status`; the HA online notification topic. |
| `auto_discover` | `false`; opt-in passive discovery of supported observed IPL objects. No polling. Manual UI mappings suppress matching automatic UI entities. |
| `max_discovered_objects` | `128`; integer 1–256, limits admission of new automatic objects. Previously discovered objects remain if you lower the cap, up to the global 256-object bound. |
| `metadata_file` | Empty; optional private JSON snapshot relative to `/config`, loaded at startup. Naming only; does not create entities or query the processor. |
| `name_overrides` | `[]`; exact `system_id`, `object_type`, `object_id`, and `name` entries override imported names for automatic entities. Supported object types only; duplicate identities and control characters are rejected. |
| `publish_debug` | `false`; opt-in unretained decoded frames for **all observed IPL objects**, beyond the UI allowlist. May expose sensitive system metadata; drops under rate/backpressure limits. |
| `mappings` | `[]`; each entry has stable `id`, nonblank display `name` (up to 160 characters), numeric `device_id`, and numeric `ui_object_id` (each 1–4294967295). IDs/UI objects must be unique. Use observed UI object IDs, not zone IDs. |

Mapping/instance identifiers begin with a letter or digit and contain only letters, digits, `_` or `-`, up to 64 characters. Topic paths contain letters, digits, `_` or `-` in nonempty `/`-separated segments; wildcards and NULs are rejected.

Changing a mapping's display name preserves its identity; changing its stable identifier creates a different entity. Removed mapping discovery is cleared within this app's persisted ownership inventory. Preserve the namespace/instance when updating to allow that cleanup.

## Naming discovered objects

Automatic names use this priority: `name_overrides`, imported metadata, generic numeric IPL name. Existing manual mapping names remain authoritative. Names affect only MQTT discovery display labels; discovery topics, unique IDs, event topics, grouping, and event payloads stay the same. Objects missing from a snapshot keep generic names. Metadata never admits silent objects or changes the discovery cap. HA user-customized names may take precedence over integration names; existing entity IDs are preserved.

Example with invented IDs:

```yaml
metadata_file: object-metadata.json
name_overrides:
  - system_id: 7
    object_type: 15
    object_id: 9001
    name: Kitchen ceiling lights
```

Put `object-metadata.json` in `/app_configs/<full-app-slug>` alongside the separately stored credentials, then save options and restart the app. The app reads it through its existing read-only `/config` mount. Restart after replacing a snapshot. Missing/invalid metadata logs a fixed error category and falls back to overrides/generic names without stopping observation. Remove the filename and restart to remove imported names; this does not remove entities. The snapshot is not watched or refreshed automatically.

```json
{"version":1,"source":"designer","generated_at":"2026-10-05T00:00:00Z","objects":[{"system_id":7,"object_type":15,"object_id":9001,"name":"Ceiling lights","area_name":"Kitchen"}]}
```

`version` and `objects` are required; `source: designer` and `generated_at` are optional provenance. Each object requires the full numeric identity and a nonblank `name` of at most 160 characters; optional `area_name` has the same limit. Imported labels render as `area_name / name`. Snapshot limits are 1 MiB and 4096 records. Unknown fields/types, duplicate composite identities, control characters, nonregular files, and symlinks beneath the config root are rejected. No credentials, radio keys, addresses, event history, MQTT topics, or arbitrary device fields belong in the snapshot. Numeric discovery descriptors remain the only persisted object inventory.

To generate metadata from a Designer project, use the repository's SELECT-only [query template](https://github.com/thetimetraveler/lutron-ipl-app/blob/main/tools/designer-names.sql). Verify the active project matches your processor and check the schema before running it. Save its JSON result privately as `rows.json`. The template covers areas, area-associated occupancy groups, shade groups, zones, dimmer UIs, keypad buttons and load-controller lookup relationships; unmatched families retain generic names. Do not infer IDs by arithmetic or substitute a physical device ID for a UI ID. With repository development dependencies installed, run:

```sh
node --import tsx tools/import-designer-names.ts --input rows.json --output object-metadata.json --system-id 7
```

Replace `7` with the verified IPL system ID for this project/processor. The tool requires explicit binding, validates the curated fields, creates a fresh mode-0600 file, and refuses overwrite. Keep both input and output private. After project edits, export a fresh snapshot. The app does not check project freshness against the processor or pair to LEAP.

## TLS boundary

By default OpenSSL verifies the processor's certificate **chain against your explicit CA**, using `-CAfile` and `-verify_return_error`. It does **not** verify that the configured IP/hostname identifies a particular processor. A trusted chain alone is not processor identity verification. The configured network address is never invented as an expected certificate identity.

If you know the certificate's expected DNS name or IP, set the corresponding expected identity option. OpenSSL then uses `-verify_hostname` or `-verify_ip`, and a mismatch fails closed. See [OpenSSL verification options](https://docs.openssl.org/3.0/man1/openssl-s_client/). Broker TLS configured with `mqtts://` is separate from this IPL certificate setup.

## Inspecting entities and MQTT

### Event Explorer

Start the app and click **Open Web UI** on its information page. Optionally enable **Show in sidebar** for an **IPL Events** shortcut. Home Assistant authenticates the Ingress page; the app exposes no host port and needs no separate UI password or HA API token. Its internal HTTP server accepts only the Supervisor Ingress socket peer and local loopback, never an address supplied in a proxy header. See [HA Ingress requirements](https://developers.home-assistant.io/docs/apps/presentation/#ingress).

Use the room rail and Controls, Loads, Scenes, Occupancy or Shades filters, then search by name, identity or event type. **Objects** includes configured manual mappings and admitted/restored automatic objects even when they have no recent report. Manual mappings appear immediately; quiet automatic objects restore when broker lookup succeeds and the publisher initializes. **Unnamed** isolates objects with generic fallback names. Room grouping uses validated imported `area_name` metadata; a name override changes the label without guessing a new room. Manual mappings keep their existing name and remain unassigned until an exact system/UI identity supports room lookup. No silent metadata objects are admitted by the explorer.

Select a report or object for supported event types, numeric identity, MQTT topic and the latest structured payload. **Pause** freezes the display while reports continue to be collected. **Changes only** hides repeated values in the view; it does not drop or transform MQTT events. Session changes provide reconnect context, not proof that a report is a fresh physical action. Scene selection and area-lighting values remain numeric unless their meaning has been independently established.

The explorer retains at most **1000 structured reports in process memory** for display, plus the latest report for each bounded object. It writes no event history to disk, clears on app restart, and never feeds old reports into MQTT or automations. History includes supported reports for admitted objects while MQTT is unavailable or publication is dropped. Publication status describes whether an MQTT publication attempt was accepted, not whether HA received it. Initial discovery can still precede HA subscription and lose an event. Buffer gaps, reconnects and process restarts are shown as browsing context.

Copy an exact **MQTT trigger** or a **disabled example automation** from object details, choosing the specific supported event type. The trigger filters the JSON `event_type` on that object's topic; these names are not automatically HA event-bus events. Replace any example target/action, review repeated/cached report behavior and potential control loops, then install and enable the automation yourself. Copying never modifies HA. If clipboard access is denied on HTTP, select and copy the displayed text manually.

Once MQTT is connected, discovery defines an event entity for each configured mapping and, with `auto_discover: true`, each supported observed object admitted under the cap, plus an **IPL connection** diagnostic binary sensor. Copy the actual entity ID from HA when writing an automation; do not infer it from its display name. Event availability requires MQTT and healthy IPL; the diagnostic sensor can still report IPL disconnected while MQTT works. IPL becomes healthy only after a valid inbound frame.

For an instance `example`, inspect `lutron_ipl/example/#` using the HA MQTT integration's listen-to-topic tool. Discovery is under `homeassistant/event/.../config` and `homeassistant/binary_sensor/.../config`. Exact event topic: `lutron_ipl/example/<mapping-id>/event`; current app availability: `lutron_ipl/example/availability`; IPL status: `lutron_ipl/example/ipl_health`. Automatic object events use `lutron_ipl/example/auto/<descriptor-id>/event`, where the descriptor ID is `auto_s<S>_t<T>_o<O>` for system, type, and object number. Automatic discovery uses a separate node under `homeassistant/event/<unique-prefix>auto/<descriptor-id>/config`, and unique IDs contain `auto:<descriptor-id>` so manual mapping IDs cannot collide. Optional debug uses `lutron_ipl/example/debug`.

Manual UI events contain `event_type: level_adjustment`, `source_kind: ui_level_report`, `level` (percentage), `wire_value`, `device_id`, `ui_object_id`, `received_at`, and a per-connection `session_id`. HA's event entity records its last received event and attributes; see [MQTT event documentation](https://www.home-assistant.io/integrations/event.mqtt/).

Discovery and current health are retained. Events/debug are QoS 0, **never retained**, and delivered best effort: disconnected or congested publications are dropped. MQTT reconnect/HA birth republishes discovery and current health, never buffered old events. Automatic report publication is also capped at 50 per second and uses bounded socket/inflight backpressure; dropped observations are counted. A discovery config can arrive before HA subscribes to the first event, so that event can be missed. The app does not replay it to compensate. Neither duplicate-free nor guaranteed delivery is promised.

## Passive discovery and supported observations

Enable `auto_discover` to create an MQTT event entity only after a supported report or command observation identifies an object. No metadata import, Designer export, or active object scan is required for passive discovery. **Silent objects cannot be discovered passively.** Without naming overrides or a private metadata import, names are generic IPL descriptions with numeric system/type/object identity; device, room, component, and radio-family associations are not inferred. Identities stay stable across restarts and are distinct across systems and object types. A manual mapping preserves its existing ID/name/event contract and suppresses the matching automatic type-9 UI entity, including a restored descriptor.

| Observed object type | Event types and decoded fields |
| --- | --- |
| 57 | `button_press_report`; `button_release_report` with opaque `trailing_hex`. These are processor reports, not proof of RF delivery or physical timing. |
| 38, 66 | `occupancy_report` from supported IPL event and runtime-property reports, with numeric `status` and optional opaque `trailing_hex`. |
| 2 | Runtime `occupancy_report`; `scene_selection_report` with numeric `selection`; `area_lighting_report` with numeric `state`. |
| 9 | `ui_level_report` from runtime Level property 1. Manual mappings keep `level_adjustment` and their original `source_kind: ui_level_report`. |
| 15 | `zone_level_report` from runtime Level property 1; `go_to_level_observed` from a supported GoToLevel command shape. |
| 3 | `load_level_report` from runtime Level property 1; `current_level_report` from property 4. |
| 198 | `shade_level_report` from runtime Level property 1. |
| 133 | `scene_selection_report` with numeric `selection` from runtime property 67. |

Automatic event payloads include `event_type`, `source_kind` (`ipl_event_report`, `runtime_property_report`, or `ipl_command_observation`), `system_id`, `object_type`, `object_id`, `operation_id`, `property_number` when applicable, `received_at`, and `session_id`, plus the decoded fields above. Occupancy status names are known for 1 (`unknown`), 3 (`occupied`), 4 (`unoccupied`), and 255 (`disabled`); other numeric statuses are preserved without interpretation. Scene selections and area-lighting states stay numeric; no scene names or sentinel meanings are guessed. Levels include `wire_value` and rounded percentage `level`, accepting wire values through `0xfeff`.

`go_to_level_observed` includes `level`, `wire_value`, numeric `originator_feature`, `fade_quarters`, and `delay_quarters`. It means a command was visible in the processor stream; it does not establish the original client, RF delivery, device execution, or physical outcome. Unsupported properties, object types, widths, operation 38, RPC, and configuration messages create no semantic entity or event. Optional debug can still expose the frame.

The app persists only validated numeric descriptors, with bounded file size/count, symlink/corruption rejection, and atomic private-file writes. Quiet discovered objects keep their configs across restarts, HA birth, and broker reconnect. Disabling automatic discovery removes only this instance's owned automatic configs; manual entities remain. Reaching the admission cap stops new objects while existing entities continue publishing. Lowering the cap preserves previously discovered objects rather than deleting them.

## CCA/CCX observation boundary

IPL is a processor-level authenticated network stream. It can expose supported reports associated with Clear Connect Type A (CCA) and Type X (CCX) devices when the processor makes them available. The app does not sniff either RF channel, assign a radio family from an IPL object, discover every enrolled device, or guarantee complete event coverage. No new hardware is required for this IPL listener. Independent RF capture would require suitable separate radio hardware and protocol tooling and is outside this app.

## Experimental UI-source semantics

For manual mappings, only matching UI-Level telemetry becomes a `level_adjustment` event. Generic zone levels are not converted into touch events. `level_adjustment` describes observed telemetry; touch start/release, continuous reporting, same-level touches, and compatibility across device types remain unverified. Repeated reports of the same percentage are preserved when received.

The app does not request UI state. For every supported family, unsolicited initial/cached processor reports after startup or reconnect cannot be distinguished from fresh physical actions. Repeated reports are preserved when received; they need not represent separate actions. `received_at` is the app receipt timestamp, **not a physical-action timestamp**. The app's no-replay behavior concerns its own/MQTT buffering and cannot prove freshness of processor-side reports.

The disabled `examples/automation.yaml` is an **opt-in** starting point: replace both placeholder entities, review the target behavior, and enable it yourself. Its state-event readiness checks reject missing/unknown/unavailable states and irrelevant attributes before using the received `level`. They do not establish gesture freshness; cached startup/reconnect reports can still act on a light. No automations are installed or enabled by the app. The service cannot override Sunnata's local touch behavior or animate its LEDs. Diagnostic IPL Pings are its only outbound IPL messages.

## App-only rollback

Disable any automation you created from the example, then stop Lutron IPL Events and disable its start-on-boot option if enabled. Before a GitHub app update, create a backup that includes this app; restore just that app from the backup to revert. For the alternate local installation, stop the app, restore your saved previous `/addons/lutron-ipl` package, reload the local store, and rebuild/reinstall that app. Uninstalling removes app-owned runtime data; save its discovery inventory before reinstalling if you need later stale-entity cleanup.

If removing the app permanently, inspect its actual retained discovery configs/unique IDs and delete **only this instance's** manual/automatic event and diagnostic configs with retained empty MQTT payloads, or remove its entities in HA. Never purge an entire shared discovery prefix. Uninstall this app; optionally delete only its exact `/app_configs/<full-app-slug>` credential folder (or its older `/addon_configs` alias) after confirming backups/private-key retention needs. For a local installation, the paths are `/addons/lutron-ipl` and `/app_configs/local_lutron-ipl` (older installations may expose `/addon_configs/local_lutron-ipl`). Leave the broker, HA MQTT integration, other apps, and all Lutron programming untouched.
