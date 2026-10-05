# Lutron IPL Events

Standalone observational Home Assistant app for Green / HA OS.

- Read docs/design.md and docs/implementation-plan.md before changes.
- No live household connections, lighting/LED/programming/HA automation changes, or physical tests during development.
- Never commit household captures, credentials, addresses or IDs. Fixtures use synthetic identities; generated test credentials stay in temporary directories.
- Outbound IPL supports diagnostic Ping only. UI events are experimental telemetry, not verified fresh touches.
- Keep agent file ownership from the plan; coordinator owns shared contracts and package manifests. No worker-created agents or concurrent commits.
- Run focused tests before implementation (red/green), then full test/typecheck/build/stage for integration.
- Do not deploy HA or publish a remote repository without explicit scope.
