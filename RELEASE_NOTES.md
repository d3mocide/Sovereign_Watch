# Release - v0.60.0 - Sovereign Glass: Security and Intelligence Baseline

## High-Level Summary
This landmark release transitions SovereignWatch from a single-user prototype into a hardened, multi-user operational platform. It introduces the first complete JWT-based Authentication layer and a granular RBAC (Role-Based Access Control) system. Simultaneously, the Stats Dashboard has been evolved into a high-density tactical intelligence suite.

## Key Features

### Platform Security and Auth [FIRST RELEASE]
SovereignWatch is now a restricted environment. This release implements:
- JWT Authentication: Secure, token-based session management with BCrypt password hashing.
- Bitmask RBAC: Four granular roles (VIEWER, OPERATOR, ANALYST, ADMIN) for least-privileged access.
- User Management HUD: A new administrative interface for approving registrations and managing role assignments.

### Tactical Intelligence Expansion
The Stats Dashboard has been overhauled with high-cadence intelligence modules:
- Sensor Intelligence: Tactical radar visualizing target density and signal integrity trends.
- Fusion Audit: Real-time processing latency gauges and storage velocity forecasting.
- Protocol Deep-Dive: Integrated Extreme Behavior Detection in the Priority Watchlist.

## Upgrade Instructions
1. Pull the latest repository changes.
2. Update your .env with a unique USERS_SECRET_KEY.
3. Rebuild and restart the platform: docker compose up -d --build
4. Access the new login screen at your deployment URL.
