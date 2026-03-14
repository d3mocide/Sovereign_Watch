# 2026-03-13 — Fix Waterfall WebSocket Reconnect Race

## Issue

The waterfall display stopped loading. Browser console showed repeated errors:

```
WebSocket ws://localhost/js8/ws/waterfall failed: WebSocket is closed before the connection is established.
```

Backend logs confirmed the pattern — the `/ws/waterfall` connection was accepted and immediately closed in a tight loop, never actually receiving data:

```
WebSocket /ws/waterfall [accepted]
Waterfall WebSocket connected (total: 1)
connection open
connection closed    ← within milliseconds, no frames received
```

## Root Cause

In `ListeningPost.tsx`, the waterfall `useEffect` had an overly broad dependency array:

```ts
}, [wfMode, analyserNode, drawRow, wfSkip, wfOffset, zoom]);
```

- `drawRow` was rebuilt on every `wfOffset` change (it closed over `wfOffset` directly).
- `wfOffset` changed on any slider interaction, triggering `drawRow` to be recreated.
- This caused the `useEffect` to run its cleanup (close the WS) and re-run (open a new WS) on every slider change.
- On initial mount, the `activeKiwiConfig` render-phase sync (lines 248–253) caused additional state updates, triggering another cleanup+reconnect cycle before the first handshake completed.
- Result: the browser called `ws.close()` before `ws.onopen` fired → "WebSocket closed before established."

`zoom` similarly caused unnecessary reconnects; it is already communicated to the backend via `SET_ZOOM` actions, not by restarting the WebSocket.

## Solution

1. **`wfOffsetRef`**: Store `wfOffset` in a `useRef` that is kept in sync with state via a dedicated `useEffect`. `drawRow` reads `wfOffsetRef.current` directly, so it never needs to be recreated when the slider changes.
2. **Trimmed dependency array**: The WIDE-mode WebSocket `useEffect` now only depends on `[wfMode, analyserNode]`, the two values that actually require a new WebSocket connection.

## Changes

### `frontend/src/components/js8call/ListeningPost.tsx`
- Added `wfOffsetRef` alongside the existing `wfOffset` state.
- Added a `useEffect(() => { wfOffsetRef.current = wfOffset; }, [wfOffset])` to keep the ref in sync.
- `drawRow` now reads `wfOffsetRef.current` and has an empty dependency array `[]`.
- WebSocket `useEffect` dependency array changed from `[wfMode, analyserNode, drawRow, wfSkip, wfOffset, zoom]` to `[wfMode, analyserNode]`.

## Verification

Change is delivered via Vite HMR (no rebuild needed). After the fix:
- The `/ws/waterfall` connection should stabilize — no repeated open/close cycles in the backend logs.
- Adjusting the "WF Baseline (Offset)" slider no longer disrupts the waterfall stream.
- Changing the zoom level sends a `SET_ZOOM` action to the bridge (as before) without reconnecting the WebSocket.

## Benefits

- Eliminates the "WebSocket closed before established" race condition.
- Waterfall reliably loads and stays connected as long as a KiwiSDR node is linked.
- `drawRow` is stable across renders, reducing unnecessary recomputations.
