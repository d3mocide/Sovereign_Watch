import type { MutableRefObject } from "react";
import { getToken } from "../api/auth";
import { resolveWebSocketUrl } from "../utils/network";

export interface WorkerProtocolOptions {
  /** Ref that will be populated with the running Worker instance. */
  workerRef: MutableRefObject<Worker | null>;
  /** Ref to the live set of watched ICAO24s (updated by watchlist polling). */
  watchedIcaosRef: MutableRefObject<Set<string>>;
  /** Called for every decoded entity update (both single and batched). */
  onEntityUpdate: (data: unknown) => void;
  /** Optional callback to report websocket connection state transitions. */
  onSocketStateChange?: (state: {
    connected: boolean;
    reason?: string;
    code?: number;
    attempt?: number;
  }) => void;
  /** Optional callback for non-binary (JSON) websocket messages. */
  onWsMessage?: (data: any) => void;
}

/**
 * Initialises the TAK web worker, the WebSocket feed, and watchlist polling.
 * Returns a cleanup function that tears everything down.
 */
export function startWorkerProtocol({
  workerRef,
  watchedIcaosRef,
  onEntityUpdate,
  onSocketStateChange,
  onWsMessage,
}: WorkerProtocolOptions): () => void {
  const worker = new Worker(
    new URL("../workers/tak.worker.ts", import.meta.url),
    { type: "module" },
  );

  worker.postMessage({ type: "init", payload: "/tak.proto?v=" + Date.now() });

  worker.onmessage = (event: MessageEvent) => {
    const { type, data } = event.data;
    if (type === "entity_batch") {
      for (const item of data) {
        onEntityUpdate(item);
      }
      return;
    }
    if (type === "entity_update") {
      onEntityUpdate(data);
    }
  };

  workerRef.current = worker;

  // ── WebSocket ──────────────────────────────────────────────────────────────
  const getWsUrl = () => {
    const base = resolveWebSocketUrl(import.meta.env.VITE_API_URL, "/api/tracks/live");
    const tok = getToken();
    return tok ? `${base}?token=${encodeURIComponent(tok)}` : base;
  };

  let ws: WebSocket | null = null;
  let reconnectAttempts = 0;
  const baseDelay = 1000;
  let reconnectTimeout: number | null = null;
  let heartbeatInterval: number | null = null;
  let lastMessageTs = Date.now();
  let isCleaningUp = false;

  const clearReconnectTimeout = () => {
    if (reconnectTimeout !== null) {
      window.clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
  };

  const clearHeartbeat = () => {
    if (heartbeatInterval !== null) {
      window.clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  };

  const connect = () => {
    if (isCleaningUp) return;
    if (ws && ws.readyState === WebSocket.OPEN) return;

    clearReconnectTimeout();

    // Re-derive URL each time so a fresh token is used after reconnection.
    ws = new WebSocket(getWsUrl());
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      reconnectAttempts = 0;
      lastMessageTs = Date.now();
      clearHeartbeat();
      heartbeatInterval = window.setInterval(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        // If stream goes stale (sleep/network edge cases), force reconnect.
        if (Date.now() - lastMessageTs > 15000) {
          ws.close(4000, "stale_connection");
          return;
        }

        // Keep intermediaries/NAT mappings warm and exercise socket liveness.
        try {
          ws.send("ping");
        } catch {
          // onclose handles recovery
        }
      }, 5000);
      onSocketStateChange?.({ connected: true, reason: "open" });
    };

    ws.onmessage = (event) => {
      lastMessageTs = Date.now();
      
      // Handle text messages (JSON alerts/signals)
      if (typeof event.data === "string") {
        if (event.data === "pong") return; // ignore heartbeat responses
        try {
          const parsed = JSON.parse(event.data);
          onWsMessage?.(parsed);
        } catch {
          // Silent catch for non-JSON strings
        }
        return;
      }

      // Handle binary messages (TAK Protobuf)
      if (workerRef.current) {
        workerRef.current.postMessage(
          { type: "decode_batch", payload: event.data },
          [event.data],
        );
      }
    };

    ws.onerror = () => {
      // onclose handles reconnection
    };

    ws.onclose = (event) => {
      if (isCleaningUp) return;
      clearHeartbeat();

      const reason = event.code === 4001 ? "auth_failed" : "close";
      onSocketStateChange?.({
        connected: false,
        reason,
        code: event.code,
        attempt: reconnectAttempts,
      });

      // Keep trying forever with capped backoff; stream outages can outlast a fixed retry budget.
      const delay = Math.min(baseDelay * Math.pow(2, reconnectAttempts), 30000);
      reconnectAttempts++;
      clearReconnectTimeout();
      reconnectTimeout = window.setTimeout(connect, delay);
    };
  };

  const nudgeReconnect = () => {
    if (isCleaningUp) return;
    if (ws && ws.readyState === WebSocket.OPEN) return;
    reconnectAttempts = 0;
    connect();
  };

  // ── Watchlist polling ──────────────────────────────────────────────────────
  const syncWatchlist = async () => {
    try {
      const res = await fetch("/api/watchlist");
      if (res.ok) {
        const entries: Array<{ icao24: string }> = await res.json();
        watchedIcaosRef.current = new Set(
          entries.map((e) => e.icao24.toLowerCase()),
        );
      }
    } catch {
      // intentionally silent
    }
  };

  syncWatchlist();
  const watchlistInterval = window.setInterval(syncWatchlist, 10_000);
  window.addEventListener("online", nudgeReconnect);
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      nudgeReconnect();
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  connect();

  return () => {
    isCleaningUp = true;
    clearReconnectTimeout();
    clearHeartbeat();
    window.removeEventListener("online", nudgeReconnect);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    clearInterval(watchlistInterval);
    worker.terminate();
    workerRef.current = null;
    if (ws) ws.close();
  };
}
