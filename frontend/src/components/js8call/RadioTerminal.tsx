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
import type { 
  KiwiNode, 
  JS8Station, 
  JS8LogEntry, 
  JS8StatusLine 
} from '../../types';
import KiwiNodeBrowser from './KiwiNodeBrowser';
import { 
  JS8_BAND_PRESETS, 
  JS8_SPEED_MODES 
} from '../../constants/js8Presets';
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

interface RadioTerminalProps {
  stations: JS8Station[];
  logEntries: JS8LogEntry[];
  statusLine: JS8StatusLine;
  connected: boolean;
  js8Connected: boolean;
  kiwiConnecting: boolean;
  activeKiwiConfig: any;
  js8Mode: string;
  sendMessage: (target: string, message: string) => void;
  sendAction: (payload: object) => void;
}

export default function RadioTerminal({
  stations: sharedStations,
  logEntries: sharedLogEntries,
  statusLine: sharedStatusLine,
  connected: bridgeConnected,
  js8Connected: js8IsConnected,
  kiwiConnecting: kiwiIsConnecting,
  activeKiwiConfig: sharedActiveKiwiConfig,
  js8Mode: sharedJs8Mode,
  sendMessage,
  sendAction,
}: RadioTerminalProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [txTarget, setTxTarget] = useState('@ALLCALL');
  const [txMessage, setTxMessage] = useState('');
  const [txPending, setTxPending] = useState(false);

  const [kiwiConfig, setKiwiConfig] = useState({
    host: KIWI_DEFAULT_HOST,
    port: KIWI_DEFAULT_PORT,
    freq: KIWI_DEFAULT_FREQ,
    mode: 'usb',
  });

  const [kiwiPanelOpen, setKiwiPanelOpen] = useState(false);

  const [isEditingFreq, setIsEditingFreq] = useState(false);
  const [isEditingCall, setIsEditingCall] = useState(false);
  const [tempCall, setTempCall] = useState('');
  const [isEditingGrid, setIsEditingGrid] = useState(false);
  const [tempGrid, setTempGrid] = useState('');
  const [tempFreq, setTempFreq] = useState('');

  // Live UTC clock for the status bar
  const [utcTime, setUtcTime] = useState(() => new Date().toUTCString().slice(17, 25));

  // ── Refs ───────────────────────────────────────────────────────────────────
  const logBottomRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const sdrContainerRef = useRef<HTMLDivElement>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────

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
  }, [sharedLogEntries, scrollToBottom]);

  // UTC clock — updates every second
  useEffect(() => {
    const id = setInterval(() => {
      setUtcTime(new Date().toUTCString().slice(17, 25));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Transmit handler ───────────────────────────────────────────────────────

  const handleSend = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const msg = txMessage.trim();
    if (!msg || !bridgeConnected || txPending) return;
    sendMessage(txTarget.trim() || '@ALLCALL', msg);
    setTxMessage('');
    setTxPending(true);
    setTimeout(() => setTxPending(false), 16000);
  }, [bridgeConnected, txMessage, txTarget, txPending, sendMessage]);

  // ── KiwiSDR connect / disconnect ───────────────────────────────────────────

  const handleKiwiConnect = useCallback(() => {
    if (!bridgeConnected || kiwiIsConnecting) return;
    sendAction({
      action: 'SET_KIWI',
      host: kiwiConfig.host,
      port: Number(kiwiConfig.port),
      freq: Number(kiwiConfig.freq),
      mode: kiwiConfig.mode,
    });
  }, [bridgeConnected, kiwiIsConnecting, kiwiConfig, sendAction]);

  const handleKiwiDisconnect = useCallback(() => {
    if (!bridgeConnected) return;
    sendAction({ action: 'DISCONNECT_KIWI' });
  }, [bridgeConnected, sendAction]);

  const handleFreqSubmit = useCallback(() => {
    setIsEditingFreq(false);
    if (!sharedActiveKiwiConfig || !bridgeConnected) return;
    const newFreq = parseInt(tempFreq, 10);
    if (!isNaN(newFreq) && newFreq !== sharedActiveKiwiConfig.freq) {
      sendAction({
        action: 'SET_KIWI',
        host: sharedActiveKiwiConfig.host,
        port: sharedActiveKiwiConfig.port,
        freq: newFreq,
        mode: sharedActiveKiwiConfig.mode,
      });
    }
  }, [sharedActiveKiwiConfig, tempFreq, bridgeConnected, sendAction]);

  const handleCallSubmit = useCallback(() => {
    setIsEditingCall(false);
    const val = tempCall.trim().toUpperCase();
    if (!val || !bridgeConnected) return;
    sendAction({ action: 'SET_STATION', callsign: val });
  }, [tempCall, bridgeConnected, sendAction]);

  const handleGridSubmit = useCallback(() => {
    setIsEditingGrid(false);
    const val = tempGrid.trim().toUpperCase();
    if (!val || !bridgeConnected) return;
    sendAction({ action: 'SET_STATION', grid: val });
  }, [tempGrid, bridgeConnected, sendAction]);

  // Tune to a band preset — retunes existing SDR connection or updates pending config
  const handleBandSelect = useCallback((freqKhz: number) => {
    if (!bridgeConnected) return;
    setKiwiConfig(prev => ({ ...prev, freq: freqKhz }));
    if (sharedActiveKiwiConfig) {
      sendAction({
        action: 'SET_KIWI',
        host: sharedActiveKiwiConfig.host,
        port: sharedActiveKiwiConfig.port,
        freq: freqKhz,
        mode: sharedActiveKiwiConfig.mode,
      });
    }
  }, [bridgeConnected, sharedActiveKiwiConfig, sendAction]);

  // Change JS8Call frame speed mode
  const handleModeSelect = useCallback((modeId: JS8SpeedMode['id']) => {
    if (!bridgeConnected) return;
    sendAction({ action: 'SET_MODE', mode: modeId });
  }, [bridgeConnected, sendAction]);

  // Connect to a node picked from the browser — keeps current freq/mode
  const handleNodeConnect = useCallback((node: KiwiNode) => {
    if (!bridgeConnected || kiwiIsConnecting) return;
    setKiwiConfig(prev => ({ ...prev, host: node.host, port: node.port }));
    sendAction({
      action: 'SET_KIWI',
      host: node.host,
      port: node.port,
      freq: kiwiConfig.freq,
      mode: kiwiConfig.mode,
    });
  }, [bridgeConnected, kiwiIsConnecting, kiwiConfig.freq, kiwiConfig.mode, sendAction]);

  // ── Sorted station array ───────────────────────────────────────────────────

  const sortedStations = useMemo(
    () => [...sharedStations].sort((a, b) => (b.ts_unix || 0) - (a.ts_unix || 0)),
    [sharedStations]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-slate-950/80 text-slate-200 font-mono text-sm selection:bg-indigo-500/30 overflow-hidden relative">
      
      {/* Subtle background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* ── HEADER ── */}
      <header className="flex items-center justify-between px-5 h-16 bg-slate-950 border-b border-white/10 shrink-0 z-30 shadow-lg relative">
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
              disabled={!bridgeConnected}
              className={`
                flex items-center gap-2 px-3.5 py-1.5 rounded-md border text-xs transition-all duration-200 backdrop-blur-sm shadow-sm
                ${sharedActiveKiwiConfig
                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-500/50 hover:shadow-[0_0_10px_rgba(99,102,241,0.2)]'
                  : 'bg-black/30 border-white/10 text-slate-400 hover:bg-black/50 hover:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed'}
              `}
            >
              <Server className="w-3.5 h-3.5 shrink-0" />
              {sharedActiveKiwiConfig ? (
                <div className="flex items-center gap-1.5 text-rose-400 hover:text-rose-300 transition-colors">
                  <Activity className="w-3.5 h-3.5" />
                  <span>{sharedActiveKiwiConfig.host}:{sharedActiveKiwiConfig.port}</span>
                </div>
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
              activeConfig={sharedActiveKiwiConfig}
              kiwiConnected={!!sharedActiveKiwiConfig}
              kiwiConnecting={kiwiIsConnecting}
              bridgeConnected={bridgeConnected}
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
              if (sharedActiveKiwiConfig && !isEditingFreq) {
                setTempFreq(sharedActiveKiwiConfig.freq.toString());
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
                {sharedActiveKiwiConfig ? `${sharedActiveKiwiConfig.freq} kHz` : '--'}
              </span>
            )}
          </div>
          {/* Editable CALL */}
          <div
            className="flex items-center gap-1 text-slate-400 cursor-pointer group"
            title="Click to edit callsign"
            onClick={() => { if (!isEditingCall) { setTempCall(sharedStatusLine.callsign); setIsEditingCall(true); } }}
          >
            <span className="text-slate-600">CALL </span>
            {isEditingCall ? (
              <input
                type="text"
                className="bg-black/50 border-b border-indigo-500 text-indigo-300 w-20 outline-none font-mono font-semibold px-1 rounded-sm text-xs uppercase tracking-wider focus:bg-black/70 transition-colors"
                value={tempCall}
                autoFocus
                onChange={e => setTempCall(e.target.value.toUpperCase())}
                onBlur={handleCallSubmit}
                onKeyDown={e => { if (e.key === 'Enter') handleCallSubmit(); if (e.key === 'Escape') setIsEditingCall(false); }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="text-slate-300 font-semibold group-hover:text-indigo-300 transition-colors">{sharedStatusLine.callsign}</span>
            )}
          </div>

          {/* Editable GRID */}
          <div
            className="flex items-center gap-1 text-slate-400 cursor-pointer group"
            title="Click to edit grid square"
            onClick={() => { if (!isEditingGrid) { setTempGrid(sharedStatusLine.grid); setIsEditingGrid(true); } }}
          >
            <span className="text-slate-600">GRID </span>
            {isEditingGrid ? (
              <input
                type="text"
                className="bg-black/50 border-b border-indigo-500 text-indigo-300 w-14 outline-none font-mono font-semibold px-1 rounded-sm text-xs uppercase tracking-wider focus:bg-black/70 transition-colors"
                value={tempGrid}
                autoFocus
                maxLength={6}
                onChange={e => setTempGrid(e.target.value.toUpperCase())}
                onBlur={handleGridSubmit}
                onKeyDown={e => { if (e.key === 'Enter') handleGridSubmit(); if (e.key === 'Escape') setIsEditingGrid(false); }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="text-slate-300 group-hover:text-indigo-300 transition-colors">{sharedStatusLine.grid}</span>
            )}
          </div>
        </div>

        {/* Right: connection state */}
        <div className="flex items-center gap-3 text-xs font-semibold tracking-wide">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border backdrop-blur-sm shadow-sm transition-all duration-300 ${bridgeConnected
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.15)]'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${bridgeConnected ? 'bg-emerald-400 animate-pulse shadow-[0_0_5px_currentColor]' : 'bg-rose-500'}`} />
            {bridgeConnected ? 'BRIDGE' : 'OFFLINE'}
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border backdrop-blur-sm transition-all duration-300 ${js8IsConnected 
            ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.15)]' 
            : 'bg-black/30 border-white/5 text-slate-500'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${js8IsConnected ? 'bg-cyan-400 shadow-[0_0_5px_currentColor]' : 'bg-slate-600'}`} />
            {js8IsConnected ? 'JS8CALL' : 'NO RADIO'}
          </div>
        </div>
      </header>

      {/* ── BAND + MODE BAR ── */}
      <div className="shrink-0 bg-black/30 border-b border-white/10 px-3 py-1.5 flex items-center gap-4 overflow-x-auto z-10 relative">
        {/* Band presets */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-slate-600 uppercase tracking-widest mr-1 shrink-0">Band</span>
          {JS8_BAND_PRESETS.map((preset) => {
            const isActive = sharedActiveKiwiConfig?.freq === preset.freqKhz;
            return (
              <button
                key={preset.label}
                onClick={() => handleBandSelect(preset.freqKhz)}
                disabled={!bridgeConnected}
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
                ${sharedJs8Mode === m.id
                  ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 shadow-[0_0_6px_rgba(6,182,212,0.2)]'
                  : 'bg-black/30 border border-white/10 text-slate-400 hover:bg-black/50 hover:text-slate-300 hover:border-white/20'
                }
              `}
            >
              {m.label}
            </button>
          ))}
          <span className="text-[10px] text-slate-600 ml-1 hidden sm:inline">
            ({JS8_SPEED_MODES.find(m => m.id === sharedJs8Mode)?.frameSec}s / min {JS8_SPEED_MODES.find(m => m.id === sharedJs8Mode)?.snrThreshold} dB)
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
              {sharedLogEntries.length === 0 && (
                <div className="text-center p-8 text-slate-600 italic text-xs">
                  Listening for JS8Call traffic…
                </div>
              )}
              {sharedLogEntries.map((entry) => (
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
                  isNew={false}
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
            disabled={!bridgeConnected}
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
              placeholder={bridgeConnected ? 'TYPE MESSAGE AND PRESS ENTER…' : 'NOT CONNECTED'}
              maxLength={160}
              disabled={!bridgeConnected || txPending}
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
            disabled={!bridgeConnected || !txMessage.trim() || txPending}
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
            Mode: <span className="text-slate-400">{sharedJs8Mode}</span>
          </span>
          <span>·</span>
          <span>
            Stations: <span className="text-slate-400">{sortedStations.length}</span>
          </span>
          {sharedActiveKiwiConfig && (
            <>
              <span>·</span>
              <span>
                SDR: <span className="text-slate-400">{sharedActiveKiwiConfig.host}</span>
              </span>
            </>
          )}
        </div>

      </footer>
    </div>
  );
}
