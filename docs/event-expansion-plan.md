# Automatic IPL event discovery

## Spec

Expand the existing read-only app using offline capture evidence. Enable optional `auto_discover` (default false) and `max_discovered_objects` (default 128, range 1-256). Discover only supported observed IPL objects, with stable identities incorporating system ID, object type and object ID. Preserve explicit UI mappings and their identities; suppress the matching automatic UI entity. Generic names describe IPL objects rather than inventing device or room names. Silent objects cannot be discovered passively. No metadata import is required for this release.

Only Ping remains outbound. No physical tests, lighting/LED/programming/automation changes. No private captures, addresses, IDs, credentials or household names in committed artifacts. All tests use synthetic identities. Preserve strict framing/TLS, availability, QoS0, nonretained events, no offline event buffering or reconnect replay.

Decode exact shapes, big endian common prefix object u32/type u16:

- Event msgType3 op0/type57/body6: button_press_report; op1/type57/body8: button_release_report, last two bytes opaque `trailing_hex`.
- Event3/op6/type38/body7 or type66/body9: occupancy_report, numeric status at6, optional trailing_hex. Preserve unknown statuses; known 1 unknown,3 occupied,4 unoccupied,255 disabled.
- Telemetry5/op1: property byte6. Type9/15/3/198 prop1 u16, type3 prop4 u16 (exact9body): ui_level_report/zone_level_report/load_level_report/shade_level_report/current_level_report. Level <=0xfeff, convert round(wire*100/0xfeff).
- Runtime type38/2/66 prop16 exact8body: occupancy_report. Type2/133 prop67 exact9body: scene_selection_report with numeric selection, no sentinel/name guess. Type2 prop91 exact8body: area_lighting_report with numeric state.
- Command0/op13/type15 exact14body: go_to_level_observed, level@6 u16 <=0xfeff, originator_feature@8 u16, fade_quarters@10 u16, delay_quarters@12 u16. Never claims RF delivery, execution or original client.
- Unknown op38, RPC, configs, unsupported properties/types/widths produce no semantic entity or event.

Observation includes event_type, source_kind (ipl_event_report/runtime_property_report/ipl_command_observation), system_id, object_type, object_id, operation_id, property_number when applicable, received_at and session_id, plus decoded fields. UI generic event uses ui_level_report event_type but manual mapping retains level_adjustment contract. No inferred device_id, component number or radio family.

Fixed event_types per object type cover all supported signals. Descriptor includes numeric identity only; derive stable id/name/event_types from validated descriptor, never trust persisted topics/names. Bound persisted descriptor file size/count, reject symlinks/corrupt inventory, atomically write mode0600. Persist descriptors only (no payload, timestamps or last value), keep quiet objects across restarts, HA birth and reconnect. Disabled auto discovery cleans its owned configs; never another instance. Cap stops new entities while existing entities continue. Add droppedObservations counters and bound automatic report publication to50/sec as well as existing socket/inflight limits. Config may precede first report before HA subscribes; no replay to compensate. Explicit mappings suppress automatic UI duplicates including restored descriptors.

Automatic configs use separate discovery node ID (`event/<uniquePrefix>auto/<descriptor.id>/config`), unique ID `<uniquePrefix>auto:<descriptor.id>` and state topic `<root>/auto/<descriptor.id>/event` to avoid collision with any legal manual mapping ID. Identity validation allows system0..65535 and object1..u32max, supported type whitelist only. Persisted duplicates invalidate entire registry. Lowering cap preserves previously discovered objects (up to global256 bound) while refusing new admissions. Repeated reports and processor startup/cache reports are possible for all families; receipt time is not physical action time. HA discovery node syntax verified against official https://www.home-assistant.io/integrations/mqtt/#discovery-topic .

## Tasks and ownership

1. Decoder: `src/observations.ts`, `test/observations.test.ts`. Implement `decodeObservation(frame,sessionId,receivedAt?): ObservationEvent|null`, `validateObservedObject(input:unknown): ObservedObject|null` (only exact numeric identity keys), `describeObject(object:ObservedObject): {id:string,name:string,eventTypes:string[]}|null` (ID `auto_s<S>_t<T>_o<O>`, fixed labels and event types by supported type). Shared types are coordinator-owned `src/contracts.ts`.
2. Discovery/integration: `src/mqtt.ts`, `src/config.ts`, `src/runtime.ts`, `src/main.ts`, associated tests. Implement auto registry, persistence/owned cleanup/backpressure and route decoded events. Preserve all current tests/backcompat. AppConfig new fields optional at TypeScript boundary for existing embedders, parser supplies defaults; Publisher publishObservation optional for compatibility with legacy mock/consumer implementations; runtime decoder dependency optional.
3. Release/docs: app manifest, examples, docs/README/CHANGELOG, package metadata v0.2.0 and regenerated complete `lutron-ipl/`; verify tests/typecheck/build/stage and package byte equality. Public docs must explain passive discovery and CCA/CCX processor observation versus RF sniffing. Deployment is separately authorized by user's setup and automatic event support request.

Tasks1/2 may run concurrently after shared types. Task2 consumes helpers written by1; typecheck/full integration waits until1 ready. Separate independent review for each, then whole-branch review. No worker spawns agents or commits while another worker is editing; coordinator commits each reviewed ownership set.
