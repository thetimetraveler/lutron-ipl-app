# Independent review: IPL events app

Reviewer: `/root/ipl_app_design_review`, explicitly requested by the user.

Target: Home Assistant Green running HA OS. Review covered the design, existing repository parser/MQTT/packaging code, and current official documentation. The reviewer did not edit files, connect to household devices, or request physical tests.

The initial architecture was considered suitable, with three P1 design gaps to resolve before approval. References to line numbers in the original review referred to the initial 59-line design; the revised design has expanded sections.

## Findings and disposition

1. **P1: Exact HA OS installation and credential path missing.** Resolved in Configuration and credentials / Packaging: slug `lutron-ipl`; staged app at `/addons/lutron-ipl`; separate host credential directory `/addon_configs/local_lutron-ipl`, read-only `addon_config` mapped at `/config`; explicit Supervisor MQTT-service declaration, timeout and retry; ordinary container networking. No root HA configuration/USB/privileged mount copied from previous apps.

2. **P1: TLS chain validation was ambiguous about endpoint identity.** Resolved by documenting default capture-compatible chain-only verification explicitly. This does not authenticate the configured address as a particular processor. Optional expected DNS/IP verification is specified, with failure closed and no guessed identity. No new live identity check was made in this review.

3. **P1: No-replay wording overstated input freshness.** Resolved by limiting the guarantee to app/MQTT buffering. Initial/cached processor UI reports remain indistinguishable from fresh adjustments; payloads carry receipt time, session ID and `source_kind: ui_level_report`. Entity semantics remain experimental UI telemetry. The app does not request UI state or enable automations; no arbitrary startup delay is claimed to prove freshness.

4. **P2: Existing parser is too permissive for a persistent app.** Resolved as an implementation acceptance requirement: strict wrapper for versions 1-3, known message types, exact magic boundaries, fragmented and Resend headers, bounded pending bytes and independent incomplete-frame timeout. Existing parser reuse means decoding/layout reuse, not accepting its resynchronization behavior unchanged.

5. **P2: Existing MQTT defaults do not meet this lifecycle contract.** Resolved as an implementation acceptance requirement: clean sessions, explicit `queueQoSZero: false`, connected gate and bounded publication; discovery from configured mappings, offline initial IPL health, HA birth subscription, retained health/discovery refresh without event replay. Existing sink already gates disconnected publishes; the remaining risk is a disconnect race/default queueing, not a claim it deliberately buffers every offline event.

6. **P2: Packaging must run independently of the checkout.** Resolved as an implementation acceptance requirement: allowlisted complete staging, pinned multi-architecture base, explicit OpenSSL installation, compiled JS or locked transpiler, minimal locked dependencies, current HA labels and manifest. Existing packaging is only a precedent and is not evidence this new app runs on Green.

Optional improvements incorporated: owned discovery inventory and removal cleanup, bounded debug publication, and explicit distinction between all-object debug data and allowlisted normal events. Percentage deduplication is prohibited; distinguishing explicit wire retransmissions may be implemented only without suppressing separate equal-level reports.

## Evidence boundaries and next step

The saved household capture verifies earlier successful IPL authentication and five target UI-Level reports. It does not validate a generalized touch classifier, fresh gesture boundaries, continuous sliding, LED control, or this app's Green deployment. Tests for those unsupported claims are not prerequisites for the observational app.

Changes above resolve design gaps on paper; product implementation and its acceptance checks remain outstanding.

## Final reviewer verdict

The same reviewer read the revised design and returned: **Approved for implementation.** All three P1 blockers were resolved and the P2 acceptance requirements were captured. The reviewer found no unresolved material design gaps.

This is independent technical approval of the observational app design, not evidence that product code, image builds, live Green installation, or MQTT delivery have been completed. No further physical gesture tests are prerequisites.

## Primary references

- [HA app configuration](https://developers.home-assistant.io/docs/apps/configuration/)
- [Local app installation](https://developers.home-assistant.io/docs/apps/tutorial/)
- [Supervisor services](https://developers.home-assistant.io/docs/apps/communication/)
- [OpenSSL verification options](https://docs.openssl.org/3.0/man1/openssl-s_client/)
- [HA MQTT discovery lifecycle](https://www.home-assistant.io/integrations/mqtt/#discovery-messages-and-availability)
- [MQTT.js options](https://github.com/mqttjs/MQTT.js)
