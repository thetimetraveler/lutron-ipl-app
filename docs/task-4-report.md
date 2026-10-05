# Task 4 — Configuration, application composition, and integration

Implemented strict flat option validation, credential-directory confinement, PEM/time/key-match checks, and a bundled Node CLI. Configuration failure occurs before either connection opens. Credential and broker exceptions are redacted. Missing Supervisor MQTT retries every 30 seconds without starting IPL; shutdown cancels retries and late lookup results cannot create resources.

Root-owned tests were written before each module: the config and runtime suites first failed because their target modules did not exist, then passed after implementation. Tests cover unsafe/duplicate configuration, certificate expiry/key mismatch and symlink escape, missing broker/retry, UI observation composition, shutdown idempotency, late broker resolution, and resource-close failure.

Offline validation against the existing private saved capture decoded all 4,803 raw frames in 97-byte chunks, matching the recorded decoded log count. The filter produced 3 observations in the first touch window, 2 in the slow-touch window, and 0 in each app, physical-button, and keypad-scene window. Only aggregate results are recorded here; captures, addresses, identities, and credentials were not copied into the app repository. These results do not establish gesture freshness or continuous slide reporting.

Dependencies were installed independently from this repository's manifest and lock; the temporary parent dependency symlink was removed. Build bundling includes MQTT, and the staged runtime executes without `node_modules`. GitHub CI uses verified official action commit pins, runs tests/typecheck/build, compares the committed install bundle with a fresh build, and builds ARM64/AMD64 images without publishing images or accessing household systems.

Public GitHub publication was explicitly authorized during implementation. HA deployment and physical tests remain outside this build. Local Docker validation is unavailable because the development machine has no Docker executable; CI build results and actual Green deployment must be reported separately.

Final coordinator validation before publication: full suite **70/70 passed, zero skipped**; TypeScript/build passed; regenerated GitHub release bundle exactly matches a fresh source build; actual release CLI `--help` passed.
