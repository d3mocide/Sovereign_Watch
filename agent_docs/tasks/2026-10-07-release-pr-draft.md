# Draft PR: Mobile workspaces and operational performance controls

Phones and tablets inherit cramped desktop menus and require a second tap to see selected-object details. This candidate adds dedicated mobile workspaces, immediate full-width Details and grouped Tools while improving map sizing/rendering and initial track delivery. It bounds Docker logs/Kafka replay storage and adds disk-write/query monitoring.

Includes satellite-search batching from #342 with row-isolated failure handling, precise orbital timestamps from #343 and hardened per-user atomic write limits addressing #345. Duplicate timestamp PRs #344/#346 are excluded. Python lint policy/tooling is reproducible, dev-targeted CI is enabled, and frozen test installs cover all nine Python services, including TAK clausalizer. RF Pulse's missing test lock entries and a NumPy groundtrack timedelta error are repaired.

Based on current dev/main at d26e34b (v1.1.3). Includes migration V007: start PostgreSQL with the new preload settings before backend migration startup. Update backend and space-pulse together for binary orbital telemetry. Existing volumes are retained.

Validation: application Python lint passed; isolated Python 3.12 frozen installs passed 819 tests with two skips across nine services. Frontend lint/typecheck and 316 tests passed on the unchanged frontend source snapshot, with phone/landscape/tablet/desktop Chromium and phone WebKit layout checks. Candidate frontend/backend/space/RF images built. Atomic limits passed a real Redis concurrency/expiry check; RF production imports/service construction passed. Full provider ingestion and sustained production-load testing remain outside this evidence.

Ready for candidate commit/PR review. GitHub CI and final merge/release review remain pending. Release notes propose v1.2.0; no commit, remote PR mutation, merge, tag or publication has occurred.
