# v0.2.0 event expansion review

The update adds optional passive discovery of supported observed IPL objects while preserving configured UI events. Exact capture-supported decoders add button, occupancy, level/current-level, numeric scene selection, area-lighting and incoming GoToLevel command observations. Generic names and explicit source kinds avoid inferring room/device/radio provenance or fresh physical actions.

Independent decoder, discovery/integration and release reviews passed without Important or Critical findings. Final whole-app review approved protocol/schema boundaries, automatic/manual namespace isolation, descriptor persistence and interrupted cleanup, bounded publication without event replay, and self-contained package compatibility. Preflight's manual-ID collision finding was resolved with separate automatic discovery and event-topic namespaces.

Verification: all 95 offline tests passed, typecheck/build passed, and a fresh stage matched the complete 13-file release byte for byte. Synthetic fixtures and generated loopback TLS credentials were used. No new physical tests or household programming/lighting/automation changes were part of development. Deployment verification is separate from these offline checks; neither establishes complete CCA/CCX radio coverage.
