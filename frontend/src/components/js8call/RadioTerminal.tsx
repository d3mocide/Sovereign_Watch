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

import {
  Activity,
  ChevronDown,
  Clock,
  Globe,
  Headphones,
  MapPin,
  Radio,
  Server,
  Signal,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { JS8SpeedMode } from "../../constants/js8Presets";
import {
  GHOSTNET_FREQ_PRESETS,
  GHOSTNET_GROUPS,
  GHOSTNET_SCHEDULE,
  JS8_BAND_PRESETS,
  JS8_SPEED_MODES,
} from "../../constants/js8Presets";
import { useListenAudio } from "../../hooks/useListenAudio";
import type {
  JS8LogEntry,
  JS8Station,
  JS8StatusLine,
  KiwiConfig,
  KiwiNode,
  WebSDRNode,
} from "../../types";
import KiwiNodeBrowser from "./KiwiNodeBrowser";
import ListeningPost from "./ListeningPost";
import WebSDRDiscovery from "./WebSDRDiscovery";
import WebSDRPanel from "./WebSDRPanel";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// WS_URL removed (unused)

const KIWI_DEFAULT_HOST =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_KIWI_HOST
    ? import.meta.env.VITE_KIWI_HOST
    : "kiwisdr.example.com";
const KIWI_DEFAULT_PORT =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_KIWI_PORT
    ? Number(import.meta.env.VITE_KIWI_PORT)
    : 8073;
const KIWI_DEFAULT_FREQ =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_KIWI_FREQ
    ? Number(import.meta.env.VITE_KIWI_FREQ)
    : 14074;

// Reconnect constants removed (unused)

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Map SNR to a colour based on JS8Call decode thresholds:
 *   ≥ −18 dB → all speed modes decode  (emerald)
 *   ≥ −24 dB → Normal / Slow decode    (yellow)
 *   < −24 dB → Slow-only or no decode  (red)
 */
function snrColor(snr: number | null): string {
  if (snr == null) return "text-slate-500";
  if (snr >= -18) return "text-emerald-400";
  if (snr >= -24) return "text-yellow-400";
  return "text-red-400";
}

function formatAge(tsUnix: number): string {
  const age = Math.floor(Date.now() / 1000) - tsUnix;
  if (age < 60) return `${age}s`;
  if (age < 3600) return `${Math.floor(age / 60)}m`;
  return `${Math.floor(age / 3600)}h`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LogEntry({ entry }: { entry: JS8LogEntry }) {
  const isTx = entry.type === "TX.SENT";
  const isErr = entry.type === "ERROR";

  return (
    <div
      className={`text-xs font-mono border-l-2 pl-3 py-1.5 transition-all hover:bg-white/5 ${
        isTx
          ? "border-amber-500/50 bg-amber-500/5"
          : isErr
            ? "border-red-500/50 bg-red-500/5"
            : "border-indigo-500/30"
      }`}
    >
      <div className="flex items-center justify-between mb-1 opacity-50 text-[10px] uppercase font-bold tracking-tighter">
        <span
          className={
            isTx ? "text-amber-400" : isErr ? "text-red-400" : "text-indigo-400"
          }
        >
          {isTx ? "Transmit" : isErr ? "System" : "Heard"}
        </span>
        <span>{entry.timestamp}</span>
      </div>
      <div className="break-words">
        {entry.from && (
          <span className="text-indigo-300 font-bold mr-2">{entry.from}</span>
        )}
        {entry.to && <span className="text-slate-500 mr-2">▶ {entry.to}</span>}
        <span className={isErr ? "text-red-300 italic" : "text-slate-200"}>
          {entry.text}
        </span>
        {entry.snr !== undefined && (
          <span className={`ml-2 text-[10px] font-bold ${snrColor(entry.snr)}`}>
            [{entry.snr > 0 ? "+" : ""}
            {entry.snr} dB]
          </span>
        )}
      </div>
    </div>
  );
}

function StationCard({ station }: { station: JS8Station; isNew?: boolean }) {
  const ageStr = formatAge(station.ts_unix);

  return (
    <div className="group flex flex-col p-2.5 rounded-lg border border-white/5 hover:border-indigo-500/30 hover:bg-white/5 transition-all cursor-default relative overflow-hidden">
      <div className="flex items-center justify-between mb-1">
        <span className="font-bold text-indigo-300 tracking-wider font-mono">
          {station.callsign}
        </span>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold ${snrColor(station.snr)}`}>
            {station.snr > 0 ? "+" : ""}
            {station.snr} dB
          </span>
          <span className="text-[10px] text-slate-600 font-mono">{ageStr}</span>
        </div>
      </div>

      {station.grid && (
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <MapPin size={10} className="text-slate-600" />
          <span className="font-mono">{station.grid}</span>
          {station.distance_km !== undefined && (
            <span className="text-indigo-400/50 ml-1">
              {station.distance_km}km
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface RadioTerminalProps {
  stations: JS8Station[];
  logEntries: JS8LogEntry[];
  statusLine: JS8StatusLine;
  connected: boolean;
  js8Connected: boolean;
  kiwiConnecting: boolean;
  activeKiwiConfig: KiwiConfig | null;
  js8Mode: string;
  sMeterDbm: number | null;
  adcOverload?: boolean;
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
  sMeterDbm,
  adcOverload = false,
  sendMessage,
  sendAction,
}: RadioTerminalProps) {
  // ── State ──────────────────────────────────────────────────────────────────

  // Radio operating mode: JS8 decode terminal vs. live audio listening post vs. WebSDR
  const [radioMode, setRadioMode] = useState<"JS8" | "LISTEN" | "WEBSDR">(
    "JS8",
  );

  const [txTarget, setTxTarget] = useState("@GHOSTNET");
  const [txMessage, setTxMessage] = useState("");
  const [txPending, setTxPending] = useState(false);

  const [kiwiConfig, setKiwiConfig] = useState({
    host: KIWI_DEFAULT_HOST,
    port: KIWI_DEFAULT_PORT,
    freq: KIWI_DEFAULT_FREQ,
    mode: "usb",
    password: "",
  });

  const [kiwiPanelOpen, setKiwiPanelOpen] = useState(false);

  // WebSDR panel state
  const [webSDRPanelNode, setWebSDRPanelNode] = useState<WebSDRNode | null>(
    null,
  );

  const [isEditingFreq, setIsEditingFreq] = useState(false);
  const [isEditingCall, setIsEditingCall] = useState(false);
  const [tempCall, setTempCall] = useState("");
  const [isEditingGrid, setIsEditingGrid] = useState(false);
  const [tempGrid, setTempGrid] = useState("");
  const [tempFreq, setTempFreq] = useState("");

  // Station sidebar tab: heard stations vs GhostNet schedule
  const [sidebarTab, setSidebarTab] = useState<"stations" | "schedule">(
    "stations",
  );

  // Live UTC clock for the status bar
  const [utcTime, setUtcTime] = useState(() =>
    new Date().toUTCString().slice(17, 25),
  );

  // ── Refs ───────────────────────────────────────────────────────────────────
  const logBottomRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const sdrContainerRef = useRef<HTMLDivElement>(null);

  // ── Listening Post audio hook (only active in LISTEN mode) ─────────────────
  const {
    analyserNode,
    isConnected: listenConnected,
    audioEnabled,
    enableAudio,
    volume,
    setVolume,
  } = useListenAudio(radioMode === "LISTEN");

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Auto-scroll only when the user is already near the bottom
  const scrollToBottom = useCallback(() => {
    const el = logContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 120) {
      logBottomRef.current?.scrollIntoView({ behavior: "smooth" });
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

  const handleSend = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const msg = txMessage.trim();
      if (!msg || !bridgeConnected || txPending) return;
      sendMessage(txTarget.trim() || "@ALLCALL", msg);
      setTxMessage("");
      setTxPending(true);
      setTimeout(() => setTxPending(false), 16000);
    },
    [bridgeConnected, txMessage, txTarget, txPending, sendMessage],
  );

  // ── KiwiSDR connect / disconnect ───────────────────────────────────────────

  const handleKiwiConnect = useCallback(() => {
    if (!bridgeConnected || kiwiIsConnecting) return;
    sendAction({
      action: "SET_KIWI",
      host: kiwiConfig.host,
      port: Number(kiwiConfig.port),
      freq: Number(kiwiConfig.freq),
      mode: kiwiConfig.mode,
      password: kiwiConfig.password,
    });
  }, [bridgeConnected, kiwiIsConnecting, kiwiConfig, sendAction]);

  const handleKiwiDisconnect = useCallback(() => {
    if (!bridgeConnected) return;
    sendAction({ action: "DISCONNECT_KIWI" });
  }, [bridgeConnected, sendAction]);

  const handleFreqSubmit = useCallback(() => {
    setIsEditingFreq(false);
    if (!sharedActiveKiwiConfig || !bridgeConnected) return;
    const newFreq = parseInt(tempFreq, 10);
    if (!isNaN(newFreq) && newFreq !== sharedActiveKiwiConfig.freq) {
      sendAction({
        action: "SET_KIWI",
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
    sendAction({ action: "SET_STATION", callsign: val });
  }, [tempCall, bridgeConnected, sendAction]);

  const handleGridSubmit = useCallback(() => {
    setIsEditingGrid(false);
    const val = tempGrid.trim().toUpperCase();
    if (!val || !bridgeConnected) return;
    sendAction({ action: "SET_STATION", grid: val });
  }, [tempGrid, bridgeConnected, sendAction]);

  // Tune to a band preset — retunes existing SDR connection or updates pending config
  const handleBandSelect = useCallback(
    (freqKhz: number) => {
      if (!bridgeConnected) return;
      setKiwiConfig((prev) => ({ ...prev, freq: freqKhz }));
      if (sharedActiveKiwiConfig) {
        sendAction({
          action: "SET_KIWI",
          host: sharedActiveKiwiConfig.host,
          port: sharedActiveKiwiConfig.port,
          freq: freqKhz,
          mode: sharedActiveKiwiConfig.mode,
        });
      }
    },
    [bridgeConnected, sharedActiveKiwiConfig, sendAction],
  );

  // Tune to a GhostNet frequency preset
  const handleGhostNetFreq = useCallback(
    (freqKhz: number, mode: string) => {
      if (!bridgeConnected) return;
      setKiwiConfig((prev) => ({ ...prev, freq: freqKhz, mode }));
      if (sharedActiveKiwiConfig) {
        sendAction({
          action: "SET_KIWI",
          host: sharedActiveKiwiConfig.host,
          port: sharedActiveKiwiConfig.port,
          freq: freqKhz,
          mode,
        });
      }
    },
    [bridgeConnected, sharedActiveKiwiConfig, sendAction],
  );

  // Change JS8Call frame speed mode
  const handleModeSelect = useCallback(
    (modeId: JS8SpeedMode["id"]) => {
      if (!bridgeConnected) return;
      sendAction({ action: "SET_MODE", mode: modeId });
    },
    [bridgeConnected, sendAction],
  );

  const handleOpenWebSDR = useCallback((node: WebSDRNode) => {
    setWebSDRPanelNode(node);
    setRadioMode("WEBSDR");
  }, []);

  // Connect to a node picked from the browser — keeps current freq/mode
  const handleNodeConnect = useCallback(
    (node: KiwiNode) => {
      if (!bridgeConnected || kiwiIsConnecting) return;
      setKiwiConfig((prev) => ({ ...prev, host: node.host, port: node.port }));
      sendAction({
        action: "SET_KIWI",
        host: node.host,
        port: node.port,
        freq: kiwiConfig.freq,
        mode: kiwiConfig.mode,
      });
    },
    [
      bridgeConnected,
      kiwiIsConnecting,
      kiwiConfig.freq,
      kiwiConfig.mode,
      sendAction,
    ],
  );

  // ── Sorted station array ───────────────────────────────────────────────────

  const sortedStations = useMemo(
    () =>
      [...sharedStations].sort((a, b) => (b.ts_unix || 0) - (a.ts_unix || 0)),
    [sharedStations],
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
            <h1 className="font-bold text-slate-100 tracking-wider text-sm uppercase">
              Radio Terminal
            </h1>
          </div>
        </div>

        {/* Center: KiwiSDR config widget + JS8Call station info */}
        <div className="flex items-center gap-3 text-xs">
          {/* SDR node selector — opens the KiwiNodeBrowser floating panel */}
          {radioMode !== "WEBSDR" && (
            <div className="relative" ref={sdrContainerRef}>
              <button
                onClick={() => setKiwiPanelOpen((v) => !v)}
                disabled={!bridgeConnected}
                className={`
                flex items-center gap-2 px-3.5 py-1.5 rounded-md border text-xs transition-all duration-200 backdrop-blur-sm shadow-sm
                ${
                  sharedActiveKiwiConfig
                    ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-500/50 hover:shadow-[0_0_10px_rgba(99,102,241,0.2)]"
                    : "bg-black/30 border-white/10 text-slate-400 hover:bg-black/50 hover:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
                }
              `}
              >
                <Server className="w-3.5 h-3.5 shrink-0" />
                {sharedActiveKiwiConfig ? (
                  <div className="flex items-center gap-1.5 text-rose-400 hover:text-rose-300 transition-colors">
                    <Activity className="w-3.5 h-3.5" />
                    <span>
                      {sharedActiveKiwiConfig.host}:
                      {sharedActiveKiwiConfig.port}
                    </span>
                  </div>
                ) : (
                  <span>Browse SDR Nodes</span>
                )}
                <ChevronDown
                  className={`w-3 h-3 text-slate-600 ml-0.5 transition-transform duration-150 ${kiwiPanelOpen ? "rotate-180" : ""}`}
                />
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
                onManualConfigChange={(patch) =>
                  setKiwiConfig((p) => ({ ...p, ...patch }))
                }
                onManualConnect={handleKiwiConnect}
                operatorGrid={sharedStatusLine.grid}
              />
            </div>
          )}

          {/* Divider */}
          <div className="w-px h-6 bg-slate-800 shrink-0" />

          {/* Mode toggle: JS8 decode / Listening Post / WebSDR*/}
          <div className="flex rounded-md overflow-hidden border border-white/10 shrink-0">
            <button
              onClick={() => setRadioMode("JS8")}
              title="JS8Call decode mode"
              className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-all duration-150 ${
                radioMode === "JS8"
                  ? "bg-indigo-600 text-white border-r border-indigo-500"
                  : "bg-black/30 text-slate-500 border-r border-white/10 hover:text-slate-300 hover:bg-slate-800/50"
              }`}
            >
              <Radio className="w-3 h-3" />
              JS8
            </button>
            <button
              onClick={() => setRadioMode("LISTEN")}
              title="Listening Post — live audio + waterfall"
              className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-all duration-150 ${
                radioMode === "LISTEN"
                  ? "bg-emerald-700 text-white"
                  : "bg-black/30 text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
              }`}
            >
              <Headphones className="w-3 h-3" />
              KiwiSDR
            </button>
            <button
              onClick={() => setRadioMode("WEBSDR")}
              title="WebSDR Discovery — browse global network"
              className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-all duration-150 ${
                radioMode === "WEBSDR"
                  ? "bg-violet-700 text-white"
                  : "bg-black/30 text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
              }`}
            >
              <Globe className="w-3 h-3" />
              WebSDR
            </button>
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-slate-800 shrink-0" />

          {radioMode === "JS8" && (
            <>
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
                        if (e.key === "Enter") handleFreqSubmit();
                        if (e.key === "Escape") setIsEditingFreq(false);
                      }}
                    />
                    <span className="text-emerald-500/70">kHz</span>
                  </div>
                ) : (
                  <span className="font-semibold text-emerald-400 font-mono tracking-wide drop-shadow-[0_0_2px_rgba(52,211,153,0.3)]">
                    {sharedActiveKiwiConfig
                      ? `${sharedActiveKiwiConfig.freq} kHz`
                      : "--"}
                  </span>
                )}
              </div>
              {/* Editable CALL */}
              <div
                className="flex items-center gap-1 text-slate-400 cursor-pointer group"
                title="Click to edit callsign"
                onClick={() => {
                  if (!isEditingCall) {
                    setTempCall(sharedStatusLine.callsign);
                    setIsEditingCall(true);
                  }
                }}
              >
                <span className="text-slate-600">CALL </span>
                {isEditingCall ? (
                  <input
                    type="text"
                    className="bg-black/50 border-b border-indigo-500 text-indigo-300 w-20 outline-none font-mono font-semibold px-1 rounded-sm text-xs uppercase tracking-wider focus:bg-black/70 transition-colors"
                    value={tempCall}
                    autoFocus
                    onChange={(e) => setTempCall(e.target.value.toUpperCase())}
                    onBlur={handleCallSubmit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCallSubmit();
                      if (e.key === "Escape") setIsEditingCall(false);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="text-slate-300 font-semibold group-hover:text-indigo-300 transition-colors">
                    {sharedStatusLine.callsign}
                  </span>
                )}
              </div>

              {/* Editable GRID */}
              <div
                className="flex items-center gap-1 text-slate-400 cursor-pointer group"
                title="Click to edit grid square"
                onClick={() => {
                  if (!isEditingGrid) {
                    setTempGrid(sharedStatusLine.grid);
                    setIsEditingGrid(true);
                  }
                }}
              >
                <span className="text-slate-600">GRID </span>
                {isEditingGrid ? (
                  <input
                    type="text"
                    className="bg-black/50 border-b border-indigo-500 text-indigo-300 w-14 outline-none font-mono font-semibold px-1 rounded-sm text-xs uppercase tracking-wider focus:bg-black/70 transition-colors"
                    value={tempGrid}
                    autoFocus
                    maxLength={6}
                    onChange={(e) => setTempGrid(e.target.value.toUpperCase())}
                    onBlur={handleGridSubmit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleGridSubmit();
                      if (e.key === "Escape") setIsEditingGrid(false);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="text-slate-300 group-hover:text-indigo-300 transition-colors">
                    {sharedStatusLine.grid}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right: connection state */}
        <div className="flex items-center gap-3 text-xs font-semibold tracking-wide">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border backdrop-blur-sm shadow-sm transition-all duration-300 ${
              bridgeConnected
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.15)]"
                : "bg-rose-500/10 border-rose-500/30 text-rose-400"
            }`}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full ${bridgeConnected ? "bg-emerald-400 animate-pulse shadow-[0_0_5px_currentColor]" : "bg-rose-500"}`}
            />
            {bridgeConnected ? "BRIDGE" : "OFFLINE"}
          </div>
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border backdrop-blur-sm transition-all duration-300 ${
              js8IsConnected
                ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.15)]"
                : "bg-black/30 border-white/5 text-slate-500"
            }`}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full ${js8IsConnected ? "bg-cyan-400 shadow-[0_0_5px_currentColor]" : "bg-slate-600"}`}
            />
            {js8IsConnected ? "JS8CALL" : "NO RADIO"}
          </div>
        </div>
      </header>

      {/* ── BAND + MODE BAR — hidden in LISTEN mode ── */}
      {radioMode === "JS8" && (
        <div className="shrink-0 bg-black/30 border-b border-white/10 px-3 py-1.5 flex items-center gap-4 overflow-x-auto z-10 relative">
          {/* Band presets */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-slate-600 uppercase tracking-widest mr-1 shrink-0">
              Band
            </span>
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
                  ${
                    isActive
                      ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.2)]"
                      : preset.primary
                        ? "bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-500/40"
                        : "bg-black/30 border border-white/10 text-slate-400 hover:bg-black/50 hover:text-slate-300 hover:border-white/20"
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

          {/* GhostNet frequency presets */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-amber-600/80 uppercase tracking-widest mr-1 shrink-0 font-bold">
              GhostNet
            </span>
            {GHOSTNET_FREQ_PRESETS.map((preset) => {
              const isActive = sharedActiveKiwiConfig?.freq === preset.freqKhz;
              const colorMap = {
                weekly: isActive
                  ? "bg-amber-500/20 border border-amber-500/50 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.25)]"
                  : "bg-amber-500/10 border border-amber-500/25 text-amber-400/80 hover:bg-amber-500/20 hover:border-amber-500/45 hover:text-amber-300",
                bridge: isActive
                  ? "bg-sky-500/20 border border-sky-500/50 text-sky-300 shadow-[0_0_8px_rgba(14,165,233,0.25)]"
                  : "bg-sky-500/10 border border-sky-500/20 text-sky-400/70 hover:bg-sky-500/20 hover:border-sky-500/40 hover:text-sky-300",
                rtty: isActive
                  ? "bg-violet-500/20 border border-violet-500/50 text-violet-300 shadow-[0_0_8px_rgba(139,92,246,0.25)]"
                  : "bg-black/30 border border-violet-500/20 text-violet-400/60 hover:bg-violet-500/15 hover:border-violet-500/40 hover:text-violet-300",
                voice: isActive
                  ? "bg-rose-500/20 border border-rose-500/50 text-rose-300 shadow-[0_0_8px_rgba(244,63,94,0.25)]"
                  : "bg-black/30 border border-rose-500/20 text-rose-400/60 hover:bg-rose-500/15 hover:border-rose-500/40 hover:text-rose-300",
              };
              return (
                <button
                  key={`${preset.label}-${preset.freqKhz}`}
                  onClick={() =>
                    handleGhostNetFreq(preset.freqKhz, preset.mode)
                  }
                  disabled={!bridgeConnected}
                  title={`${(preset.freqKhz / 1000).toFixed(3)} MHz ${preset.mode.toUpperCase()} — ${preset.note}`}
                  className={`
                  px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-all duration-150
                  disabled:opacity-30 disabled:cursor-not-allowed
                  ${colorMap[preset.type]}
                `}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div className="w-px h-4 bg-slate-800 shrink-0" />

          {/* Speed mode selector */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-slate-600 uppercase tracking-widest mr-1 shrink-0">
              Speed
            </span>
            {JS8_SPEED_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => handleModeSelect(m.id)}
                title={`${m.label} — ${m.frameSec}s frames, min SNR ${m.snrThreshold} dB. ${m.note}`}
                className={`
                px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold transition-all duration-150
                ${
                  sharedJs8Mode === m.id
                    ? "bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 shadow-[0_0_6px_rgba(6,182,212,0.2)]"
                    : "bg-black/30 border border-white/10 text-slate-400 hover:bg-black/50 hover:text-slate-300 hover:border-white/20"
                }
              `}
              >
                {m.label}
              </button>
            ))}
            <span className="text-[10px] text-slate-600 ml-1 hidden sm:inline">
              ({JS8_SPEED_MODES.find((m) => m.id === sharedJs8Mode)?.frameSec}s
              / min{" "}
              {
                JS8_SPEED_MODES.find((m) => m.id === sharedJs8Mode)
                  ?.snrThreshold
              }{" "}
              dB)
            </span>
          </div>
        </div>
      )}

      {/* ── MAIN BODY ── */}
      <div className="flex flex-1 overflow-hidden">
        {radioMode === "LISTEN" ? (
          <ListeningPost
            analyserNode={analyserNode}
            audioEnabled={audioEnabled}
            enableAudio={enableAudio}
            volume={volume}
            onVolumeChange={setVolume}
            sMeterDbm={sMeterDbm}
            activeKiwiConfig={sharedActiveKiwiConfig}
            bridgeConnected={bridgeConnected}
            sendAction={sendAction}
            isConnected={listenConnected}
            adcOverload={adcOverload}
          />
        ) : radioMode === "WEBSDR" ? (
          <div className="flex-1 overflow-hidden relative">
            <WebSDRDiscovery
              isOpen={true}
              onClose={() => {}}
              currentFreqKhz={sharedActiveKiwiConfig?.freq || kiwiConfig.freq}
              onOpenWebSDR={handleOpenWebSDR}
              operatorGrid={sharedStatusLine.grid}
              inlineMode={true}
            />
          </div>
        ) : (
          <>
            {/* MESSAGE LOG – left, dominant, bottom-anchored like a chat terminal */}
            <main
              className="flex-1 flex flex-col overflow-y-auto p-4"
              ref={logContainerRef}
            >
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

            {/* RIGHT SIDEBAR */}
            <aside className="w-72 bg-black/30 backdrop-blur-md border-l border-white/10 hidden md:flex flex-col shrink-0 relative z-10 shadow-[-5px_0_15px_rgba(0,0,0,0.2)]">
              {/* Sidebar tab bar */}
              <div className="flex border-b border-white/10 bg-black/40 shrink-0 relative">
                <div className="absolute top-0 right-0 w-32 h-1 bg-indigo-500/30 blur-md pointer-events-none" />
                <button
                  onClick={() => setSidebarTab("stations")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all duration-150 ${
                    sidebarTab === "stations"
                      ? "text-indigo-300 border-b-2 border-indigo-500 bg-indigo-500/10"
                      : "text-slate-600 hover:text-slate-400 border-b-2 border-transparent"
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  Heard
                  <span className="font-mono font-normal opacity-60">
                    [{sortedStations.length}]
                  </span>
                </button>
                <button
                  onClick={() => setSidebarTab("schedule")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all duration-150 ${
                    sidebarTab === "schedule"
                      ? "text-amber-300 border-b-2 border-amber-500 bg-amber-500/10"
                      : "text-slate-600 hover:text-slate-400 border-b-2 border-transparent"
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  GhostNet
                </button>
              </div>

              {sidebarTab === "stations" ? (
                <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                  {sortedStations.length === 0 ? (
                    <div className="text-center p-4 text-slate-600 italic text-xs">
                      Listening for heartbeats…
                    </div>
                  ) : (
                    sortedStations.map((s) => (
                      <StationCard key={s.callsign} station={s} isNew={false} />
                    ))
                  )}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-2">
                  {/* Groups to monitor */}
                  <div className="mb-3">
                    <p className="text-[9px] text-amber-600/70 uppercase tracking-widest font-bold mb-1.5 px-0.5">
                      Monitor Groups
                    </p>
                    <div className="space-y-0.5">
                      {GHOSTNET_GROUPS.map((g) => (
                        <div
                          key={g.id}
                          className="flex items-start gap-2 px-2 py-1.5 rounded bg-black/20 border border-white/5"
                        >
                          <span className="font-mono font-bold text-amber-300 text-[11px] shrink-0">
                            {g.id}
                          </span>
                          <span className="text-[10px] text-slate-500 leading-tight">
                            {g.note}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Net schedule */}
                  {(["THU", "SAT"] as const).map((day) => (
                    <div key={day} className="mb-3">
                      <p className="text-[9px] text-amber-600/70 uppercase tracking-widest font-bold mb-1.5 px-0.5">
                        {day === "THU"
                          ? "Thursday — Weekly Nets"
                          : "Saturday — Data Bridges"}
                      </p>
                      <div className="space-y-0.5">
                        {GHOSTNET_SCHEDULE.filter((e) => e.day === day).map(
                          (entry, i) => {
                            const nowH = new Date().getUTCHours();
                            const nowDay = new Date().getUTCDay(); // 0=Sun,4=Thu,6=Sat
                            const isToday =
                              (day === "THU" && nowDay === 4) ||
                              (day === "SAT" && nowDay === 6);
                            const isActive =
                              isToday &&
                              nowH >= entry.startHourZ &&
                              nowH < entry.endHourZ;
                            return (
                              <div
                                key={i}
                                className={`px-2 py-1.5 rounded border text-[10px] transition-all ${
                                  isActive
                                    ? "bg-amber-500/15 border-amber-500/40 shadow-[0_0_6px_rgba(245,158,11,0.15)]"
                                    : "bg-black/20 border-white/5"
                                }`}
                              >
                                <div className="flex items-center justify-between mb-0.5">
                                  <span
                                    className={`font-bold font-mono ${isActive ? "text-amber-300" : "text-slate-300"}`}
                                  >
                                    {entry.region}
                                  </span>
                                  {isActive && (
                                    <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider animate-pulse">
                                      ACTIVE
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-slate-500">
                                  <span className="font-mono">
                                    {entry.timeUtc}
                                  </span>
                                  <span>·</span>
                                  <span>{entry.band}</span>
                                  {entry.js8Khz && (
                                    <button
                                      onClick={() =>
                                        handleGhostNetFreq(entry.js8Khz!, "usb")
                                      }
                                      disabled={!bridgeConnected}
                                      title={`Tune to ${(entry.js8Khz / 1000).toFixed(3)} MHz`}
                                      className="text-amber-500/60 hover:text-amber-400 font-mono text-[10px] disabled:opacity-30 transition-colors"
                                    >
                                      {(entry.js8Khz / 1000).toFixed(3)}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          },
                        )}
                      </div>
                    </div>
                  ))}

                  <p className="text-[9px] text-slate-700 text-center mt-2 px-1 leading-tight">
                    All times UTC · GhostNet v1.5 © S2 Underground
                  </p>
                </div>
              )}
            </aside>
          </>
        )}
      </div>

      {/* ── TRANSMIT PANEL — hidden in LISTEN mode ── */}
      {radioMode === "JS8" && (
        <footer className="shrink-0 bg-black/50 backdrop-blur-xl border-t border-white/10 z-20 relative">
          {/* Subtle glow underneath footer */}
          <div className="absolute bottom-0 left-0 w-full h-1/2 bg-indigo-500/5 blur-xl pointer-events-none" />

          {/* Group quick-select */}
          <div className="flex items-center gap-1.5 px-5 pt-2 relative z-10">
            <span className="text-[9px] text-slate-700 uppercase tracking-widest font-bold shrink-0">
              Quick
            </span>
            {GHOSTNET_GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setTxTarget(g.id)}
                title={g.note}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all duration-150 ${
                  txTarget === g.id
                    ? g.id === "@GSTFLASH"
                      ? "bg-rose-500/25 border border-rose-500/50 text-rose-300"
                      : "bg-amber-500/20 border border-amber-500/45 text-amber-300"
                    : g.id === "@GSTFLASH"
                      ? "bg-black/30 border border-rose-500/20 text-rose-500/60 hover:text-rose-400 hover:border-rose-500/40"
                      : "bg-black/30 border border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20"
                }`}
              >
                {g.id}
              </button>
            ))}
          </div>

          {/* TX form */}
          <form
            onSubmit={handleSend}
            className="flex items-center gap-3 px-5 py-2 relative z-10"
          >
            <span className="text-slate-500 font-semibold text-xs tracking-wider">
              TO
            </span>
            <input
              type="text"
              value={txTarget}
              onChange={(e) => setTxTarget(e.target.value.toUpperCase())}
              placeholder="@GHOSTNET"
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
                placeholder={
                  bridgeConnected
                    ? "TYPE MESSAGE AND PRESS ENTER… (NO Transmit on KiwiSDR)"
                    : "NOT CONNECTED"
                }
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
              <span
                className={`text-[10px] font-mono w-12 text-right ${txMessage.length > 140 ? "text-red-400 font-bold" : "text-slate-500"}`}
              >
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
              {txPending ? "TX…" : "SEND"}
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
              Stations:{" "}
              <span className="text-slate-400">{sortedStations.length}</span>
            </span>
            {sharedActiveKiwiConfig && (
              <>
                <span>·</span>
                <span>
                  SDR:{" "}
                  <span className="text-slate-400">
                    {sharedActiveKiwiConfig.host}
                  </span>
                </span>
              </>
            )}
          </div>
        </footer>
      )}

      {/* ── Band-aware WebSDR suggestion ── */}
      {/* Shown when tuned to VHF/UHF (>30 MHz) and no KiwiSDR connected — KiwiSDR
          hardware can't cover these frequencies; suggest WebSDR instead. */}
      {kiwiConfig.freq > 30000 && !sharedActiveKiwiConfig && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-lg bg-violet-950/90 border border-violet-500/40 shadow-xl backdrop-blur-sm text-xs">
          <div className="flex items-center gap-1.5 text-violet-300">
            <Radio className="w-3.5 h-3.5 shrink-0" />
            <span>
              <span className="font-semibold">
                {kiwiConfig.freq.toLocaleString()} kHz
              </span>{" "}
              is above KiwiSDR's HF range
            </span>
          </div>
          <button
            onClick={() => setKiwiPanelOpen(true)}
            className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-violet-300 bg-violet-500/20 border border-violet-500/30 hover:bg-violet-500/35 transition-colors whitespace-nowrap"
          >
            Browse WebSDR nodes
          </button>
          <button
            onClick={() => setKiwiConfig((prev) => ({ ...prev, freq: 14074 }))}
            className="text-slate-500 hover:text-slate-400 transition-colors"
            title="Dismiss (reset to 14074 kHz)"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── WebSDR Panel (iframe embed) ── */}
      {radioMode === "WEBSDR" && webSDRPanelNode && (
        <WebSDRPanel
          node={webSDRPanelNode}
          initialFreqKhz={sharedActiveKiwiConfig?.freq || kiwiConfig.freq}
          initialMode={
            (["usb", "lsb", "am", "cw", "fm"].includes(kiwiConfig.mode)
              ? kiwiConfig.mode
              : "usb") as "usb" | "lsb" | "am" | "cw" | "fm"
          }
          onClose={() => setWebSDRPanelNode(null)}
          fullScreen={true}
        />
      )}
    </div>
  );
}
