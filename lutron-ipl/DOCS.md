# Install Lutron IPL Events on Home Assistant OS

This experimental app observes authenticated IPL UI telemetry and publishes MQTT event entities. Green / `aarch64` is the primary packaging target, with `amd64` also declared. Container and Green deployment have not yet been validated locally.

## Install from the GitHub App store repository

1. Open Settings → Apps → App store → menu → Repositories (older HA releases say Add-ons). Add **`https://github.com/thetimetraveler/lutron-ipl-app`** and refresh the store.
2. Find **Lutron IPL Events** and install it. Supervisor builds the complete packaged app for your machine; no developer tools or manual source transfer are needed. This is an HA OS background app, not a HACS custom integration. Start remains manual by default.
3. Open this app's information and copy its **exact full slug**. A GitHub repository installation has a generated repository prefix, so its credential directory is **`/addon_configs/<repository-id>_lutron-ipl`**, with the actual full slug replacing the placeholder. Do not use `local_lutron-ipl` for a GitHub installation or guess the prefix.
4. Put `ipl_client_cert.pem`, `ipl_client_key.pem`, and `processor_ca.pem` in that directory using Samba's addon_configs share or an HA SSH app with access. Supervisor mounts the app's separate directory **read-only at `/config` inside the container**. These are existing project/SubSystem-CA IPL credentials, distinct from normal HA LEAP pairing credentials. Never place credentials in the repository, package/image, or examples. Missing, invalid, expired, mismatched, or unreadable credentials fail before connecting; automatic renewal is not provided.
5. Install/configure an MQTT broker and HA's MQTT integration. Leave `mqtt_url` empty to discover a Supervisor MQTT-service app, or configure an explicit broker (which takes precedence). Configure `processor_host` and your `mappings` in the app's Configuration tab, review the options below, save, and start. Inspect logs and entities. No HA API token, USB/radio hardware, privileged access, or host networking is needed.

