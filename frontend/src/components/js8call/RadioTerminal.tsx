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
  Server,
  ChevronDown,
} from 'lucide-react';
import type { KiwiNode } from '../../types';
import KiwiNodeBrowser from './KiwiNodeBrowser';
import { JS8_BAND_PRESETS, JS8_SPEED_MODES } from '../../constants/js8Presets';
import type { JS8SpeedMode } from '../../constants/js8Presets';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const WS_URL =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_JS8_WS_URL
    ? import.meta.env.VITE_JS8_WS_URL
    : 'ws://localhost/js8/ws/js8';

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

/**
 * Map SNR to a colour based on JS8Call decode thresholds:
 *   ≥ −18 dB → all speed modes decode  (emerald)
 *   ≥ −24 dB → Normal / Slow decode    (yellow)
 *   < −24 dB → Slow-only or no decode  (red)
 */
function snrColor(snr: number | null): string {
  if (snr == null) return 'text-slate-500';
  if (snr >= -18) return 'text-emerald-400';
  if (snr >= -24) return 'text-yellow-400';
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
        flex items-center justify-between p-2 rounded-lg
        border backdrop-blur-sm transition-all duration-300
        ${isNew
          ? 'border-indigo-500/40 bg-indigo-950/40 shadow-[0_0_15px_rgba(99,102,241,0.15)]'
          : 'border-white/5 bg-black/20 hover:border-white/10 hover:bg-black/40'}
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
      <div className="flex items-start gap-3 p-2.5 rounded-lg bg-black/30 backdrop-blur-sm border border-white/5 text-slate-400 italic">
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
      group flex items-start gap-3 p-2.5 rounded-lg border backdrop-blur-sm transition-all duration-200
      ${isLocal 
        ? 'bg-indigo-950/20 border-indigo-500/20 hover:bg-indigo-950/40 shadow-[0_0_10px_rgba(99,102,241,0.05)]' 
        : 'bg-black/20 border-white/5 hover:bg-black/40 hover:border-white/10'}
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
  // Track the actual connected state to detect changes
  const [activeKiwiConfig, setActiveKiwiConfig] = useState<any>(null);
  const [kiwiConnected, setKiwiConnected] = useState(false);
  const [kiwiConnecting, setKiwiConnecting] = useState(false);

  const [kiwiPanelOpen, setKiwiPanelOpen] = useState(false);

  const [isEditingFreq, setIsEditingFreq] = useState(false);
  const [tempFreq, setTempFreq] = useState('');

  // JS8 speed mode (Normal | Fast | Turbo | Slow)
  const [js8Mode, setJs8Mode] = useState<JS8SpeedMode['id']>('NORMAL');

  // Live UTC clock for the status bar
  const [utcTime, setUtcTime] = useState(() => new Date().toUTCString().slice(17, 25));

  // ── Refs ───────────────────────────────────────────────────────────────────
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<any>(null);
  const reconnectDelay = useRef(RECONNECT_BASE_MS);
  const logBottomRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const sdrContainerRef = useRef<HTMLDivElement>(null);

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

  // UTC clock — updates every second
  useEffect(() => {
    const id = setInterval(() => {
      setUtcTime(new Date().toUTCString().slice(17, 25));
    }, 1000);
    return () => clearInterval(id);
  }, []);

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
        const c = payload.callsign || '--';
        const g = payload.grid || '----';
        setStatusLine(prev => ({ ...prev, callsign: c, grid: g }));
        if (payload.kiwi_connected) {
          setKiwiConnected(true);
          setKiwiConfig((prev: any) => {
            const next = {
              ...prev,
              host: payload.kiwi_host || prev.host,
              port: payload.kiwi_port || prev.port,
              freq: payload.kiwi_freq || prev.freq,
              mode: payload.kiwi_mode || prev.mode,
            };
            setActiveKiwiConfig(next);
            return next;
          });
          appendSystem(`SDR already connected: ${payload.kiwi_host}:${payload.kiwi_port} @ ${payload.kiwi_freq} kHz`);
        } else {
          appendSystem(payload.message || 'Bridge connected (No SDR)');
        }
        return;
      }

      if (type === 'KIWI.STATUS') {
        setKiwiConnected(payload.connected ?? false);
        setKiwiConnecting(false);
        if (payload.connected && payload.host) {
          const newConfig = {
            host: payload.host,
            port: payload.port,
            freq: payload.freq,
            mode: payload.mode || 'usb',
          };
          setKiwiConfig(newConfig);
          setActiveKiwiConfig(newConfig);
        } else {
          setActiveKiwiConfig(null);
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
        setKiwiConnecting(false);
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

  const handleFreqSubmit = useCallback(() => {
    setIsEditingFreq(false);
    if (!activeKiwiConfig || !connected) return;
    const newFreq = parseInt(tempFreq, 10);
    if (!isNaN(newFreq) && newFreq !== activeKiwiConfig.freq) {
      setKiwiConnecting(true);
      setKiwiConfig(prev => ({ ...prev, freq: newFreq }));
      wsRef.current?.send(JSON.stringify({
        action: 'SET_KIWI',
        host: activeKiwiConfig.host,
        port: activeKiwiConfig.port,
        freq: newFreq,
        mode: activeKiwiConfig.mode,
      }));
    }
  }, [activeKiwiConfig, tempFreq, connected]);

  // Tune to a band preset — retunes existing SDR connection or updates pending config
  const handleBandSelect = useCallback((freqKhz: number) => {
    if (!connected) return;
    setKiwiConfig(prev => ({ ...prev, freq: freqKhz }));
    if (activeKiwiConfig) {
      setKiwiConnecting(true);
      wsRef.current?.send(JSON.stringify({
        action: 'SET_KIWI',
        host: activeKiwiConfig.host,
        port: activeKiwiConfig.port,
        freq: freqKhz,
        mode: activeKiwiConfig.mode,
      }));
    }
  }, [connected, activeKiwiConfig]);

  // Change JS8Call frame speed mode
  const handleModeSelect = useCallback((modeId: JS8SpeedMode['id']) => {
    setJs8Mode(modeId);
    if (!connected) return;
    wsRef.current?.send(JSON.stringify({ action: 'SET_MODE', mode: modeId }));
  }, [connected]);

  // Connect to a node picked from the browser — keeps current freq/mode
  const handleNodeConnect = useCallback((node: KiwiNode) => {
    if (!connected || kiwiConnecting) return;
    setKiwiConnecting(true);
    setKiwiConfig(prev => ({ ...prev, host: node.host, port: node.port }));
    wsRef.current?.send(JSON.stringify({
      action: 'SET_KIWI',
      host: node.host,
      port: node.port,
      freq: kiwiConfig.freq,
      mode: kiwiConfig.mode,
    }));
  }, [connected, kiwiConnecting, kiwiConfig.freq, kiwiConfig.mode]);

  // ── Sorted station array ───────────────────────────────────────────────────

  const sortedStations = useMemo(
    () => Object.values(stations).sort((a: Station, b: Station) => (b.ts_unix || 0) - (a.ts_unix || 0)),
    [stations]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-slate-950/80 text-slate-200 font-mono text-sm selection:bg-indigo-500/30 overflow-hidden relative">
      
      {/* Subtle background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* ── HEADER ── */}
      <header className="flex items-center justify-between px-5 h-16 bg-black/40 backdrop-blur-md border-b border-white/10 shrink-0 z-10 shadow-lg relative">
        {/* Left: brand */}
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-indigo-500/10 rounded-md border border-indigo-500/20">
            <Radio className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="font-bold text-slate-100 tracking-wider text-sm uppercase">JS8Call Terminal</h1>
          </div>
        </div>

        {/* Center: KiwiSDR config widget + JS8Call station info */}
        <div className="flex items-center gap-3 text-xs">

          {/* SDR node selector — opens the KiwiNodeBrowser floating panel */}
          <div className="relative" ref={sdrContainerRef}>
            <button
              onClick={() => setKiwiPanelOpen(v => !v)}
              disabled={!connected}
              className={`
                flex items-center gap-2 px-3.5 py-1.5 rounded-md border text-xs transition-all duration-200 backdrop-blur-sm shadow-sm
                ${kiwiConnected
                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-500/50 hover:shadow-[0_0_10px_rgba(99,102,241,0.2)]'
                  : 'bg-black/30 border-white/10 text-slate-400 hover:bg-black/50 hover:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed'}
              `}
            >
              <Server className="w-3.5 h-3.5 shrink-0" />
              {kiwiConnecting ? (
                <span className="text-slate-500">Connecting…</span>
              ) : kiwiConnected && activeKiwiConfig ? (
                <>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="truncate max-w-[140px]">{activeKiwiConfig.host}</span>
                  <span className="text-slate-600">@</span>
                  <span className="text-emerald-400">{activeKiwiConfig.freq} kHz</span>
                </>
              ) : (
                <span>Browse SDR Nodes</span>
              )}
              <ChevronDown className={`w-3 h-3 text-slate-600 ml-0.5 transition-transform duration-150 ${kiwiPanelOpen ? 'rotate-180' : ''}`} />
            </button>

            <KiwiNodeBrowser
              isOpen={kiwiPanelOpen}
              onClose={() => setKiwiPanelOpen(false)}
              containerRef={sdrContainerRef}
              currentFreqKhz={kiwiConfig.freq}
              activeConfig={activeKiwiConfig}
              kiwiConnected={kiwiConnected}
              kiwiConnecting={kiwiConnecting}
              bridgeConnected={connected}
              onConnect={handleNodeConnect}
              onDisconnect={handleKiwiDisconnect}
              manualConfig={kiwiConfig}
              onManualConfigChange={(patch) => setKiwiConfig((p: any) => ({ ...p, ...patch }))}
              onManualConnect={handleKiwiConnect}
            />
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-slate-800 shrink-0" />

          {/* JS8Call frequency / station */}
          <div 
            className="flex items-center gap-2.5 bg-black/40 backdrop-blur-sm border border-white/10 px-3 py-1.5 rounded-md cursor-pointer hover:border-indigo-500/40 hover:bg-black/60 transition-all shadow-inner"
            title="Click to change frequency"
            onClick={() => {
              if (activeKiwiConfig && !isEditingFreq) {
                setTempFreq(activeKiwiConfig.freq.toString());
                setIsEditingFreq(true);
              }
            }}
          >
            <Signal className="w-4 h-4 text-emerald-400 shrink-0 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]" />
            {isEditingFreq ? (
              <div className="flex items-center gap-1.5 font-mono text-emerald-400 font-semibold max-w-[120px]">
                <input
                  type="number"
                  className="bg-black/50 border-b border-emerald-500 text-emerald-300 w-16 outline-none appearance-none font-mono font-semibold px-1 rounded-sm focus:bg-black/70 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={tempFreq}
                  autoFocus
                  onChange={(e) => setTempFreq(e.target.value)}
                  onBlur={handleFreqSubmit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleFreqSubmit();
                    if (e.key === 'Escape') setIsEditingFreq(false);
                  }}
                />
                <span className="text-emerald-500/70">kHz</span>
              </div>
            ) : (
              <span className="font-semibold text-emerald-400 font-mono tracking-wide drop-shadow-[0_0_2px_rgba(52,211,153,0.3)]">
                {activeKiwiConfig ? `${activeKiwiConfig.freq} kHz` : '--'}
              </span>
            )}
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
        <div className="flex items-center gap-3 text-xs font-semibold tracking-wide">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border backdrop-blur-sm shadow-sm transition-all duration-300 ${connected
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.15)]'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse shadow-[0_0_5px_currentColor]' : 'bg-rose-500'}`} />
            {connected ? 'BRIDGE' : 'OFFLINE'}
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border backdrop-blur-sm transition-all duration-300 ${js8Connected 
            ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.15)]' 
            : 'bg-black/30 border-white/5 text-slate-500'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${js8Connected ? 'bg-cyan-400 shadow-[0_0_5px_currentColor]' : 'bg-slate-600'}`} />
            {js8Connected ? 'JS8CALL' : 'NO RADIO'}
          </div>
        </div>
      </header>

      {/* ── BAND + MODE BAR ── */}
      <div className="shrink-0 bg-black/30 border-b border-white/10 px-3 py-1.5 flex items-center gap-4 overflow-x-auto z-10 relative">
        {/* Band presets */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-slate-600 uppercase tracking-widest mr-1 shrink-0">Band</span>
          {JS8_BAND_PRESETS.map((preset) => {
            const isActive = activeKiwiConfig?.freq === preset.freqKhz;
            return (
              <button
                key={preset.label}
                onClick={() => handleBandSelect(preset.freqKhz)}
                disabled={!connected}
                title={`${(preset.freqKhz / 1000).toFixed(3)} MHz — ${preset.note}`}
                className={`
                  relative px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-all duration-150
                  disabled:opacity-30 disabled:cursor-not-allowed
                  ${isActive
                    ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.2)]'
                    : preset.primary
                      ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-500/40'
                      : 'bg-black/30 border border-white/10 text-slate-400 hover:bg-black/50 hover:text-slate-300 hover:border-white/20'
                  }
                `}
              >
                {preset.label}
                {preset.primary && !isActive && (
                  <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-indigo-400" />
                )}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="w-px h-4 bg-slate-800 shrink-0" />

        {/* Speed mode selector */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-slate-600 uppercase tracking-widest mr-1 shrink-0">Speed</span>
          {JS8_SPEED_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => handleModeSelect(m.id)}
              title={`${m.label} — ${m.frameSec}s frames, min SNR ${m.snrThreshold} dB. ${m.note}`}
              className={`
                px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold transition-all duration-150
                ${js8Mode === m.id
                  ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 shadow-[0_0_6px_rgba(6,182,212,0.2)]'
                  : 'bg-black/30 border border-white/10 text-slate-400 hover:bg-black/50 hover:text-slate-300 hover:border-white/20'
                }
              `}
            >
              {m.label}
            </button>
          ))}
          <span className="text-[10px] text-slate-600 ml-1 hidden sm:inline">
            ({JS8_SPEED_MODES.find(m => m.id === js8Mode)?.frameSec}s / min {JS8_SPEED_MODES.find(m => m.id === js8Mode)?.snrThreshold} dB)
          </span>
        </div>
      </div>

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
        <aside className="w-72 bg-black/30 backdrop-blur-md border-l border-white/10 hidden md:flex flex-col shrink-0 relative z-10 shadow-[-5px_0_15px_rgba(0,0,0,0.2)]">
          <div className="p-3 border-b border-white/10 bg-black/40 shadow-sm relative">
            {/* Subtle glow on top of sidebar */}
            <div className="absolute top-0 right-0 w-32 h-1 bg-indigo-500/30 blur-md pointer-events-none" />
            <h2 className="text-xs font-bold text-indigo-300/80 uppercase tracking-widest flex items-center gap-2 drop-shadow-[0_0_2px_rgba(99,102,241,0.2)]">
              <Activity className="w-4 h-4 text-indigo-400" />
              Heard Stations
              <span className="ml-auto text-indigo-200/50 font-mono font-normal">[{sortedStations.length}]</span>
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
      <footer className="shrink-0 bg-black/50 backdrop-blur-xl border-t border-white/10 z-20 relative">
        {/* Subtle glow underneath footer */}
        <div className="absolute bottom-0 left-0 w-full h-1/2 bg-indigo-500/5 blur-xl pointer-events-none" />
        
        {/* TX form */}
        <form onSubmit={handleSend} className="flex items-center gap-3 px-5 py-3 relative z-10">
          <span className="text-slate-500 font-semibold text-xs tracking-wider">TO</span>
          <input
            type="text"
            value={txTarget}
            onChange={(e) => setTxTarget(e.target.value.toUpperCase())}
            placeholder="@ALLCALL"
            maxLength={20}
            disabled={!connected}
            className="
              bg-black/40 border border-white/10 rounded-md px-3 py-2 w-32
              font-mono text-xs font-bold text-indigo-300 uppercase tracking-wider
              focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30
              disabled:opacity-40 transition-all shadow-inner
            "
          />
          <div className="flex-1 flex items-center gap-3">
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
                flex-1 bg-black/40 border border-white/10 rounded-md px-4 py-2
                font-mono text-sm text-slate-100 uppercase
                focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-all shadow-inner placeholder:text-slate-600
              "
            />
            <span className={`text-[10px] font-mono w-12 text-right ${txMessage.length > 140 ? 'text-red-400 font-bold' : 'text-slate-500'}`}>
              {txMessage.length}/160
            </span>
          </div>
          <button
            type="submit"
            disabled={!connected || !txMessage.trim() || txPending}
            className="
              px-6 py-2 rounded-md font-mono text-xs font-bold uppercase tracking-widest
              transition-all duration-200 shadow-[0_0_10px_rgba(79,70,229,0.2)] border
              bg-indigo-600 hover:bg-indigo-500 hover:shadow-[0_0_15px_rgba(79,70,229,0.4)]
              border-indigo-400/30 text-white
              disabled:bg-black/40 disabled:text-slate-500 disabled:border-white/5
              disabled:cursor-not-allowed disabled:shadow-none
              focus:outline-none focus:ring-2 focus:ring-indigo-500/50
            "
          >
            {txPending ? 'TX…' : 'SEND'}
          </button>
        </form>

        {/* Status bar */}
        <div className="flex items-center gap-4 px-5 pb-2 text-[10px] text-slate-600 font-mono relative z-10">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span className="text-slate-500">{utcTime} UTC</span>
          </span>
          <span>·</span>
          <span>
            Mode: <span className="text-slate-400">{js8Mode}</span>
          </span>
          <span>·</span>
          <span>
            Stations: <span className="text-slate-400">{sortedStations.length}</span>
          </span>
          {activeKiwiConfig && (
            <>
              <span>·</span>
              <span>
                SDR: <span className="text-slate-400">{activeKiwiConfig.host}</span>
              </span>
            </>
          )}
        </div>

      </footer>
    </div>
  );
}
