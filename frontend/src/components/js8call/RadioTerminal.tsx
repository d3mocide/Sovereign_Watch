/**
 * Sovereign Watch – JS8Call Radio Terminal
 * =========================================
 *
 * Layout:
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  HEADER: brand/icon | freq band display | connection status             │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │  MESSAGE LOG (flex-1, bottom-anchored like a chat terminal)  │ STATIONS │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │  TRANSMIT PANEL + STATUS BAR                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * WebSocket message types handled:
 *   RX.DIRECTED  → append to message log
 *   RX.SPOT      → update heard stations sidebar
 *   TX.SENT      → append to message log (local echo)
 *   STATION.STATUS → update header band/freq display
 *   CONNECTED    → update connection state
 *   ERROR        → display in log as system message
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  Radio,
  Signal,
  MapPin,
  Clock,
  Activity,
  Globe,
  Wifi,
  Server,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const WS_URL =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_JS8_WS_URL
    ? import.meta.env.VITE_JS8_WS_URL
    : 'ws://localhost:8080/ws/js8';

const KIWI_DEFAULT_HOST =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_KIWI_HOST
    ? import.meta.env.VITE_KIWI_HOST
    : 'kiwisdr.example.com';
const KIWI_DEFAULT_PORT =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_KIWI_PORT
    ? Number(import.meta.env.VITE_KIWI_PORT)
    : 8073;
const KIWI_DEFAULT_FREQ =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_KIWI_FREQ
    ? Number(import.meta.env.VITE_KIWI_FREQ)
    : 14074;

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;
const MAX_LOG_ENTRIES = 500;
const MAX_STATIONS = 100;

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function bearingToCardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function formatAge(ts_unix: number | null): string {
  if (!ts_unix) return '--';
  const age = Math.floor(Date.now() / 1000) - ts_unix;
  if (age < 60) return `${age}s`;
  if (age < 3600) return `${Math.floor(age / 60)}m`;
  return `${Math.floor(age / 3600)}h`;
}

// SNR thresholds tuned to JS8Call's realistic operating range (-24 to +5 dB)
function snrColor(snr: number | null): string {
  if (snr == null) return 'text-slate-500';
  if (snr >= -10) return 'text-emerald-400';
  if (snr >= -18) return 'text-yellow-400';
  return 'text-red-400';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface Station {
  callsign: string;
  grid?: string;
  distance_km?: number | null;
  bearing_deg?: number;
  snr: number | null;
  ts_unix: number;
}

/** Individual station row in the Heard Stations sidebar */
function StationCard({ station, isNew }: { station: Station; isNew: boolean }) {
  return (
    <div
      className={`
        flex items-center justify-between p-2 rounded
        border transition-all duration-300
        ${isNew
          ? 'border-indigo-500/60 bg-indigo-950/40'
          : 'border-transparent hover:border-slate-700 hover:bg-slate-800'}
      `}
    >
      <div>
        <div className="font-bold text-indigo-300 text-xs tracking-wider">
          {station.callsign}
        </div>
        <div className="flex items-center gap-1 text-slate-500 text-[10px] mt-0.5">
          <MapPin className="w-2.5 h-2.5 shrink-0" />
          <span>{station.grid || '????'}</span>
          {station.distance_km != null && (
            <>
              <span className="text-slate-700">·</span>
              <span className="text-blue-500">
                {station.distance_km}km {Math.round(station.bearing_deg)}°{bearingToCardinal(station.bearing_deg)}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="text-right shrink-0 ml-2">
        <div className={`text-xs font-bold ${snrColor(station.snr)}`}>
          {station.snr > 0 ? '+' : ''}{station.snr} dB
        </div>
        <div className="text-[10px] text-slate-600 mt-0.5">
          {formatAge(station.ts_unix)} ago
        </div>
      </div>
    </div>
  );
}

interface LogEntryItem {
  id: string;
  type: string;
  from?: string;
  to?: string;
  text?: string;
  message?: string;
  timestamp: string;
  snr?: number | null;
}

/** A single row in the message log */
function LogEntry({ entry }: { entry: LogEntryItem }) {
  const isLocal = entry.from === 'LOCAL' || entry.type === 'TX.SENT';
  const isSystem = entry.type === 'SYSTEM' || entry.type === 'CONNECTED' || entry.type === 'ERROR';

  if (isSystem) {
    return (
      <div className="flex items-start gap-3 p-2 rounded bg-slate-900/50 text-slate-400 italic">
        <div className="flex items-center gap-1.5 w-24 shrink-0 text-slate-600">
          <Clock className="w-3 h-3" />
          <span className="text-[10px]">{entry.timestamp}</span>
        </div>
        <span className="text-xs">{entry.text || entry.message}</span>
      </div>
    );
  }

  return (
    <div className={`
      group flex items-start gap-3 p-2 rounded transition-colors
      ${isLocal ? 'bg-indigo-950/30 hover:bg-indigo-950/50' : 'hover:bg-slate-900/80'}
    `}>
      {/* Timestamp */}
      <div className="flex items-center gap-1.5 w-24 shrink-0 text-slate-500">
        <Clock className="w-3 h-3 shrink-0" />
        <span className="text-[10px]">{entry.timestamp}</span>
      </div>

      {/* SNR */}
      <div className="w-12 shrink-0 text-right">
        {entry.snr != null && (
          <span className={`text-xs font-semibold ${snrColor(entry.snr)}`}>
            {entry.snr > 0 ? '+' : ''}{entry.snr}
          </span>
        )}
      </div>

      {/* Sender ▶ recipient : text */}
      <div className="flex-1 break-words text-xs">
        <span className={`font-bold ${isLocal ? 'text-blue-300' : 'text-indigo-300'}`}>
          {entry.from || '?'}
        </span>
        {entry.to && (
          <>
            <span className="text-slate-600 px-1">▶</span>
            <span className={
              (entry.to || '').toUpperCase().includes('@ALLCALL') ||
                (entry.to || '').toUpperCase().includes('@CQ')
                ? 'text-yellow-400'
                : 'text-slate-400'
            }>
              {entry.to}
            </span>
          </>
        )}
        <span className="text-slate-200 ml-1.5">{entry.text}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main RadioTerminal Component
// ---------------------------------------------------------------------------

export default function RadioTerminal() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [connected, setConnected] = useState(false);
  const [js8Connected, setJs8Connected] = useState(false);
  const [statusLine, setStatusLine] = useState({ callsign: '--', grid: '----', freq: '--' });

  const [logEntries, setLogEntries] = useState<LogEntryItem[]>([]);
  const [stations, setStations] = useState<Record<string, Station>>({});
  const [newCallsigns, setNewCallsigns] = useState<Set<string>>(new Set());

  const [txTarget, setTxTarget] = useState('@ALLCALL');
  const [txMessage, setTxMessage] = useState('');
  const [txPending, setTxPending] = useState(false);

  const [kiwiConfig, setKiwiConfig] = useState({
    host: KIWI_DEFAULT_HOST,
    port: KIWI_DEFAULT_PORT,
    freq: KIWI_DEFAULT_FREQ,
    mode: 'usb',
  });
  const [kiwiConnected, setKiwiConnected] = useState(false);
  const [kiwiConnecting, setKiwiConnecting] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<any>(null);
  const reconnectDelay = useRef(RECONNECT_BASE_MS);
  const logBottomRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const appendSystem = useCallback((text: string) => {
    setLogEntries((prev) => {
      const entry: LogEntryItem = {
        id: `sys-${Date.now()}-${Math.random()}`,
        type: 'SYSTEM',
        text,
        timestamp: new Date().toISOString().slice(11, 19) + 'Z',
      };
      const next = [...prev, entry];
      return next.length > MAX_LOG_ENTRIES ? next.slice(-MAX_LOG_ENTRIES) : next;
    });
  }, []);

  // Auto-scroll only when the user is already near the bottom
  const scrollToBottom = useCallback(() => {
    const el = logContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 120) {
      logBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [logEntries, scrollToBottom]);

  // ── WebSocket management ───────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectDelay.current = RECONNECT_BASE_MS;
      appendSystem(`Connected to ${WS_URL}`);
    };

    ws.onclose = (evt) => {
      setConnected(false);
      setJs8Connected(false);
      appendSystem(`Connection closed (${evt.code}) – retrying in ${reconnectDelay.current / 1000}s…`);
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, RECONNECT_MAX_MS);
        connect();
      }, reconnectDelay.current);
    };

    ws.onerror = () => appendSystem('WebSocket error – will retry');

    ws.onmessage = (evt) => {
      let payload: any;
      try {
        payload = JSON.parse(evt.data);
      } catch {
        appendSystem(`Unparseable frame: ${evt.data.slice(0, 80)}`);
        return;
      }

      const type = payload.type || '';

      if (type === 'CONNECTED') {
        setJs8Connected(payload.js8call_connected ?? false);
        if (payload.kiwi_connected) {
          setKiwiConnected(true);
          setKiwiConfig((prev: any) => ({
            ...prev,
            host: payload.kiwi_host || prev.host,
            port: payload.kiwi_port || prev.port,
            freq: payload.kiwi_freq || prev.freq,
            mode: payload.kiwi_mode || prev.mode,
          }));
        }
        appendSystem(payload.message || 'Bridge connected');
        return;
      }

      if (type === 'KIWI.STATUS') {
        setKiwiConnected(payload.connected ?? false);
        setKiwiConnecting(false);
        if (payload.connected && payload.host) {
          setKiwiConfig({
            host: payload.host,
            port: payload.port,
            freq: payload.freq,
            mode: payload.mode || 'usb',
          });
        }
        appendSystem(
          payload.connected
            ? `SDR connected: ${payload.host}:${payload.port} @ ${payload.freq} kHz`
            : 'SDR disconnected'
        );
        return;
      }

      if (type === 'RX.DIRECTED' || type === 'TX.SENT') {
        setLogEntries((prev: LogEntryItem[]) => {
          const entry: LogEntryItem = {
            id: `${Date.now()}-${Math.random()}`,
            ...payload,
            text: payload.text || payload.message || '',
          };
          const next = [...prev, entry];
          return next.length > MAX_LOG_ENTRIES ? next.slice(-MAX_LOG_ENTRIES) : next;
        });
        return;
      }

      if (type === 'RX.SPOT') {
        const callsign = payload.callsign;
        if (!callsign) return;
        setStations((prev: Record<string, Station>) => {
          const updated = { ...prev, [callsign]: { ...payload } };
          const keys = Object.keys(updated);
          if (keys.length > MAX_STATIONS) {
            const oldest = keys.sort(
              (a, b) => (updated[a].ts_unix || 0) - (updated[b].ts_unix || 0)
            )[0];
            delete updated[oldest];
          }
          return updated;
        });
        setNewCallsigns((prev: Set<string>) => new Set([...prev, callsign]));
        setTimeout(() => {
          setNewCallsigns((prev: Set<string>) => {
            const next = new Set(prev);
            next.delete(callsign);
            return next;
          });
        }, 3000);
        return;
      }

      if (type === 'STATION.STATUS') {
        setStatusLine({
          callsign: payload.callsign || '--',
          grid: payload.grid || '----',
          freq: payload.freq ? `${(payload.freq / 1000).toFixed(3)} kHz` : '--',
        });
        return;
      }

      if (type === 'STATION_LIST') {
        const map: Record<string, Station> = {};
        (payload.stations || []).forEach((sValue: any) => { map[sValue.callsign] = sValue; });
        setStations(map);
        return;
      }

      if (type === 'ERROR') {
        appendSystem(`ERROR: ${payload.message}`);
      }
    };
  }, [appendSystem]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // ── Transmit handler ───────────────────────────────────────────────────────

  const handleSend = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const msg = txMessage.trim();
    if (!msg || !connected || txPending) return;
    wsRef.current?.send(JSON.stringify({
      action: 'SEND',
      target: txTarget.trim() || '@ALLCALL',
      message: msg,
    }));
    setTxMessage('');
    setTxPending(true);
    setTimeout(() => setTxPending(false), 16000);
  }, [connected, txMessage, txTarget, txPending]);

  // ── KiwiSDR connect / disconnect ───────────────────────────────────────────

  const handleKiwiConnect = useCallback(() => {
    if (!connected || kiwiConnecting) return;
    setKiwiConnecting(true);
    wsRef.current?.send(JSON.stringify({
      action: 'SET_KIWI',
      host: kiwiConfig.host,
      port: Number(kiwiConfig.port),
      freq: Number(kiwiConfig.freq),
      mode: kiwiConfig.mode,
    }));
  }, [connected, kiwiConnecting, kiwiConfig]);

  const handleKiwiDisconnect = useCallback(() => {
    if (!connected) return;
    wsRef.current?.send(JSON.stringify({ action: 'DISCONNECT_KIWI' }));
  }, [connected]);

  // ── Sorted station array ───────────────────────────────────────────────────

  const sortedStations = useMemo(
    () => Object.values(stations).sort((a: Station, b: Station) => (b.ts_unix || 0) - (a.ts_unix || 0)),
    [stations]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 font-mono text-sm selection:bg-indigo-500/30 overflow-hidden">

      {/* ── HEADER ── */}
      <header className="flex items-center justify-between px-4 h-14 bg-slate-900 border-b border-slate-800 shrink-0">
        {/* Left: brand */}
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-indigo-500/10 rounded-md border border-indigo-500/20">
            <Radio className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="font-bold text-slate-100 tracking-wider text-sm">Sovereign Watch</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest leading-none">
              JS8Call Terminal
            </p>
          </div>
        </div>

        {/* Center: KiwiSDR config widget + JS8Call station info */}
        <div className="flex items-center gap-3 text-xs">

          {/* KiwiSDR inline config */}
          <div className="flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            {kiwiConnected ? (
              /* Connected – read-only display */
              <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-2.5 py-1.5 rounded font-mono">
                <span className="text-cyan-400">{kiwiConfig.host}</span>
                <span className="text-slate-700">:</span>
                <span className="text-slate-400">{kiwiConfig.port}</span>
                <span className="text-slate-700 px-0.5">@</span>
                <span className="text-emerald-400">{kiwiConfig.freq} kHz</span>
              </div>
            ) : (
              /* Disconnected – editable inputs */
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={kiwiConfig.host}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setKiwiConfig((p: any) => ({ ...p, host: e.target.value }))}
                  placeholder="sdr.host.com"
                  disabled={!connected || kiwiConnecting}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-slate-300 w-36 focus:outline-none focus:border-indigo-500 disabled:opacity-40"
                />
                <span className="text-slate-600">:</span>
                <input
                  type="number"
                  value={kiwiConfig.port}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setKiwiConfig((p: any) => ({ ...p, port: Number(e.target.value) || 8073 }))}
                  placeholder="8073"
                  disabled={!connected || kiwiConnecting}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-slate-300 w-16 focus:outline-none focus:border-indigo-500 disabled:opacity-40"
                />
                <span className="text-slate-600 px-0.5">@</span>
                <input
                  type="number"
                  value={kiwiConfig.freq}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setKiwiConfig((p: any) => ({ ...p, freq: Number(e.target.value) || 14074 }))}
                  placeholder="14074"
                  disabled={!connected || kiwiConnecting}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-slate-300 w-20 focus:outline-none focus:border-indigo-500 disabled:opacity-40"
                />
                <span className="text-slate-600 text-[10px]">kHz</span>
              </div>
            )}
            <button
              onClick={kiwiConnected ? handleKiwiDisconnect : handleKiwiConnect}
              disabled={!connected || kiwiConnecting}
              className={`
                px-3 py-1.5 rounded font-mono text-xs font-bold uppercase tracking-wider
                transition-colors duration-150 focus:outline-none
                ${kiwiConnected
                  ? 'bg-rose-600/20 border border-rose-500/30 text-rose-400 hover:bg-rose-600/40'
                  : kiwiConnecting
                    ? 'bg-slate-800 border border-slate-700 text-slate-500 cursor-wait'
                    : 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-600/40 disabled:opacity-40 disabled:cursor-not-allowed'}
              `}
            >
              {kiwiConnected ? 'Disconnect SDR' : kiwiConnecting ? 'Connecting…' : 'Connect SDR'}
            </button>
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-slate-800 shrink-0" />

          {/* JS8Call frequency / station */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-2.5 py-1.5 rounded">
            <Signal className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="font-semibold text-emerald-400 font-mono">{statusLine.freq}</span>
          </div>
          <div className="text-slate-400">
            <span className="text-slate-600">CALL </span>
            <span className="text-slate-300 font-semibold">{statusLine.callsign}</span>
          </div>
          <div className="text-slate-400">
            <span className="text-slate-600">GRID </span>
            <span className="text-slate-300">{statusLine.grid}</span>
          </div>
        </div>

        {/* Right: connection state */}
        <div className="flex items-center gap-3 text-xs">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded border ${connected
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            {connected ? 'BRIDGE' : 'OFFLINE'}
          </div>
          <div className={`flex items-center gap-1.5 text-xs ${js8Connected ? 'text-cyan-400' : 'text-slate-600'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${js8Connected ? 'bg-cyan-400' : 'bg-slate-700'}`} />
            {js8Connected ? 'JS8CALL' : 'NO RADIO'}
          </div>
        </div>
      </header>

      {/* ── MAIN BODY ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* MESSAGE LOG – left, dominant, bottom-anchored like a chat terminal */}
        <main className="flex-1 flex flex-col overflow-y-auto p-4" ref={logContainerRef}>
          {/* Push messages to the bottom when the log is sparse */}
          <div className="flex-1 flex flex-col justify-end">
            <div className="space-y-1.5">
              {logEntries.length === 0 && (
                <div className="text-center p-8 text-slate-600 italic text-xs">
                  Listening for JS8Call traffic…
                </div>
              )}
              {logEntries.map((entry) => (
                <LogEntry key={entry.id} entry={entry} />
              ))}
              <div ref={logBottomRef} />
            </div>
          </div>
        </main>

        {/* HEARD STATIONS – right sidebar */}
        <aside className="w-72 bg-slate-900/50 border-l border-slate-800 hidden md:flex flex-col shrink-0">
          <div className="p-3 border-b border-slate-800 bg-slate-900">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Heard Stations
              <span className="ml-auto text-slate-600 font-normal">{sortedStations.length}</span>
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {sortedStations.length === 0 ? (
              <div className="text-center p-4 text-slate-600 italic text-xs">
                Listening for heartbeats…
              </div>
            ) : (
              sortedStations.map((s) => (
                <StationCard
                  key={s.callsign}
                  station={s}
                  isNew={newCallsigns.has(s.callsign)}
                />
              ))
            )}
          </div>
        </aside>
      </div>

      {/* ── TRANSMIT PANEL ── */}
      <footer className="shrink-0 bg-slate-900 border-t border-slate-800">
        {/* TX form */}
        <form onSubmit={handleSend} className="flex items-center gap-2 px-4 py-2.5">
          <span className="text-slate-600 text-xs">TO</span>
          <input
            type="text"
            value={txTarget}
            onChange={(e) => setTxTarget(e.target.value.toUpperCase())}
            placeholder="@ALLCALL"
            maxLength={20}
            disabled={!connected}
            className="
              bg-slate-950 border border-slate-700 rounded px-2 py-1.5
              font-mono text-xs text-cyan-300 w-28
              focus:outline-none focus:border-indigo-500
              disabled:opacity-40 uppercase tracking-wider
            "
          />
          <input
            type="text"
            value={txMessage}
            onChange={(e) => setTxMessage(e.target.value.toUpperCase())}
            placeholder={connected ? 'TYPE MESSAGE AND PRESS ENTER…' : 'NOT CONNECTED'}
            maxLength={160}
            disabled={!connected || txPending}
            autoComplete="off"
            spellCheck={false}
            className="
              flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-1.5
              font-mono text-xs text-slate-100
              focus:outline-none focus:border-indigo-500
              disabled:opacity-40 disabled:cursor-not-allowed
              uppercase
            "
          />
          <span className={`text-[10px] font-mono w-10 text-right ${txMessage.length > 140 ? 'text-red-400' : 'text-slate-600'}`}>
            {txMessage.length}/160
          </span>
          <button
            type="submit"
            disabled={!connected || !txMessage.trim() || txPending}
            className="
              px-4 py-1.5 rounded font-mono text-xs font-bold uppercase tracking-widest
              transition-colors duration-150
              bg-indigo-600 text-white hover:bg-indigo-500
              disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed
              focus:outline-none focus:ring-2 focus:ring-indigo-500
            "
          >
            {txPending ? 'TX…' : 'SEND'}
          </button>
        </form>

        {/* Status bar */}
        <div className="flex items-center justify-between px-4 pb-2 text-[10px] text-slate-600">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Globe className="w-3 h-3" />
              <span>KiwiSDR: <span className="text-slate-400">{statusLine.freq}</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <Wifi className="w-3 h-3" />
              <span>
                Bridge:{' '}
                <span className={connected ? 'text-emerald-500' : 'text-rose-500'}>
                  {connected ? 'Connected' : 'Reconnecting…'}
                </span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {txPending && (
              <span className="animate-pulse text-indigo-400">● Transmitting (~15s)</span>
            )}
            <span>{new Date().toISOString().slice(11, 19)} UTC</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
