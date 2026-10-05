# Changelog

## 0.3.0

- Optional private Designer metadata import and exact object name overrides, with numeric names as the fallback.
- Rename automatic event entities in place while preserving identities, event topics, manual mapping names, device grouping and observation behavior.
- Bound and validate private snapshots; invalid/unavailable metadata falls back without stopping the listener. Restart to apply a replaced snapshot.
- Include a SELECT-only Designer query template and an offline import tool requiring an explicitly verified system ID and fresh mode-0600 output.

## 0.2.1

- Rebuild the release bundle with checkout-local locked dependencies so clean CI builds reproduce the published bundle.
- Refuse staging from a symlinked dependency directory to prevent checkout-specific dependency paths in future releases.

## 0.2.0

- Optional passive discovery (`auto_discover: false` by default), with numeric IPL identities and a configurable 1–256 object admission cap (default 128).
- Observed button, occupancy, UI/zone/load/shade/current-level, scene-selection, area-lighting, and GoToLevel command event families; existing manual UI mappings keep their `level_adjustment` contract.
- Persist bounded numeric descriptors only, preserve quiet entities across restarts, and clean only this instance's owned automatic discovery configs when disabled or suppressed by a manual UI mapping.
- Automatic reports remain nonretained QoS 0 with no offline buffer or replay, bounded publication, and drop counters.
- Document processor startup/cache/repeated-report limits, receipt timestamps, and processor observation versus CCA/CCX RF capture. Offline checks and deployment validation remain separate; processor reports do not establish physical-device coverage.

## 0.1.0

- Initial experimental observational IPL-to-MQTT service and HA OS local app package.
- Read-only separate IPL credentials, configurable UI mappings, and optional decoded-frame debug publication.
- Home Assistant event discovery and connection-health reporting; opt-in automation example.
