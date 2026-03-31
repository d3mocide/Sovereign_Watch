# Fix Frontend Auth Data Leaking Before Login

## Issue
The frontend application was executing heavy data-fetching hooks and establishing WebSockets at the root of the React application before verifying the authentication status. This meant the backend was being flooded with unauthenticated API requests while the user stared at the login screen. It resulted in numerous `401 Unauthorized` errors in the network tab and forced some data map layers to require a hard refresh to re-initiate connections *after* the JWT token was successfully saved during login.

## Solution
Implemented a structural "mount gate" in the root component of the React app. We split the monolithic `App` container into two entities: `AuthenticatedApp` and `App`. The new root component exclusively evaluates the status of the user's `jwt` session and renders the corresponding login UI. The complex hook logic required for map rendering and data fetching only triggers when the `<AuthenticatedApp />` is ultimately mounted after a successful login flow.

## Changes
- `frontend/src/App.tsx`:
  - Rebranded the master application function into an isolated functional component called `AuthenticatedApp()`.
  - Stripped the early-return statements checking `authStatus === 'unauthenticated'` from this component.
  - Implemented a lean `App()` function appended to the bottom of the file which serves exclusively as a routing manager to control the initial sequence (Loading -> Login -> `<AuthenticatedApp />`).

## Verification
- Verified code purity via ESLint (`pnpm run lint`) matching the repository standards.
- Evaluated React hook dependencies manually to confirm `useAuth` correctly cascades down children trees instead of side-effecting asynchronously on initial load.

## Benefits
- Significantly reduced stress on the backend during new user visits.
- Eliminates the need to reload the browser tab after logging in to successfully establish tracks, infrastructure datasets, and WebSocket handshakes.
