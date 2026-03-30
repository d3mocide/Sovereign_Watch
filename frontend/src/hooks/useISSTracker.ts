/**
 * useISSTracker — live ISS position via WebSocket with REST fallback.
 *
 * - Connects to WS /ws/infrastructure/iss-stream when `enabled` is true.
 * - Falls back to REST polling every 10s if WebSocket is unavailable.
 * - Maintains a rolling ground-track buffer of the last `trackLength` positions.
 * - Reconnects automatically on unexpected close (exponential backoff, cap 30s).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ISSPosition } from "../types";

const WS_PATH = "/ws/infrastructure/iss-stream";
const REST_PATH = "/api/infrastructure/iss/position";
const DEFAULT_TRACK_LENGTH = 720; // ~1 orbit at 5s cadence
const REST_FALLBACK_INTERVAL_MS = 10_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

interface UseISSTrackerOptions {
  enabled?: boolean;
  trackLength?: number;
}

interface UseISSTrackerResult {
  position: ISSPosition | null;
  track: ISSPosition[];
  connected: boolean;
}

function buildWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${WS_PATH}`;
}

export const useISSTracker = ({
  enabled = false,
  trackLength = DEFAULT_TRACK_LENGTH,
}: UseISSTrackerOptions = {}): UseISSTrackerResult => {
  const [position, setPosition] = useState<ISSPosition | null>(null);
  const [track, setTrack] = useState<ISSPosition[]>([]);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(2000);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(false);
  // Stable ref so onclose can schedule reconnect without a forward-reference lint error
  const connectRef = useRef<() => void>(() => {});

  const appendPosition = useCallback(
    (pos: ISSPosition) => {
      setPosition(pos);
      setTrack((prev) => {
        const next = [pos, ...prev];
        return next.length > trackLength ? next.slice(0, trackLength) : next;
      });
    },
    [trackLength],
  );

  const fetchRest = useCallback(async () => {
    try {
      const res = await fetch(REST_PATH);
      if (!res.ok) return;
      const data: unknown = await res.json();
      if (
        data &&
        typeof data === "object" &&
        "lat" in data &&
        "lon" in data &&
        "timestamp" in data
      ) {
        appendPosition(data as ISSPosition);
      }
    } catch {
      // silently ignore REST fetch failures
    }
  }, [appendPosition]);

  const fetchTrack = useCallback(async () => {
    try {
      const res = await fetch(`${REST_PATH.replace("/position", "/track")}?points=${trackLength}`);
      if (!res.ok) return;
      const data: any = await res.json();
      if (data?.features && Array.isArray(data.features)) {
        const positions: ISSPosition[] = data.features.map((f: any) => ({
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
          timestamp: f.properties.timestamp,
          altitude_km: f.properties.altitude_km,
          velocity_kms: f.properties.velocity_kms,
        }));
        setTrack(positions);
      }
    } catch {
      // ignore track fetch failures
    }
  }, [trackLength]);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const ws = new WebSocket(buildWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close();
        return;
      }
      setConnected(true);
      reconnectDelayRef.current = 2000; // reset backoff on success
      // Cancel REST fallback if WebSocket comes up
      if (restTimerRef.current) {
        clearInterval(restTimerRef.current);
        restTimerRef.current = null;
      }
    };

    ws.onmessage = (evt) => {
      try {
        const data: unknown = JSON.parse(evt.data as string);
        if (
          data &&
          typeof data === "object" &&
          "lat" in data &&
          "lon" in data &&
          "timestamp" in data
        ) {
          appendPosition(data as ISSPosition);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      wsRef.current = null;

      // Start REST fallback while reconnecting
      if (!restTimerRef.current) {
        fetchRest();
        restTimerRef.current = setInterval(fetchRest, REST_FALLBACK_INTERVAL_MS);
      }

      // Schedule reconnect with exponential backoff
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);
      reconnectTimerRef.current = setTimeout(() => connectRef.current(), delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [appendPosition, fetchRest]);

  // Keep connectRef in sync so the onclose handler always calls the latest version
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (!enabled) {
      // Clean up on disable
      setPosition(null);
      setTrack([]);
      setConnected(false);
      return;
    }

    mountedRef.current = true;
    fetchTrack(); // Load historical ground track
    fetchRest();  // Fast initial load of current position
    connect();    // Setup live WebSocket stream

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (restTimerRef.current) {
        clearInterval(restTimerRef.current);
        restTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect loop on intentional close
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [enabled, connect]);

  return { position, track, connected };
};
