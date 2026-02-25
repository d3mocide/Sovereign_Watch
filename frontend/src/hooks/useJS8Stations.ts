import { useEffect, useRef, useState, useCallback, MutableRefObject } from 'react';
import type { JS8Station, JS8LogEntry, JS8StatusLine } from '../types';

const WS_URL = import.meta.env.VITE_JS8_WS_URL || 'ws://localhost:8082/ws/js8';

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;
const MAX_LOG = 30;
const MAX_STATIONS = 100;

export interface UseJS8StationsResult {
  stationsRef: MutableRefObject<Map<string, JS8Station>>;
  ownGridRef: MutableRefObject<string>;
  stations: JS8Station[];
  logEntries: JS8LogEntry[];
  statusLine: JS8StatusLine;
  connected: boolean;
  js8Connected: boolean;
  sendMessage: (target: string, message: string) => void;
}

export function useJS8Stations(): UseJS8StationsResult {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const reconnectDelay = useRef(RECONNECT_BASE_MS);

  // Refs for 60fps map layer (mutated in-place, no React re-render needed)
  const stationsRef = useRef<Map<string, JS8Station>>(new Map());
  const ownGridRef = useRef<string>('');

  // React state for sidebar widget
  const [stations, setStations] = useState<JS8Station[]>([]);
  const [logEntries, setLogEntries] = useState<JS8LogEntry[]>([]);
  const [statusLine, setStatusLine] = useState<JS8StatusLine>({ callsign: '--', grid: '----', freq: '--' });
  const [connected, setConnected] = useState(false);
  const [js8Connected, setJs8Connected] = useState(false);

  const syncStations = useCallback(() => {
    setStations(
      Array.from(stationsRef.current.values()).sort((a, b) => b.ts_unix - a.ts_unix),
    );
  }, []);

  const connect = useCallback(() => {
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
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, RECONNECT_MAX_MS);
        connect();
      }, reconnectDelay.current);
    };

    ws.onerror = () => { /* handled by onclose */ };

    ws.onmessage = (evt) => {
      let payload: Record<string, any>;
      try { payload = JSON.parse(evt.data); } catch { return; }
      const type = payload.type || '';

      if (type === 'CONNECTED') {
        setJs8Connected(payload.js8call_connected ?? false);
        return;
      }

      if (type === 'STATION.STATUS') {
        const grid = payload.grid || '';
        ownGridRef.current = grid;
        setStatusLine({
          callsign: payload.callsign || '--',
          grid: grid || '----',
          freq: payload.freq ? `${(payload.freq / 1000).toFixed(3)} kHz` : '--',
        });
        return;
      }

      if (type === 'RX.SPOT') {
        const cs = payload.callsign as string;
        if (!cs) return;
        const station: JS8Station = {
          callsign: cs,
          grid: payload.grid || '',
          lat: payload.lat ?? 0,
          lon: payload.lon ?? 0,
          snr: payload.snr ?? 0,
          freq: payload.freq,
          distance_km: payload.distance_km,
          distance_mi: payload.distance_mi,
          bearing_deg: payload.bearing_deg,
          ts_unix: payload.ts_unix || Math.floor(Date.now() / 1000),
          timestamp: payload.timestamp,
        };
        stationsRef.current.set(cs, station);
        // Evict oldest if over cap
        if (stationsRef.current.size > MAX_STATIONS) {
          let oldest = '';
          let oldestTs = Infinity;
          for (const [k, v] of stationsRef.current) {
            if (v.ts_unix < oldestTs) { oldestTs = v.ts_unix; oldest = k; }
          }
          if (oldest) stationsRef.current.delete(oldest);
        }
        syncStations();
        return;
      }

      if (type === 'STATION_LIST') {
        stationsRef.current.clear();
        for (const s of payload.stations || []) {
          stationsRef.current.set(s.callsign, s as JS8Station);
        }
        syncStations();
        return;
      }

      if (type === 'RX.DIRECTED' || type === 'TX.SENT') {
        const entry: JS8LogEntry = {
          id: `${Date.now()}-${Math.random()}`,
          type,
          from: payload.from,
          to: payload.to,
          text: payload.text || payload.message || '',
          snr: payload.snr,
          timestamp: payload.timestamp,
        };
        setLogEntries(prev => {
          const next = [entry, ...prev];
          return next.length > MAX_LOG ? next.slice(0, MAX_LOG) : next;
        });
      }
    };
  }, [syncStations]);

  const sendMessage = useCallback((target: string, message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'SEND', target, message }));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { stationsRef, ownGridRef, stations, logEntries, statusLine, connected, js8Connected, sendMessage };
}