The generated credential prefix and `/config` mount are described in [HA's app configuration guidance](https://developers.home-assistant.io/docs/apps/configuration/).

## Alternate local installation

1. On your build computer, run `npm ci` and `npm run stage` from this repository. Transfer the **contents** of `build/lutron-ipl` to `/addons/lutron-ipl` on the HA OS machine, using the Samba addons share or an HA SSH app. Keep the packaged directory self-contained. No Git repository or published image is required.
2. Open Settings → Apps (called Add-ons on some HA releases), open the store, and reload/check for updates using its menu. Find the local **Lutron IPL Events** app and install it. The app starts manually by default.
3. Put these existing IPL credentials in **`/addon_configs/local_lutron-ipl`** using the Samba addon_configs share or an SSH app with access to that directory:

   ```text
   ipl_client_cert.pem
   ipl_client_key.pem
   processor_ca.pem
   ```

   Supervisor mounts this separate directory **read-only at `/config` inside the app**. These are project/SubSystem-CA IPL credentials, distinct from normal HA LEAP pairing credentials. Never copy them into `/addons/lutron-ipl`, the staged package, the image, or examples. Limit private-key file access to the app/operator. Invalid, expired, mismatched, missing, or unreadable credentials fail before connecting; automatic credential renewal is not provided.
4. Install/configure an MQTT broker and the HA MQTT integration. An HA MQTT-service app such as Mosquitto can provide Supervisor service discovery. Leave `mqtt_url` empty for that path, or configure an explicit broker (which takes precedence). Missing discovered MQTT keeps the app offline and retrying; it does not publish elsewhere.
5. In this app's Configuration tab, set `processor_host` and your `mappings`, review the options below, then save and start. Check its logs and MQTT discovery in HA. The app requests only Supervisor MQTT-service access, ordinary networking, and its separate read-only config mount. It does not require an HA API token, USB/radio hardware, host networking, or privileged access.

The local app code path and separate credential path follow [HA's local app tutorial](https://developers.home-assistant.io/docs/apps/tutorial/) and [app configuration guidance](https://developers.home-assistant.io/docs/apps/configuration/).

## Options

The configuration is flat except for the `mappings` array. `examples/options.json` is a complete synthetic example. HA writes the real options to `/data/options.json`; the writable `/data` also stores only the app-owned discovery inventory. Credential and data directories are controlled by the environment, not exposed as options.

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
| `publish_debug` | `false`; opt-in unretained decoded frames for **all observed IPL objects**, beyond the UI allowlist. May expose sensitive system metadata; drops under rate/backpressure limits. |
| `mappings` | `[]`; each entry has stable `id`, nonblank display `name` (up to 160 characters), numeric `device_id`, and numeric `ui_object_id` (each 1–4294967295). IDs/UI objects must be unique. Use observed UI object IDs, not zone IDs. |

Mapping/instance identifiers begin with a letter or digit and contain only letters, digits, `_` or `-`, up to 64 characters. Topic paths contain letters, digits, `_` or `-` in nonempty `/`-separated segments; wildcards and NULs are rejected.

Changing a mapping's display name preserves its identity; changing its stable identifier creates a different entity. Removed mapping discovery is cleared within this app's persisted ownership inventory. Preserve the namespace/instance when updating to allow that cleanup.

## TLS boundary

By default OpenSSL verifies the processor's certificate **chain against your explicit CA**, using `-CAfile` and `-verify_return_error`. It does **not** verify that the configured IP/hostname identifies a particular processor. A trusted chain alone is not processor identity verification. The configured network address is never invented as an expected certificate identity.

If you know the certificate's expected DNS name or IP, set the corresponding expected identity option. OpenSSL then uses `-verify_hostname` or `-verify_ip`, and a mismatch fails closed. See [OpenSSL verification options](https://docs.openssl.org/3.0/man1/openssl-s_client/). Broker TLS configured with `mqtts://` is separate from this IPL certificate setup.

## Inspecting entities and MQTT

Once MQTT is connected, discovery defines an event entity for each configured mapping, plus an **IPL connection** diagnostic binary sensor. Copy the actual entity ID from HA when writing an automation; do not infer it from its display name. Event availability requires MQTT and healthy IPL; the diagnostic sensor can still report IPL disconnected while MQTT works. IPL becomes healthy only after a valid inbound frame.

For an instance `example`, inspect `lutron_ipl/example/#` using the HA MQTT integration's listen-to-topic tool. Discovery is under `homeassistant/event/.../config` and `homeassistant/binary_sensor/.../config`. Exact event topic: `lutron_ipl/example/<mapping-id>/event`; current app availability: `lutron_ipl/example/availability`; IPL status: `lutron_ipl/example/ipl_health`. Optional debug uses `lutron_ipl/example/debug`.

Events contain `event_type: level_adjustment`, `source_kind: ui_level_report`, `level` (percentage), `wire_value`, `device_id`, `ui_object_id`, `received_at`, and a per-connection `session_id`. HA's event entity records its last received event and attributes; see [MQTT event documentation](https://www.home-assistant.io/integrations/event.mqtt/).

Discovery and current health are retained. Events/debug are QoS 0, **never retained**, and delivered best effort: disconnected or congested publications are dropped. MQTT reconnect/HA birth republishes discovery and current health, never buffered old events. Neither duplicate-free nor guaranteed delivery is promised.

## Experimental UI-source semantics

Only matching UI-Level telemetry becomes an event. Generic zone levels are not converted into touch events. `level_adjustment` describes observed telemetry; touch start/release, continuous reporting, same-level touches, and compatibility across device types remain unverified. Repeated reports of the same percentage are preserved when received.

The app does not request UI state. An unsolicited initial/cached processor report after reconnect cannot be distinguished from a fresh adjustment. `received_at` is the app receipt timestamp, **not a physical-gesture timestamp**. The app's no-replay behavior concerns its own/MQTT buffering and cannot prove freshness of processor-side reports.

The disabled `examples/automation.yaml` is an **opt-in** starting point: replace both placeholder entities, review the target behavior, and enable it yourself. Its state-event readiness checks reject missing/unknown/unavailable states and irrelevant attributes before using the received `level`. They do not establish gesture freshness; cached startup/reconnect reports can still act on a light. No automations are installed or enabled by the app. The service cannot override Sunnata's local touch behavior or animate its LEDs. Diagnostic IPL Pings are its only outbound IPL messages.

## App-only rollback

Disable any automation you created from the example, then stop Lutron IPL Events and disable its start-on-boot option if enabled. Before a GitHub app update, create a backup that includes this app; restore just that app from the backup to revert. For the alternate local installation, stop the app, restore your saved previous `/addons/lutron-ipl` package, reload the local store, and rebuild/reinstall that app. Uninstalling removes app-owned runtime data; save its discovery inventory before reinstalling if you need later stale-entity cleanup.

If removing the app permanently, inspect its actual retained discovery configs/unique IDs and delete **only this instance's** event/diagnostic configs with retained empty MQTT payloads, or remove its entities in HA. Never purge an entire shared discovery prefix. Uninstall this app; optionally delete only its exact `/addon_configs/<full-app-slug>` credential folder after confirming backups/private-key retention needs. For a local installation, the paths are `/addons/lutron-ipl` and `/addon_configs/local_lutron-ipl`. Leave the broker, HA MQTT integration, other apps, and all Lutron programming untouched.
