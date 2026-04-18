import {
  MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { JS8LogEntry, JS8Station, JS8StatusLine } from "../types";
import { resolveWebSocketUrl } from "../utils/network";

const asString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const asBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : fallback;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const getJS8WSUrl = () => {
  return resolveWebSocketUrl(import.meta.env.VITE_JS8_WS_URL, "/js8/ws/js8");
};

const WS_URL = getJS8WSUrl();

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;
const MAX_LOG = 200; // Increased for terminal view
const MAX_STATIONS = 100;

export interface UseJS8StationsResult {
  stationsRef: MutableRefObject<Map<string, JS8Station>>;
  ownGridRef: MutableRefObject<string>;
  kiwiNodeRef: MutableRefObject<{
    lat: number;
    lon: number;
    host: string;
  } | null>;
  stations: JS8Station[];
  logEntries: JS8LogEntry[];
  statusLine: JS8StatusLine;
  connected: boolean;
  js8Connected: boolean;
  kiwiConnecting: boolean;
  activeKiwiConfig: import("../types").KiwiConfig | null;
  js8Mode: string;
  sMeterDbm: number | null;
  adcOverload: boolean;
  sendMessage: (target: string, message: string) => void;
  sendAction: (payload: object) => void;
}

export function useJS8Stations(): UseJS8StationsResult {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(RECONNECT_BASE_MS);

  // Refs for 60fps map layer (mutated in-place, no React re-render needed)
  const stationsRef = useRef<Map<string, JS8Station>>(new Map());
  const ownGridRef = useRef<string>("");
  const kiwiNodeRef = useRef<{ lat: number; lon: number; host: string } | null>(
    null,
  );

  // React state for sidebar widget
  const [stations, setStations] = useState<JS8Station[]>([]);
  const [logEntries, setLogEntries] = useState<JS8LogEntry[]>([]);
  const [statusLine, setStatusLine] = useState<JS8StatusLine>({
    callsign: "--",
    grid: "----",
    freq: "--",
  });
  const [connected, setConnected] = useState(false);
  const [js8Connected, setJs8Connected] = useState(false);
  const [kiwiConnecting, setKiwiConnecting] = useState(false);
  const [activeKiwiConfig, setActiveKiwiConfig] = useState<
    import("../types").KiwiConfig | null
  >(null);
  const [js8Mode, setJs8Mode] = useState<string>("normal");
  const [sMeterDbm, setsMeterDbm] = useState<number | null>(null);
  const [adcOverload, setAdcOverload] = useState(false);
  const adcOverloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const syncStations = useCallback(() => {
    setStations(
      Array.from<JS8Station>(stationsRef.current.values()).sort(
        (a, b) => b.ts_unix - a.ts_unix,
      ),
    );
  }, []);

  const connect = useCallback(
    function connectInternal() {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        reconnectDelay.current = RECONNECT_BASE_MS;
      };

      ws.onclose = () => {
        setConnected(false);
        setJs8Connected(false);
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        reconnectTimer.current = setTimeout(() => {
          reconnectDelay.current = Math.min(
            reconnectDelay.current * 2,
            RECONNECT_MAX_MS,
          );
          connectInternal();
        }, reconnectDelay.current);
      };

      ws.onerror = () => {
        /* handled by onclose */
      };

      ws.onmessage = (evt) => {
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(evt.data);
        } catch {
          return;
        }
        const type = asString(payload.type, "");

        if (type === "CONNECTED") {
          setJs8Connected(asBoolean(payload.js8call_connected, false));
          setJs8Mode(asString(payload.speed, "normal"));
          const c = asString(payload.callsign, "--");
          const g = asString(payload.grid, "----");
          ownGridRef.current = g;
          setStatusLine((prev: JS8StatusLine) => ({
            ...prev,
            callsign: c,
            grid: g,
          }));
          const kiwiHost = asString(payload.kiwi_host);
          if (asBoolean(payload.kiwi_connected) && kiwiHost) {
            setActiveKiwiConfig({
              host: kiwiHost,
              port: asNumber(payload.kiwi_port) ?? 8073,
              freq: asNumber(payload.kiwi_freq) ?? 7078,
              mode: asString(payload.kiwi_mode, "usb"),
            });
          }

          // Proactively ask the backend for the current KiwiSDR status
          // to handle the case where the frontend connects before the backend
          // has finished its initial node discovery and handshake.
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action: "GET_KIWI_STATUS" }));
          }
          return;
        }

        if (type === "KIWI.STATUS") {
          setKiwiConnecting(false);
          const host = asString(payload.host);
          if (asBoolean(payload.connected) && host) {
            setActiveKiwiConfig({
              host,
              port: asNumber(payload.port) ?? 8073,
              freq: asNumber(payload.freq) ?? 7078,
              mode: asString(payload.mode, "usb"),
            });
            // Update the map-layer ref (lat/lon now included from backend)
            const lat = asNumber(payload.lat);
            const lon = asNumber(payload.lon);
            if (lat !== undefined && lon !== undefined) {
              kiwiNodeRef.current = { lat, lon, host };
            }
          } else {
            setActiveKiwiConfig(null);
            kiwiNodeRef.current = null;
          }
          return;
        }

        if (type === "STATION.STATUS") {
          const grid = asString(payload.grid, "");
          ownGridRef.current = grid;
          const speed = asString(payload.speed);
          if (speed) setJs8Mode(speed);
          const freq = asNumber(payload.freq);
          const callsign = asString(payload.callsign);
          setStatusLine((prev: JS8StatusLine) => ({
            callsign: callsign || prev.callsign,
            grid: grid || prev.grid,
            freq:
              freq !== undefined
                ? `${(freq / 1000).toFixed(3)} kHz`
                : prev.freq,
          }));
          return;
        }

        if (type === "RX.SPOT") {
          const cs = asString(payload.callsign);
          if (!cs) return;
          const station: JS8Station = {
            callsign: cs,
            grid: asString(payload.grid, ""),
            lat: asNumber(payload.lat) ?? 0,
            lon: asNumber(payload.lon) ?? 0,
            snr: asNumber(payload.snr) ?? 0,
            freq: asNumber(payload.freq),
            distance_km: asNumber(payload.distance_km),
            distance_mi: asNumber(payload.distance_mi),
            bearing_deg: asNumber(payload.bearing_deg),
            ts_unix: asNumber(payload.ts_unix) ?? Math.floor(Date.now() / 1000),
            timestamp: asString(payload.timestamp, ""),
          };
          stationsRef.current.set(cs, station);
          // Evict oldest if over cap
          if (stationsRef.current.size > MAX_STATIONS) {
            let oldest = "";
            let oldestTs = Infinity;
            for (const [k, v] of stationsRef.current) {
              if (v.ts_unix < oldestTs) {
                oldestTs = v.ts_unix;
                oldest = k;
              }
            }
            if (oldest) stationsRef.current.delete(oldest);
          }
          syncStations();
          return;
        }

        if (type === "STATION_LIST") {
          stationsRef.current.clear();
          const incoming = payload.stations;
          if (Array.isArray(incoming)) {
            for (const rawStation of incoming) {
              const stationRecord = asRecord(rawStation);
              if (!stationRecord) continue;
              const callsign = asString(stationRecord.callsign);
              if (!callsign) continue;
              stationsRef.current.set(callsign, {
                callsign,
                grid: asString(stationRecord.grid, ""),
                lat: asNumber(stationRecord.lat) ?? 0,
                lon: asNumber(stationRecord.lon) ?? 0,
                snr: asNumber(stationRecord.snr) ?? 0,
                freq: asNumber(stationRecord.freq),
                distance_km: asNumber(stationRecord.distance_km),
                distance_mi: asNumber(stationRecord.distance_mi),
                bearing_deg: asNumber(stationRecord.bearing_deg),
                ts_unix:
                  asNumber(stationRecord.ts_unix) ??
                  Math.floor(Date.now() / 1000),
                timestamp: asString(stationRecord.timestamp, ""),
              });
            }
          }
          syncStations();
          return;
        }

        if (type === "SMETER") {
          setsMeterDbm(typeof payload.dbm === "number" ? payload.dbm : null);
          return;
        }

        if (type === "KIWI.ADC_OVERLOAD") {
          setAdcOverload(true);
          if (adcOverloadTimerRef.current)
            clearTimeout(adcOverloadTimerRef.current);
          // Auto-dismiss after 8 s — the operator has had time to notice
          adcOverloadTimerRef.current = setTimeout(
            () => setAdcOverload(false),
            8000,
          );
          return;
        }

        if (type === "RX.DIRECTED" || type === "TX.SENT") {
          const entry: JS8LogEntry = {
            id: `${Date.now()}-${Math.random()}`,
            type,
            from: asString(payload.from, ""),
            to: asString(payload.to, ""),
            text: asString(payload.text, asString(payload.message, "")),
            snr: asNumber(payload.snr),
            timestamp: asString(payload.timestamp, ""),
          };
          setLogEntries((prev: JS8LogEntry[]) => {
            const next = [entry, ...prev];
            return next.length > MAX_LOG ? next.slice(0, MAX_LOG) : next;
          });
        }
      };
    },
    [syncStations],
  );

  const sendMessage = useCallback((target: string, text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Backend expects action:"SEND", target, message (not text)
      wsRef.current.send(
        JSON.stringify({
          action: "SEND",
          target,
          message: text,
        }),
      );
    }
  }, []);

  const sendAction = useCallback((payload: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if ((payload as { action?: string }).action === "SET_KIWI") {
        setKiwiConnecting(true);
        // Safety timeout — unlock UI after 15s if backend hangs
        setTimeout(() => setKiwiConnecting(false), 15000);
      }
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    stationsRef,
    ownGridRef,
    kiwiNodeRef,
    stations,
    logEntries,
    statusLine,
    connected,
    js8Connected,
    kiwiConnecting,
    activeKiwiConfig,
    js8Mode,
    sMeterDbm,
    adcOverload,
    sendMessage,
    sendAction,
  };
}
