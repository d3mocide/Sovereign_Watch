## 2024-05-22 - [DOS Vulnerability in History Endpoint]
**Vulnerability:** The `/api/tracks/history/{entity_id}` endpoint allowed unbounded `limit` and `hours` parameters. This could be exploited to cause a Denial of Service (DoS) by requesting excessive data, overwhelming the database or application memory. Additionally, database exceptions were leaking internal implementation details (stack traces/error messages) to the client.
**Learning:** Even when using parameterized queries to prevent SQL injection, resource consumption limits must be enforced at the application level. "Safe" queries can still be expensive. Also, default exception handling in frameworks might not be secure enough for production.
**Prevention:**
1.  **Input Validation:** Always validate user-supplied limits against a configured maximum (e.g., `TRACK_HISTORY_MAX_LIMIT`).
2.  **Defensive Error Handling:** Catch exceptions at the boundary and return generic error messages (e.g., "Internal server error") while logging the specific details internally.
