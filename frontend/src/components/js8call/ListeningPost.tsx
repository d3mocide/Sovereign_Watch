/**
 * ListeningPost — Professional HF Operator Terminal
 *
 * An overhauled UI inspired by modern tactical radio systems and the user's mockup.
 * Supports dual-mode waterfall:
 *  1. Audio Passband (narrow, low-latency, driven by WebAudio AnalyserNode)
 *  2. Wide Panoramic (driven by /ws/waterfall binary stream from the backend)
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  Volume2, VolumeX, Activity, Zap, 
  Sliders, Target, ChevronUp, ChevronDown
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants & Types
// ---------------------------------------------------------------------------

const HF_BANDS = [
  { label: '240m', freq: 1100  },
  { label: '160m', freq: 1850  },
  { label: '80m',  freq: 3700  },
  { label: '60m',  freq: 5330  },
  { label: '40m',  freq: 7150  },
  { label: '30m',  freq: 10100 },
  { label: '20m',  freq: 14200 },
  { label: '17m',  freq: 18100 },
  { label: '15m',  freq: 21250 },
  { label: '12m',  freq: 24940 },
  { label: '10m',  freq: 28500 },
  { label: '6m',   freq: 50000 },
  { label: '2m',   freq: 144000 },
] as const;

const KIWI_MODES = ['usb', 'lsb', 'am', 'amn', 'sam', 'cw', 'cwn', 'nbfm', 'iq'] as const;
type KiwiMode = typeof KIWI_MODES[number];

const MODE_INFO: Record<KiwiMode, { label: string; bw: number }> = {
  usb:  { label: 'USB',  bw: 2.7 },
  lsb:  { label: 'LSB',  bw: 2.7 },
  am:   { label: 'AM',   bw: 6.0 },
  amn:  { label: 'AMN',  bw: 4.0 },
  sam:  { label: 'SAM',  bw: 6.0 },
  cw:   { label: 'CW',   bw: 0.5 },
  cwn:  { label: 'CWN',  bw: 0.2 },
  nbfm: { label: 'FM',   bw: 12.0 },
  iq:   { label: 'IQ',   bw: 30.0 }, // Viewport bandwidth for IQ usually wider
};

const WS_BASE_URL = import.meta.env.VITE_JS8_WS_URL || 'ws://localhost:8082/ws/js8';
const WATERFALL_WS_URL = WS_BASE_URL.replace(/\/ws\/js8$/, '/ws/waterfall');

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** 
 * Returns the total waterfall span in kHz for a given KiwiSDR zoom level (0-14). 
 * Zoom 0 = ~30,000 kHz, Zoom 5 = ~937.5 kHz, etc. 
 * Actual formula is ~30000 / (2^zoom). 
 */
function getWideSpan(zoom: number): number {
  return 30000 / Math.pow(2, zoom);
}

function dbmToSmeter(dbm: number): { label: string; pct: number; color: string } {
  const pct = Math.min(100, Math.max(0, ((dbm + 127) / 97) * 100));
  let label: string;
  if (dbm >= -73) {
    const over = Math.round(dbm + 73);
    label = `S9+${over}`;
  } else {
    const s = Math.max(0, Math.min(9, Math.round((dbm + 127) / 6)));
    label = `S${s}`;
  }
  const color = pct > 70 ? 'text-rose-500' : pct > 45 ? 'text-amber-400' : 'text-emerald-500';
  return { label, pct, color };
}

