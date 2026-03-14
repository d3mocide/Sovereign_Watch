# Release - v0.28.3 - Waterfall Stream Fix

This is a targeted bug-fix release resolving a regression that prevented the WIDE-mode panoramic waterfall from loading in the HF Listening Post.

## 📡 Waterfall Stream Restored

The WIDE-mode waterfall WebSocket connection was failing immediately on every page load, cycling in a rapid connect → disconnect → reconnect loop with no data ever reaching the canvas. The browser console displayed:

> `WebSocket ws://localhost/js8/ws/waterfall failed: WebSocket is closed before the connection is established.`

Two compounding issues were identified and resolved:

### 1. Over-specified `useEffect` Dependencies

In `ListeningPost.tsx`, the WebSocket lifecycle effect had `wfOffset` and `zoom` in its dependency array. Because `drawRow` closed directly over `wfOffset`, any slider interaction caused `drawRow` to be recreated — which triggered the effect to tear down the WebSocket and immediately reopen it, repeatedly, before any handshake could complete.

**Fix**: `drawRow` now reads `wfOffset` via a `wfOffsetRef` (kept in sync with a dedicated `useEffect`) and carries a stable `[]` dep array. The WebSocket effect deps are reduced to `[wfMode, analyserNode]` — the only two values that genuinely require a new connection.

### 2. React StrictMode Close-Before-Open Race

In development, React 18 `StrictMode` intentionally double-invokes effects: it mounts, runs cleanup, then remounts. The cleanup called `ws.close()` while the socket was still in `CONNECTING` state — the precise trigger for the browser error above.

**Fix**: The effect cleanup now checks `ws.readyState`. If `CONNECTING`, it registers `ws.onopen = () => ws.close()` instead of calling `close()` immediately, allowing the handshake to complete before tearing down cleanly.

## 📄 Upgrade Instructions

No service restart required — the fix is frontend-only and is delivered via Vite HMR. For a clean pull:

```bash
git pull origin main
docker compose up -d --build frontend
```

---
*Sovereign Watch - Distributed Intelligence Fusion*
