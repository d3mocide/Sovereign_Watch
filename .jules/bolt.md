
## 2026-05-19 - Defer dictionary allocation in orbital pass loop
**Learning:** Generating dictionaries and formatting datetime strings in a tight loop where the result is immediately discarded for >90% of iterations creates a massive, unnecessary performance bottleneck.
**Action:** Always defer expensive object allocations and string formatting operations until *after* filtering conditions (like visibility checks) have passed.