// Authentic spectral SDR waterfall palette (Blue -> Cyan -> Green -> Yellow -> Red)
// Refined thresholds for better contrast (higher floor, less "neon" washout)
function sdrWaterfallColor(value: number): [number, number, number] {
  if (value < 60) return [0, 0, Math.round(value * 0.4)]; // Deep Blue noise floor
  if (value < 120) return [0, Math.round((value - 60) * 4.25), 255]; // Blue to Cyan
  if (value < 165) return [0, 255, Math.round(255 - (value - 120) * 5.6)]; // Cyan to Green
  if (value < 205) return [Math.round((value - 165) * 6.3), 255, 0]; // Green to Yellow
  if (value < 240) return [255, Math.round(255 - (value - 205) * 7.28), 0]; // Yellow to Red
  return [255, Math.round((value - 240) * 17), Math.round((value - 240) * 17)]; // Red to White
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ActiveKiwiConfig {
  host: string;
  port: number;
  freq: number;
  mode: string;
}

interface ListeningPostProps {
  analyserNode: AnalyserNode | null;
  isAudioPlaying: boolean;
  audioEnabled: boolean;
  enableAudio: () => void;
  volume: number;
  onVolumeChange: (v: number) => void;
  sMeterDbm: number | null;
  activeKiwiConfig: ActiveKiwiConfig | null;
  bridgeConnected: boolean;
  sendAction: (payload: object) => void;
  isConnected: boolean;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ListeningPost({
  analyserNode,
  isAudioPlaying,
  audioEnabled,
  enableAudio,
  volume,
  onVolumeChange,
  sMeterDbm,
  activeKiwiConfig,
  bridgeConnected,
  sendAction,
  isConnected,
}: ListeningPostProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);

  // State
  const [localFreq, setLocalFreq] = useState<number>(activeKiwiConfig?.freq ?? 14074);
  const [localMode, setLocalMode] = useState<KiwiMode>((activeKiwiConfig?.mode as KiwiMode) ?? 'usb');
  const [zoom, setZoom] = useState(5); // Default zoom level
  const [wfMode, setWfMode] = useState<'PASSBAND' | 'WIDE'>('WIDE');
  
  // Settings
  const [manGain, setManGain] = useState(50);   // 0-120 KiwiSDR manGain
  const [agcOn,   setAgcOn]   = useState(true);  // AGC enabled by default
  const [wfSkip,  setWfSkip]  = useState(1);     // client-side frame skip (1=all,2=every other,…)
  const [sqn, setSqn] = useState(20);
  const [sql, setSql] = useState(0);
  const [wfOffset, setWfOffset] = useState(100); // Waterfall baseline calibration
  const wfFrameCountRef = useRef(0);


  // ── Waterfall Rendering Loop ──────────────────────────────────────────────

  const drawRow = useCallback((pixels: Uint8Array | number[], ctx2d: CanvasRenderingContext2D, w: number, h: number) => {
    // Scroll down
    const existing = ctx2d.getImageData(0, 0, w, h - 1);
    ctx2d.putImageData(existing, 0, 1);

    // Draw new row at top
    const row = ctx2d.createImageData(w, 1);
    const data = row.data;
    const len = pixels.length;

    for (let i = 0; i < w; i++) {
        const bin = Math.floor(i * len / w);
        const val = Math.max(0, pixels[bin] - wfOffset);
        const [r, g, b] = sdrWaterfallColor(val);
        const idx = i * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
    }
    ctx2d.putImageData(row, 0, 0);
  }, [wfOffset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx2d) return;

    if (wfMode === 'PASSBAND' && analyserNode) {
        // PASSBAND mode: Use AnalyserNode
        const bufLen = analyserNode.frequencyBinCount;
        const data = new Uint8Array(bufLen);
        const draw = () => {
            analyserNode.getByteFrequencyData(data);
            drawRow(data, ctx2d, canvas.width, canvas.height);
            rafRef.current = requestAnimationFrame(draw);
        };
        rafRef.current = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(rafRef.current);
    } else if (wfMode === 'WIDE') {
        // WIDE mode: Use WebSocket binary stream
        let reconnectTimeout: number | undefined;
        let active = true;

        const connect = () => {
            if (!active) return;
            const ws = new WebSocket(WATERFALL_WS_URL);
            ws.binaryType = 'arraybuffer';
            wsRef.current = ws;

            ws.onmessage = (evt) => {
                if (evt.data instanceof ArrayBuffer) {
                    wfFrameCountRef.current += 1;
                    if (wfFrameCountRef.current % wfSkip !== 0) return; // client-side cadence
                    const pixels = new Uint8Array(evt.data);
                    drawRow(pixels, ctx2d, canvas.width, canvas.height);
                }
            };

            ws.onclose = () => {
                if (active) {
                    reconnectTimeout = window.setTimeout(connect, 3000);
                }
            };
        };

        connect();

        return () => {
            active = false;
            if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }
  }, [wfMode, analyserNode, drawRow, wfSkip, wfOffset, zoom]); // Added zoom to dependencies

  // Sync local frequency and mode with active config from bridge
  // Use render-phase stabilization to avoid cascading render warnings in useEffect
  const [prevSyncFreq, setPrevSyncFreq] = useState<number | undefined>(activeKiwiConfig?.freq);
  const [prevSyncMode, setPrevSyncMode] = useState<string | undefined>(activeKiwiConfig?.mode);

  if (activeKiwiConfig && (activeKiwiConfig.freq !== prevSyncFreq || activeKiwiConfig.mode !== prevSyncMode)) {
    setLocalFreq(activeKiwiConfig.freq);
    setLocalMode(activeKiwiConfig.mode as KiwiMode);
    setPrevSyncFreq(activeKiwiConfig.freq);
    setPrevSyncMode(activeKiwiConfig.mode);
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  const tune = useCallback((freq: number, mode: KiwiMode) => {
    if (!activeKiwiConfig || !bridgeConnected) return;
    const clamped = Math.max(0, Math.min(30000, freq));
    setLocalFreq(clamped);
    setLocalMode(mode);
    sendAction({
      action: 'SET_KIWI',
      host: activeKiwiConfig.host,
      port: activeKiwiConfig.port,
      freq: clamped,
      mode,
    });
  }, [activeKiwiConfig, bridgeConnected, sendAction]);

  const step = (delta: number) => tune(localFreq + delta, localMode);

  // ── S-Meter Data ─────────────────────────────────────────────────────────

  const smeter = dbmToSmeter(sMeterDbm ?? -127);

  const handleScaleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padding = 16; // px-4
    const width = rect.width - (padding * 2); // Corrected padding calculation
    const clickX = Math.max(0, Math.min(width, x - padding));
    
    if (wfMode === 'WIDE') {
      const span = getWideSpan(zoom);
      const halfSpan = span / 2;
      const offset = (clickX / width) * span - halfSpan;
      tune(localFreq + offset, localMode);
    } else {
      // Span is 0 to 6000 Hz (6 kHz)
      const offset = (clickX / width) * 6;
      tune(localFreq + offset, localMode);
    }
  };

  return (
    <div className="flex-1 w-full flex h-full bg-[#05080a] text-slate-300 font-mono text-[11px] overflow-hidden select-none">
      
      {/* ── LEFT SIDEBAR: TUNING & FREQ ── */}
      <div className="w-80 flex flex-col border-r border-[#1a2b36] bg-[#0a1218] shrink-0">
        
        {/* Top Header */}
        <div className="p-4 flex items-center gap-2 border-b border-[#1a2b36] bg-[#0d161d]">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="uppercase tracking-[0.2em] font-bold text-cyan-500/80">Listening Post</span>
          <div className="ml-auto flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-cyan-500 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.8)]' : 'bg-slate-700'}`} />
            <span className="text-[9px] text-slate-500">{isConnected ? 'REMOTE LINKED' : 'OFFLINE'}</span>
          </div>
        </div>

        {/* Freq Display Area */}
        <div className="p-4 space-y-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest text-left">Central Frequency</span>
            <div className="flex items-baseline justify-between bg-black/40 border border-[#1a2b36] rounded-md px-3 py-2.5 group hover:border-cyan-500/30 transition-all duration-300">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-cyan-400 tracking-tighter tabular-nums drop-shadow-[0_0_15px_rgba(34,211,238,0.2)]">
                  {localFreq.toFixed(2)}
                </span>
                <span className="text-xl font-bold text-cyan-900 uppercase">kHz</span>
              </div>
              {activeKiwiConfig?.freq !== localFreq && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                  <Activity size={10} className="text-amber-500 animate-pulse" />
                  <span className="text-[9px] font-bold text-amber-500 uppercase tracking-tighter">Tuning...</span>
                </div>
              )}
            </div>
          </div>

          {/* Stepping Grid */}
          <div className="grid grid-cols-3 gap-1">
            {[100, 10, 1, -100, -10, -1].map((delta) => (
              <button
                key={delta}
                onClick={() => step(delta)}
                className="py-1.5 bg-[#111d27] border border-[#1a2b36] rounded hover:bg-cyan-950/30 hover:border-cyan-500/50 transition-all active:scale-95 text-cyan-400 font-bold text-[10px]"
              >
                {delta > 0 ? `+${delta}` : delta}
              </button>
            ))}
          </div>

          <div className="h-px bg-[#1a2b36] my-4" />

          {/* Mode Selector */}
          <div className="space-y-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Modulation Mode</span>
            <div className="grid grid-cols-3 gap-1">
              {KIWI_MODES.map((m) => {
                const info = MODE_INFO[m];
                return (
                  <button
                    key={m}
                    onClick={() => tune(localFreq, m)}
                    className={`py-1.5 rounded text-[10px] font-bold uppercase transition-all ${
                      localMode === m
                        ? 'bg-emerald-600/20 border border-emerald-500 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                        : 'bg-black/30 border border-[#1a2b36] text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    {info.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bands Grid */}
          <div className="space-y-2 mt-4">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest">Global Bands</span>
            <div className="grid grid-cols-4 gap-1">
              {HF_BANDS.map((b) => {
                const active = Math.abs(localFreq - b.freq) < 100;
                return (
                    <button
                        key={b.label}
                        onClick={() => tune(b.freq, localMode)}
                        className={`py-1.5 rounded text-[10px] uppercase transition-all ${
                            active
                            ? 'bg-amber-500/20 border border-amber-500/50 text-amber-500'
                            : 'bg-black/20 border border-[#1a2b36] text-slate-600 hover:bg-black/40'
                        }`}
                    >
                        {b.label}
                    </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Audio/Volume Footer */}
        <div className="mt-auto p-6 bg-[#0d161d] border-t border-[#1a2b36]">
            {!audioEnabled ? (
                <button
                    onClick={enableAudio}
                    className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-bold flex items-center justify-center gap-2 transition-all shadow-lg"
                >
                    <Zap className="w-4 h-4 fill-current" />
                    ENABLE AUDIO LINK
                </button>
            ) : (
                <div className="flex items-center gap-4">
                    <button onClick={() => onVolumeChange(volume === 0 ? 0.8 : 0)}>
                        {volume === 0 ? <VolumeX className="w-5 h-5 text-rose-500" /> : <Volume2 className="w-5 h-5 text-cyan-400" />}
                    </button>
                    <div className="flex-1 space-y-1">
                        <div className="flex justify-between text-[9px] text-slate-500 uppercase">
                            <span>Mute</span>
                            <span>{Math.round(volume * 100)}%</span>
                        </div>
                        <input
                            type="range"
                            min={0} max={1.5} step={0.05}
                            value={volume}
                            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                            className="w-full h-1 accent-cyan-500 bg-[#1a2b36] rounded appearance-none cursor-pointer"
                        />
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* ── MAIN AREA: WATERFALL ── */}
      <div className="flex-1 flex flex-col relative overflow-hidden bg-black">

        {/* No-connection overlay — shown when no KiwiSDR is linked */}
        {!activeKiwiConfig && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-none select-none">
            <div className="flex flex-col items-center gap-3 text-center px-8">
              <Activity className="w-10 h-10 text-slate-600 animate-pulse" />
              <span className="text-slate-400 font-bold text-sm uppercase tracking-widest">No SDR Node Linked</span>
              <span className="text-slate-600 text-[11px]">Open the Node Browser (top bar) to connect to a KiwiSDR.<br />Frequency controls will activate once a node is linked.</span>
            </div>
          </div>
        )}

        {/* Top Waterfall Controls */}
        <div className="absolute bottom-12 left-0 right-0 p-4 flex items-center justify-between z-10 pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            <button 
              onClick={() => setWfMode('WIDE')}
              className={`px-3 py-1.5 rounded text-[9px] font-bold uppercase transition-all ${wfMode === 'WIDE' ? 'bg-cyan-600/20 border border-cyan-500 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]' : 'bg-black/60 border border-[#1a2b36] text-slate-500 hover:text-slate-300'}`}
            >
              Panoramic (WF)
            </button>
            <button 
              onClick={() => setWfMode('PASSBAND')}
              className={`px-3 py-1.5 rounded text-[9px] font-bold uppercase transition-all ${wfMode === 'PASSBAND' ? 'bg-indigo-600/20 border border-indigo-500 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.2)]' : 'bg-black/60 border border-[#1a2b36] text-slate-500 hover:text-slate-300'}`}
            >
              Passband (WS)
            </button>
            <button 
              onClick={() => {
                if (bridgeConnected) sendAction({ action: 'DISCONNECT_KIWI' });
              }}
              className="px-3 py-1.5 rounded text-[9px] font-bold uppercase bg-rose-600/20 border border-rose-500 text-rose-300 hover:bg-rose-500 hover:text-white transition-all shadow-[0_0_10px_rgba(244,63,94,0.1)]"
            >
              Stop
            </button>
          </div>

          <div className="bg-black/80 border border-[#1a2b36] rounded px-3 py-1 pointer-events-auto text-cyan-500/80 font-bold group">
            <span className="text-[10px] text-slate-500 mr-2">RX SOURCE:</span>
            {activeKiwiConfig?.host || 'NO_LINK'}
          </div>
        </div>

        <canvas
          ref={canvasRef}
          className="flex-1 w-full block bg-black"
          style={{ imageRendering: 'pixelated' }}
          width={1024}
          height={600}
        />

        {/* Frequency Scale Overlay */}
        <div 
            className="absolute top-7 left-0 right-0 h-8 flex justify-between px-4 border-t border-cyan-500/20 bg-black/80 backdrop-blur-sm cursor-pointer z-20 pointer-events-auto"
            onClick={handleScaleClick}
        >
            {/* Passband Indicator (Green Bar) */}
            {activeKiwiConfig && (
              <div 
                className="absolute top-0 h-1 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] transition-all duration-300"
                style={{
                  left: wfMode === 'WIDE' 
                    ? `calc(50% - ${(MODE_INFO[localMode as keyof typeof MODE_INFO].bw / getWideSpan(zoom)) * 50}%)`
                    : `calc(16px + ${(0 / 6) * (100 - 32)}%)`, // Starting at 0Hz in PB mode
                  width: wfMode === 'WIDE'
                    ? `${(MODE_INFO[localMode as keyof typeof MODE_INFO].bw / getWideSpan(zoom)) * 100}%`
                    : `${(MODE_INFO[localMode as keyof typeof MODE_INFO].bw / 6) * 100}%`,
                  opacity: 0.8
                }}
              />
            )}
            
            {wfMode === 'WIDE' ? (
                (() => {
                  const span = getWideSpan(zoom);
                  // Dynamic ticks based on span
                  let tickStep = 100;
                  if (span < 50) tickStep = 5;
                  else if (span < 150) tickStep = 10;
                  else if (span < 400) tickStep = 25;
                  else if (span < 1000) tickStep = 100;
                  else if (span < 4000) tickStep = 500;
                  else tickStep = 1000;

                  const sideTicks = Math.floor((span / 2) / tickStep);
                  const ticks = [];
                  for (let i = -sideTicks; i <= sideTicks; i++) ticks.push(i * tickStep);

                  return ticks.map(v => (
                    <div key={v} className="flex flex-col items-center pt-1" style={{ position: 'absolute', left: `calc(16px + ${(v + span/2) / span} * (100% - 32px))`, transform: 'translateX(-50%)' }}>
                        <div className="w-px h-2 bg-slate-200" />
                        <span className="text-[9px] text-slate-200">{v > 0 ? `+${v}k` : v === 0 ? 'CF' : `${v}k`}</span>
                    </div>
                  ));
                })()
            ) : (
                [0, 1000, 2000, 3000, 4000, 5000, 6000].map(v => (
                    <div key={v} className="flex flex-col items-center pt-1">
                        <div className="w-px h-2 bg-slate-700" />
                        <span className="text-[9px] text-slate-500">{v/1000}k</span>
                    </div>
                ))
            )}
        </div>

        {/* S-Meter Bar */}
        <div className="h-12 bg-[#0a1218] border-t border-[#1a2b36] px-6 flex items-center gap-4">
          <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest w-16">SIGNAL</span>
          <div className="flex-1 h-3 bg-black/50 border border-[#1a2b36] rounded-full overflow-hidden relative">
            <div 
              className={`h-full transition-all duration-300 ${smeter.pct > 70 ? 'bg-rose-500' : smeter.pct > 40 ? 'bg-amber-400' : 'bg-cyan-500'}`}
              style={{ width: `${smeter.pct}%`, boxShadow: '0 0 10px currentColor' }}
            />
            <div className="absolute inset-0 flex justify-between items-center px-4 pointer-events-none opacity-20">
                {[1,2,3,4,5,6,7,8,9].map(n => <span key={n} className="text-[7px]">S{n}</span>)}
            </div>
          </div>
          <div className="flex items-center gap-4 w-40 justify-end">
            <span className={`font-bold transition-colors ${smeter.color}`}>{smeter.label}</span>
            <span className="text-slate-500 tabular-nums">{sMeterDbm?.toFixed(1) ?? '--'} dBm</span>
          </div>
        </div>
      </div>

      {/* ── RIGHT SIDEBAR: WATERFALL SETTINGS ── */}
      <div className="w-72 border-l border-[#1a2b36] bg-[#0a1218] flex flex-col pt-4 overflow-y-auto">
        <div className="px-5 mb-6 flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Waterfall Settings</span>
        </div>

        <div className="px-5 space-y-5">
            {/* RF Gain — sends SET agc/manGain to KiwiSDR */}
            <div className="space-y-3">
                <div className="flex justify-between items-end">
                    <span className="text-[9px] text-slate-500 uppercase font-bold">RF Gain</span>
                    <span className="text-cyan-400 font-bold">{manGain} dB</span>
                </div>
                {/* AGC toggle */}
                <div className="flex gap-1">
                    <button
                        onClick={() => {
                            const next = true;
                            setAgcOn(next);
                            if (activeKiwiConfig && bridgeConnected)
                                sendAction({ action: 'SET_AGC', agc: next, man_gain: manGain });
                        }}
                        className={`flex-1 py-1 rounded-l border text-[9px] font-bold transition-all ${agcOn ? 'bg-cyan-600/20 border-cyan-500 text-cyan-300' : 'bg-black/30 border-[#1a2b36] text-slate-600'}`}
                    >
                        AGC
                    </button>
                    <button
                        onClick={() => {
                            const next = false;
                            setAgcOn(next);
                            if (activeKiwiConfig && bridgeConnected)
                                sendAction({ action: 'SET_AGC', agc: next, man_gain: manGain });
                        }}
                        className={`flex-1 py-1 rounded-r border text-[9px] font-bold transition-all ${!agcOn ? 'bg-amber-600/20 border-amber-500 text-amber-300' : 'bg-black/30 border-[#1a2b36] text-slate-600'}`}
                    >
                        MAN
                    </button>
                </div>
                <input
                    type="range" min={0} max={120} value={manGain}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const val = parseInt(e.target.value);
                        setManGain(val);
                        if (activeKiwiConfig && bridgeConnected)
                            sendAction({ action: 'SET_AGC', agc: agcOn, man_gain: val });
                    }}
                    className="w-full h-1 accent-cyan-500 bg-[#1a2b36] rounded appearance-none cursor-pointer"
                />
            </div>

            {/* SQL Control — sends SET squelch to KiwiSDR */}
            <div className="space-y-3">
                <div className="flex justify-between items-end">
                    <span className="text-[9px] text-slate-500 uppercase font-bold">SQL (Squelch)</span>
                    <span className="text-indigo-400 font-bold">{sql > 0 ? `${sql}%` : 'OFF'}</span>
                </div>
                <input
                    type="range" min={0} max={100} value={sql}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const val = parseInt(e.target.value);
                        setSql(val);
                        if (activeKiwiConfig && bridgeConnected) {
                            sendAction({
                                action: 'SET_SQUELCH',
                                enabled: val > 0,
                                threshold: val,
                            });
                        }
                    }}
                    className="w-full h-1 accent-indigo-500 bg-[#1a2b36] rounded appearance-none cursor-pointer"
                />
            </div>

            {/* SQN — display-only noise floor meter */}
            <div className="space-y-3">
                <div className="flex justify-between items-end">
                    <span className="text-[9px] text-slate-500 uppercase font-bold">SQN (Noise Floor)</span>
                    <span className="text-rose-400 font-bold">{sqn}</span>
                </div>
                <input
                    type="range" min={0} max={100} value={sqn}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSqn(parseInt(e.target.value))}
                    className="w-full h-1 accent-rose-500 bg-[#1a2b36] rounded appearance-none cursor-pointer"
                />
            </div>

            <div className="h-px bg-[#1a2b36]" />

            {/* Waterfall Offset — Local display only calibration */}
            <div className="space-y-3">
                <div className="flex justify-between items-end">
                    <span className="text-[9px] text-slate-500 uppercase font-bold">WF Baseline (Offset)</span>
                    <span className="text-emerald-400 font-bold">{wfOffset}</span>
                </div>
                <input
                    type="range" min={0} max={255} value={wfOffset}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWfOffset(parseInt(e.target.value))}
                    className="w-full h-1 accent-emerald-500 bg-[#1a2b36] rounded appearance-none cursor-pointer"
                />
            </div>

            <div className="h-px bg-[#1a2b36]" />

            {/* Waterfall Zoom */}
            <div className="space-y-2 pb-4">
                <div className="flex justify-between items-end">
                    <span className="text-[9px] text-slate-500 uppercase font-bold">Spectral Zoom</span>
                    <span className="text-cyan-400 font-bold">LVL {zoom}</span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            const next = Math.max(0, zoom - 1);
                            setZoom(next);
                            sendAction({ action: 'SET_ZOOM', zoom: next });
                        }}
                        className="flex-1 py-1.5 bg-black/40 border border-[#1a2b36] rounded text-[10px] font-bold text-slate-400 hover:text-white hover:bg-black/60 transition-all flex items-center justify-center gap-1"
                    >
                        <ChevronDown className="w-3 h-3" />
                        OUT (-)
                    </button>
                    <button
                        onClick={() => {
                            const next = Math.min(10, zoom + 1);
                            setZoom(next);
                            sendAction({ action: 'SET_ZOOM', zoom: next });
                        }}
                        className="flex-1 py-1.5 bg-black/40 border border-[#1a2b36] rounded text-[10px] font-bold text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/20 transition-all flex items-center justify-center gap-1"
                    >
                        <ChevronUp className="w-3 h-3" />
                        IN (+)
                    </button>
                </div>
                <div className="text-[8px] text-slate-600 uppercase text-center tracking-tighter">
                    Span: ~{getWideSpan(zoom).toFixed(1)} kHz
                </div>
            </div>

            <div className="h-px bg-[#1a2b36]" />

            {/* Waterfall Cadence — client-side frame skip (can throttle, not speed up) */}
            <div className="space-y-3">
                <span className="text-[9px] text-slate-500 uppercase font-bold">Waterfall Cadence</span>
                <div className="flex gap-1">
                    {([['¼', 4], ['½', 2], ['1×', 1]] as [string, number][]).map(([label, skip]) => (
                        <button
                            key={label}
                            onClick={() => setWfSkip(skip)}
                            className={`flex-1 py-1 rounded border text-[9px] font-bold transition-all ${
                                wfSkip === skip
                                    ? 'bg-cyan-600/20 border-cyan-500 text-cyan-300'
                                    : 'bg-black/20 border-[#1a2b36] text-slate-600 hover:text-slate-400'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>
        </div>

        {/* Global Stats Sidebar Bottom */}
        <div className="mt-auto p-5 bg-[#0d161d] border-t border-[#1a2b36] space-y-3">
            <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">ENGINE</span>
                <span className="text-emerald-500/80 font-bold">KIWI_WF</span>
            </div>
            <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">BITRATE</span>
                <span className="text-slate-300 select-all">192.4 kbps</span>
            </div>
            <div className="bg-[#111d27] rounded p-3 border border-[#1a2b36] flex items-center justify-center gap-3">
                <Target className="w-5 h-5 text-indigo-500/50" />
                <div className="flex flex-col">
                    <span className="text-[8px] text-slate-600 uppercase font-bold">Tuning Lock</span>
                    <span className="text-[10px] text-slate-400 font-bold">PHASE_SYNC_OK</span>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
