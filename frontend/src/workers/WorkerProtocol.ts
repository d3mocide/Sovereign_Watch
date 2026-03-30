import type { MutableRefObject } from "react";
import { getToken } from "../api/auth";

export interface WorkerProtocolOptions {
  /** Ref that will be populated with the running Worker instance. */
  workerRef: MutableRefObject<Worker | null>;
  /** Ref to the live set of watched ICAO24s (updated by watchlist polling). */
  watchedIcaosRef: MutableRefObject<Set<string>>;
  /** Called for every decoded entity update (both single and batched). */
  onEntityUpdate: (data: unknown) => void;
}

/**
 * Initialises the TAK web worker, the WebSocket feed, and watchlist polling.
 * Returns a cleanup function that tears everything down.
 */
export function startWorkerProtocol({
  workerRef,
  watchedIcaosRef,
  onEntityUpdate,
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
    const envUrl = import.meta.env.VITE_API_URL;
    const base = envUrl && !envUrl.includes("localhost")
      ? envUrl.replace("http", "ws") + "/api/tracks/live"
      : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/tracks/live`;
    const tok = getToken();
    return tok ? `${base}?token=${encodeURIComponent(tok)}` : base;
  };

  let ws: WebSocket | null = null;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 10;
  const baseDelay = 1000;
  let reconnectTimeout: number | null = null;
  let isCleaningUp = false;

  const connect = () => {
    if (isCleaningUp) return;

    // Re-derive URL each time so a fresh token is used after reconnection.
    ws = new WebSocket(getWsUrl());
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      reconnectAttempts = 0;
    };

    ws.onmessage = (event) => {
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

    ws.onclose = () => {
      if (isCleaningUp) return;
      if (reconnectAttempts < maxReconnectAttempts) {
        const delay = Math.min(
          baseDelay * Math.pow(2, reconnectAttempts),
          30000,
        );
        reconnectAttempts++;
        reconnectTimeout = window.setTimeout(connect, delay);
      } else {
        console.error(
          "Max reconnection attempts reached. Please refresh the page.",
        );
      }
    };
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

  connect();

  return () => {
    isCleaningUp = true;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    clearInterval(watchlistInterval);
    worker.terminate();
    workerRef.current = null;
    if (ws) ws.close();
  };
}
