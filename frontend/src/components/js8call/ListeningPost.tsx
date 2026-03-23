/**
 * ListeningPost — Professional HF Operator Terminal
 *
 * An overhauled UI inspired by modern tactical radio systems and the user's mockup.
 * Supports dual-mode waterfall:
 *  1. Audio Passband (narrow, low-latency, driven by WebAudio AnalyserNode)
 *  2. Wide Panoramic (driven by /ws/waterfall binary stream from the backend)
 */

import {
  Activity,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Sliders,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Constants & Types
// ---------------------------------------------------------------------------

const HF_BANDS = [
  { label: "240m", freq: 1100 },
  { label: "160m", freq: 1850 },
  { label: "80m", freq: 3700 },
  { label: "60m", freq: 5330 },
  { label: "40m", freq: 7150 },
  { label: "30m", freq: 10100 },
  { label: "20m", freq: 14200 },
  { label: "17m", freq: 18100 },
  { label: "15m", freq: 21250 },
  { label: "12m", freq: 24940 },
  { label: "10m", freq: 28500 },
  { label: "6m", freq: 50000 },
  { label: "2m", freq: 144000 },
] as const;

const KIWI_MODES = [
  "usb",
  "lsb",
  "am",
  "amn",
  "amw",
  "sam",
  "cw",
  "cwn",
  "nbfm",
  "drm",
  "iq",
] as const;
type KiwiMode = (typeof KIWI_MODES)[number];

const MODE_INFO: Record<KiwiMode, { label: string; bw: number }> = {
  usb: { label: "USB", bw: 2.7 },
  lsb: { label: "LSB", bw: 2.7 },
  am: { label: "AM", bw: 9.0 },
  amn: { label: "AMN", bw: 5.0 },
  amw: { label: "AMW", bw: 16.0 }, // AM wideband (broadcast)
  sam: { label: "SAM", bw: 9.0 },
  cw: { label: "CW", bw: 0.5 },
  cwn: { label: "CWN", bw: 0.3 },
  nbfm: { label: "FM", bw: 16.0 },
  drm: { label: "DRM", bw: 10.0 }, // Digital Radio Mondiale
  iq: { label: "IQ", bw: 30.0 }, // Raw IQ — wider viewport
};

// Waterfall colour map labels (index matches KiwiSDR SET cmap= values)
const WF_CMAPS = [
  { label: "Kiwi", index: 0 },
  { label: "CSDR", index: 1 },
  { label: "Grey", index: 2 },
  { label: "Linear", index: 3 },
  { label: "Turbo", index: 4 },
  { label: "SdrDx", index: 5 },
] as const;

const getWsBaseUrl = () => {
  const envUrl = import.meta.env.VITE_JS8_WS_URL;
  if (envUrl && !envUrl.includes("localhost")) {
    return envUrl;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/js8/ws/js8`;
};

const WS_BASE_URL = getWsBaseUrl();
const WATERFALL_WS_URL = WS_BASE_URL.replace(/\/ws\/js8$/, "/ws/waterfall");

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

function dbmToSmeter(dbm: number): {
  label: string;
  pct: number;
  color: string;
} {
  const pct = Math.min(100, Math.max(0, ((dbm + 127) / 97) * 100));
  let label: string;
  if (dbm >= -73) {
    const over = Math.round(dbm + 73);
    label = `S9+${over}`;
  } else {
    const s = Math.max(0, Math.min(9, Math.round((dbm + 127) / 6)));
    label = `S${s}`;
  }
  const color =
    pct > 70
      ? "text-rose-500"
      : pct > 45
        ? "text-amber-400"
        : "text-emerald-500";
  return { label, pct, color };
}

// ── SDR Colormaps ───────────────────────────────────────────────────────────

/**
 * Standard SDR Waterfall Palette Definitions.
 * Each entry is a series of [threshold, R, G, B] stops for interpolation.
 */
const PALETTES: Record<number, [number, number, number, number][]> = {
  // 0: Kiwi (Classic Blue -> Cyan -> Green -> Yellow -> Red -> White)
  0: [
    [0, 0, 0, 40],
    [60, 0, 0, 100],
    [120, 0, 255, 255],
    [165, 0, 255, 0],
    [205, 255, 255, 0],
    [240, 255, 0, 0],
    [255, 255, 255, 255],
  ],
  // 1: CSDR (Blue -> Greenish Cyan -> Pale Yellow)
  1: [
    [0, 0, 0, 0],
    [80, 0, 30, 120],
    [150, 0, 180, 180],
    [210, 180, 220, 100],
    [255, 255, 255, 180],
  ],
  // 2: Grey (Luminance only)
  2: [
    [0, 0, 0, 0],
    [255, 255, 255, 255],
  ],
  // 3: Linear (Deep Violet -> Blue -> Cyan -> Green -> Yellow -> Orange -> Red)
  3: [
    [0, 30, 0, 60],
    [42, 0, 0, 255],
    [84, 0, 255, 255],
    [126, 0, 255, 0],
    [168, 255, 255, 0],
    [210, 255, 128, 0],
    [255, 255, 0, 0],
  ],
  // 4: Turbo (Google's high-contrast perception-balanced palette)
  4: [
    [0, 48, 18, 59],
    [32, 70, 107, 227],
    [64, 40, 188, 235],
    [96, 50, 242, 152],
    [128, 163, 255, 50],
    [160, 238, 180, 40],
    [192, 243, 100, 35],
    [224, 188, 37, 20],
    [255, 122, 4, 3],
  ],
  // 5: SdrDx (High contrast technical: Navy -> Blue -> Royal -> Cyan -> Yellow -> White)
  5: [
    [0, 0, 0, 30],
    [50, 0, 0, 150],
    [100, 65, 105, 225],
    [150, 0, 255, 255],
    [200, 255, 255, 0],
    [255, 255, 255, 255],
  ],
};

/**
 * Pre-computes 256-color lookup tables for each palette.
 */
const COLOR_TABLES = Object.entries(PALETTES).reduce(
  (acc, [idx, stops]) => {
    const table = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      // Find the two stops this value falls between
      let upperIdx = stops.findIndex((s) => s[0] >= i);
      if (upperIdx === -1) upperIdx = stops.length - 1;
      const lowerIdx = Math.max(0, upperIdx - 1);

      const [v0, r0, g0, b0] = stops[lowerIdx];
      const [v1, r1, g1, b1] = stops[upperIdx];

      const range = v1 - v0;
      const weight = range === 0 ? 0 : (i - v0) / range;

      table[i * 3] = r0 + (r1 - r0) * weight;
      table[i * 3 + 1] = g0 + (g1 - g0) * weight;
      table[i * 3 + 2] = b0 + (b1 - b0) * weight;
    }
    acc[parseInt(idx)] = table;
    return acc;
  },
  {} as Record<number, Uint8ClampedArray>,
);

/**
 * Returns RGB color from the pre-computed table for the given colormap index.
 */
function sdrWaterfallColor(
  value: number,
  cmapIndex: number,
): [number, number, number] {
  const table = COLOR_TABLES[cmapIndex] || COLOR_TABLES[0];
  const v = Math.max(0, Math.min(255, Math.round(value)));
  return [table[v * 3], table[v * 3 + 1], table[v * 3 + 2]];
}

// ── UI Components ───────────────────────────────────────────────────────────

interface CollapsibleSectionProps {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}

function CollapsibleSection({
  title,
  icon: Icon,
  children,
  isOpen,
  onToggle,
}: CollapsibleSectionProps) {
  return (
    <div className="border-b border-[#1a2b36] last:border-0">
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/5 transition-colors group"
      >
        <div className="flex items-center gap-2">
          {Icon && (
            <Icon className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 transition-colors" />
          )}
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest group-hover:text-slate-200">
            {title}
          </span>
        </div>
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
        )}
      </button>
      {isOpen && (
        <div className="px-5 pb-5 space-y-5 animate-in fade-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
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
  audioEnabled: boolean;
  enableAudio: () => void;
  volume: number;
  onVolumeChange: (v: number) => void;
  sMeterDbm: number | null;
  activeKiwiConfig: ActiveKiwiConfig | null;
  bridgeConnected: boolean;
  sendAction: (payload: object) => void;
  isConnected: boolean;
  adcOverload?: boolean;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ListeningPost({
  analyserNode,
  audioEnabled,
  enableAudio,
  volume,
  onVolumeChange,
  sMeterDbm,
  activeKiwiConfig,
  bridgeConnected,
  sendAction,
  isConnected,
  adcOverload = false,
}: ListeningPostProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);

  // State
  const [localFreq, setLocalFreq] = useState<number>(
    activeKiwiConfig?.freq ?? 14074,
  );
  const [localMode, setLocalMode] = useState<KiwiMode>(
    (activeKiwiConfig?.mode as KiwiMode) ?? "usb",
  );
  const [zoom, setZoom] = useState(5); // Default zoom level
  const [wfMode, setWfMode] = useState<"PASSBAND" | "WIDE">("WIDE");

  // Settings
  const [manGain, setManGain] = useState(50); // 0-120 KiwiSDR manGain
  const [agcOn, setAgcOn] = useState(true); // AGC enabled by default
  const [wfSkip, setWfSkip] = useState(1); // client-side frame skip (1=all,2=every other,…)
  const [sqn, setSqn] = useState(20);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Reset disconnecting state if config cleared or changed
  useEffect(() => {
    setIsDisconnecting(false);
  }, [activeKiwiConfig?.host]);
  const [sql, setSql] = useState(0);
  const [sqHysteresis, setSqHysteresis] = useState(10); // squelch hysteresis (UI units 0-50)
  const [nbEnabled, setNbEnabled] = useState(false); // noise blanker on/off
  const [nbGate, setNbGate] = useState(500); // gate µs (100-2000)
  const [nbThresh, setNbThresh] = useState(50); // trigger % of peak (1-100)
  const [deEmp, setDeEmp] = useState(0); // de-emphasis: 0=off, 1=50µs, 2=75µs

  // Notch filter
  const [notchEnabled, setNotchEnabled] = useState(false);
  const [notchFreq, setNotchFreq] = useState(1000); // Hz relative to carrier
  const [notchBw, setNotchBw] = useState(100); // Hz bandwidth

  // Noise reduction / noise filter
  const [nrEnabled, setNrEnabled] = useState(false);
  const [nfEnabled, setNfEnabled] = useState(false);

  // RF attenuator
  const [rfAttn, setRfAttn] = useState(0); // dB (0 = bypass)

  // Waterfall colour map and aperture (sent to backend → KiwiSDR W/F stream)
  const [wfCmap, setWfCmap] = useState(0); // 0=Kiwi (default)
  const [wfAperture, setWfAperture] = useState(true); // true = auto

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    tuning: true,
    bands: true,
    gain: true,
    dsp: false,
    display: false,
  });

  const toggleSection = (id: string) => {
    setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const [wfOffset, setWfOffset] = useState(100); // Waterfall baseline calibration
  const wfOffsetRef = useRef(100); // Ref so drawRow always reads latest without re-creating the WS
  const wfCmapRef = useRef(0);
  const wfApertureRef = useRef(true);
  const wfFrameCountRef = useRef(0);

  // Offscreen buffer for hardware-accelerated stretching
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rowDataRef = useRef<ImageData | null>(null);

  // ── Waterfall Rendering Loop ──────────────────────────────────────────────

  // Keep the ref in sync with the state so drawRow reads the latest value
  // without being listed as a useEffect dependency (which would tear down the WS).
  useEffect(() => {
    wfOffsetRef.current = wfOffset;
    wfCmapRef.current = wfCmap;
    wfApertureRef.current = wfAperture;
  }, [wfOffset, wfCmap, wfAperture]);

  const drawRow = useCallback(
    (
      pixels: Uint8Array | number[],
      ctx2d: CanvasRenderingContext2D,
      w: number,
      h: number,
    ) => {
      const srcLen = pixels.length;

      // 1. SCROLL DOWN (GPU ACCELERATED)
      // Moving the entire viewport down by 1px
      ctx2d.drawImage(ctx2d.canvas, 0, 0, w, h - 1, 0, 1, w, h - 1);

      // 2. RENDER NEW ROW (OFFSCREEN)
      // We lazily initialize our offscreen buffer to match the SDR stream width (usually 1024)
      if (
        !offscreenCanvasRef.current ||
        offscreenCanvasRef.current.width !== srcLen
      ) {
        const off = document.createElement("canvas");
        off.width = srcLen;
        off.height = 1;
        offscreenCanvasRef.current = off;
        rowDataRef.current = off
          .getContext("2d", { alpha: false })!
          .createImageData(srcLen, 1);
      }

      const row = rowDataRef.current!;
      const data = row.data;

      // Direct loop over raw pixels (no horizontal interp yet)
      for (let i = 0; i < srcLen; i++) {
        const intensity = Math.max(0, pixels[i] - wfOffsetRef.current);
        const [r, g, b] = sdrWaterfallColor(intensity, wfCmapRef.current);
        const idx = i * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }

      // 3. STRETCH & DRAW TO MAIN CANVAS (GPU ACCELERATED BILINEAR)
      const offCtx = offscreenCanvasRef.current.getContext("2d", {
        alpha: false,
      })!;
      offCtx.putImageData(row, 0, 0);

      // 4. AUTO-APERTURE CALCULATION (LIGHTWEIGHT)
      if (wfApertureRef.current && wfFrameCountRef.current % 30 === 0) {
        // Sample every ~1 second (at 30fps) to find the noise floor.
        // We use a cheap percentile approximation to avoid sorting the whole array.
        let sum = 0;
        const sampleSize = Math.floor(srcLen / 10);
        for (let j = 0; j < sampleSize; j++) {
            sum += pixels[j * 10]; // Subsample every 10th bin
        }
        const avgNoise = sum / sampleSize;
        
        // Target an offset that sits just below the noise floor (+/- some margin)
        // This keeps the signals visible while keeping the background dark.
        const targetOffset = Math.max(0, Math.min(255, Math.round(avgNoise - 15)));
        
        // Slightly dampen the change so it doesn't flicker
        if (Math.abs(targetOffset - wfOffsetRef.current) > 2) {
          setWfOffset(prev => Math.round(prev * 0.9 + targetOffset * 0.1));
        }
      }

      // We explicitly enable smoothing for that "buttery" SDR look the user wants
      ctx2d.imageSmoothingEnabled = true;
      ctx2d.imageSmoothingQuality = "high";
      
      // Draw the 1px tall offscreen strip stretched across the main canvas width
      ctx2d.drawImage(offscreenCanvasRef.current, 0, 0, srcLen, 1, 0, 0, w, 1);
    },
    [setWfOffset],
  ); // Refs allow reading latest without re-creating the WS

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx2d) return;

    if (wfMode === "PASSBAND" && analyserNode) {
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
    } else if (wfMode === "WIDE") {
      // WIDE mode: Use WebSocket binary stream
      let reconnectTimeout: number | undefined;
      let active = true;

      const connect = () => {
        if (!active) return;
        const ws = new WebSocket(WATERFALL_WS_URL);
        ws.binaryType = "arraybuffer";
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
        const ws = wsRef.current;
        if (ws) {
          wsRef.current = null;
          if (ws.readyState === WebSocket.CONNECTING) {
            // Socket hasn't opened yet (React StrictMode double-invoke or rapid
            // re-render). Wait until it opens, then close it cleanly.
            ws.onopen = () => ws.close();
          } else {
            ws.close();
          }
        }
      };
    }
    // Only re-create the WebSocket when wfMode or analyserNode changes.
    // wfSkip is read via closure but doesn't need to close/reopen the socket;
    // wfOffset is read via wfOffsetRef; zoom is sent separately via SET_ZOOM action.
     
  }, [wfMode, analyserNode]);

  // Sync local frequency and mode with active config from bridge
  // Use render-phase stabilization to avoid cascading render warnings in useEffect
  const [prevSyncFreq, setPrevSyncFreq] = useState<number | undefined>(
    activeKiwiConfig?.freq,
  );
  const [prevSyncMode, setPrevSyncMode] = useState<string | undefined>(
    activeKiwiConfig?.mode,
  );

  if (
    activeKiwiConfig &&
    (activeKiwiConfig.freq !== prevSyncFreq ||
      activeKiwiConfig.mode !== prevSyncMode)
  ) {
    setLocalFreq(activeKiwiConfig.freq);
    setLocalMode(activeKiwiConfig.mode as KiwiMode);
    setPrevSyncFreq(activeKiwiConfig.freq);
    setPrevSyncMode(activeKiwiConfig.mode);
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  const tune = useCallback(
    (freq: number, mode: KiwiMode) => {
      if (!activeKiwiConfig || !bridgeConnected) return;
      const clamped = Math.max(0, Math.min(30000, freq));
      setLocalFreq(clamped);
      setLocalMode(mode);
      sendAction({
        action: "SET_KIWI",
        host: activeKiwiConfig.host,
        port: activeKiwiConfig.port,
        freq: clamped,
        mode,
      });
    },
    [activeKiwiConfig, bridgeConnected, sendAction],
  );

  const step = (delta: number) => tune(localFreq + delta, localMode);

  // ── S-Meter Data ─────────────────────────────────────────────────────────

  const smeter = dbmToSmeter(sMeterDbm ?? -127);

  const handleScaleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padding = 16; // px-4
    const width = rect.width - padding * 2; // Corrected padding calculation
    const clickX = Math.max(0, Math.min(width, x - padding));

    if (wfMode === "WIDE") {
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
          <span className="uppercase tracking-[0.2em] font-bold text-cyan-500/80">
            Listening Post
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <div
              className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-cyan-500 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.8)]" : "bg-slate-700"}`}
            />
            <span className="text-[9px] text-slate-500">
              {isConnected ? "REMOTE LINKED" : "OFFLINE"}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <CollapsibleSection
            title="Tuning & Mode"
            icon={Activity}
            isOpen={expandedSections.tuning}
            onToggle={() => toggleSection("tuning")}
          >
            <div className="space-y-4 pt-2">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest text-left">
                  Central Frequency
                </span>
                <div className="flex items-baseline justify-between bg-black/40 border border-[#1a2b36] rounded-md px-3 py-2.5 group hover:border-cyan-500/30 transition-all duration-300">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-cyan-400 tracking-tighter tabular-nums drop-shadow-[0_0_15px_rgba(34,211,238,0.2)]">
                      {localFreq.toFixed(2)}
                    </span>
                    <span className="text-xl font-bold text-cyan-900 uppercase">
                      kHz
                    </span>
                  </div>
                  {activeKiwiConfig?.freq !== localFreq && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                      <Activity
                        size={10}
                        className="text-amber-500 animate-pulse"
                      />
                      <span className="text-[9px] font-bold text-amber-500 uppercase tracking-tighter">
                        Tuning...
                      </span>
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

              <div className="h-px bg-[#1a2b36]" />

              {/* Mode Selector */}
              <div className="space-y-2">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                  Modulation Mode
                </span>
                <div className="grid grid-cols-3 gap-1">
                  {KIWI_MODES.map((m) => {
                    const info = MODE_INFO[m];
                    return (
                      <button
                        key={m}
                        onClick={() => tune(localFreq, m)}
                        className={`py-1.5 rounded text-[10px] font-bold uppercase transition-all ${
                          localMode === m
                            ? "bg-emerald-600/20 border border-emerald-500 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                            : "bg-black/30 border border-[#1a2b36] text-slate-600 hover:text-slate-400"
                        }`}
                      >
                        {info.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Global Bands"
            icon={Zap}
            isOpen={expandedSections.bands}
            onToggle={() => toggleSection("bands")}
          >
            <div className="grid grid-cols-4 gap-1 pt-2">
              {HF_BANDS.map((b) => {
                const active = Math.abs(localFreq - b.freq) < 100;
                return (
                  <button
                    key={b.label}
                    onClick={() => tune(b.freq, localMode)}
                    className={`py-1.5 rounded text-[10px] uppercase transition-all ${
                      active
                        ? "bg-amber-500/20 border border-amber-500/50 text-amber-500"
                        : "bg-black/20 border border-[#1a2b36] text-slate-600 hover:bg-black/40"
                    }`}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
          </CollapsibleSection>
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
            <div className="flex items-center gap-4 mb-2">
              <button onClick={() => onVolumeChange(volume === 0 ? 0.8 : 0)}>
                {volume === 0 ? (
                  <VolumeX className="w-5 h-5 text-rose-500" />
                ) : (
                  <Volume2 className="w-5 h-5 text-cyan-400" />
                )}
              </button>
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-[9px] text-slate-500 uppercase">
                  <span>Mute</span>
                  <span>{Math.round(volume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.05}
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
        {/* ADC overload alert — dismissed automatically after 8 s */}
        {adcOverload && (
          <div className="absolute top-2 left-2 right-2 z-30 flex items-center gap-2 px-3 py-2 rounded bg-rose-900/80 border border-rose-500/60 backdrop-blur-sm">
            <Zap className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span className="text-[10px] font-bold text-rose-200 uppercase tracking-wide">
              ADC Overload — node input saturated. Switch nodes or reduce gain.
            </span>
          </div>
        )}

        {/* No-connection overlay — shown when no KiwiSDR is linked */}
        {!activeKiwiConfig && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-none select-none">
            <div className="flex flex-col items-center gap-3 text-center px-8">
              <Activity className="w-10 h-10 text-slate-600 animate-pulse" />
              <span className="text-slate-400 font-bold text-sm uppercase tracking-widest">
                No SDR Node Linked
              </span>
              <span className="text-slate-600 text-[11px]">
                Open the Node Browser (top bar) to connect to a KiwiSDR.
                <br />
                Frequency controls will activate once a node is linked.
              </span>
            </div>
          </div>
        )}

        {/* Top Waterfall Controls */}
        <div className="absolute bottom-10 left-0 right-0 p-4 flex items-center justify-between z-10 pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              onClick={() => setWfMode("WIDE")}
              className={`px-3 py-1.5 rounded text-[9px] font-bold uppercase transition-all ${wfMode === "WIDE" ? "bg-cyan-600/20 border border-cyan-500 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]" : "bg-black/60 border border-[#1a2b36] text-slate-500 hover:text-slate-300"}`}
            >
              Panoramic (WF)
            </button>
            <button
              onClick={() => setWfMode("PASSBAND")}
              className={`px-3 py-1.5 rounded text-[9px] font-bold uppercase transition-all ${wfMode === "PASSBAND" ? "bg-indigo-600/20 border border-indigo-500 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.2)]" : "bg-black/60 border border-[#1a2b36] text-slate-500 hover:text-slate-300"}`}
            >
              Passband (WS)
            </button>
            <button
              onClick={() => {
                if (bridgeConnected) {
                  setIsDisconnecting(true);
                  sendAction({ action: "DISCONNECT_KIWI" });
                }
              }}
              disabled={isDisconnecting}
              className={`px-3 py-1.5 rounded text-[9px] font-bold uppercase transition-all shadow-[0_0_10px_rgba(244,63,94,0.1)] ${isDisconnecting ? "bg-rose-900/40 border-rose-900 text-rose-700 cursor-not-allowed" : "bg-rose-600/20 border border-rose-500 text-rose-300 hover:bg-rose-500 hover:text-white"}`}
            >
              {isDisconnecting ? "Stopping..." : "Stop"}
            </button>
          </div>

          <div className="bg-black/80 border border-[#1a2b36] rounded px-3 py-1 pointer-events-auto text-cyan-500/80 font-bold group">
            <span className="text-[10px] text-slate-500 mr-2">RX SOURCE:</span>
            {isDisconnecting ? (
              <span className="text-rose-400 animate-pulse">
                DISCONNECTING...
              </span>
            ) : (
              activeKiwiConfig?.host || "NO_LINK"
            )}
          </div>
        </div>

        <canvas
          ref={canvasRef}
          className="flex-1 w-full block bg-black"
          style={{ imageRendering: "pixelated" }}
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
                left:
                  wfMode === "WIDE"
                    ? `calc(50% - ${(MODE_INFO[localMode as keyof typeof MODE_INFO].bw / getWideSpan(zoom)) * 50}%)`
                    : `calc(16px + ${(0 / 6) * (100 - 32)}%)`, // Starting at 0Hz in PB mode
                width:
                  wfMode === "WIDE"
                    ? `${(MODE_INFO[localMode as keyof typeof MODE_INFO].bw / getWideSpan(zoom)) * 100}%`
                    : `${(MODE_INFO[localMode as keyof typeof MODE_INFO].bw / 6) * 100}%`,
                opacity: 0.8,
              }}
            />
          )}

          {wfMode === "WIDE"
            ? (() => {
                const span = getWideSpan(zoom);
                // Dynamic ticks based on span
                let tickStep: number;
                if (span < 50) tickStep = 5;
                else if (span < 150) tickStep = 10;
                else if (span < 400) tickStep = 25;
                else if (span < 1000) tickStep = 100;
                else if (span < 4000) tickStep = 500;
                else tickStep = 1000;

                const sideTicks = Math.floor(span / 2 / tickStep);
                const ticks = [];
                for (let i = -sideTicks; i <= sideTicks; i++)
                  ticks.push(i * tickStep);

                return ticks.map((v) => (
                  <div
                    key={v}
                    className="flex flex-col items-center pt-1"
                    style={{
                      position: "absolute",
                      left: `calc(16px + ${(v + span / 2) / span} * (100% - 32px))`,
                      transform: "translateX(-50%)",
                    }}
                  >
                    <div className="w-px h-2 bg-slate-200" />
                    <span className="text-[9px] text-slate-200">
                      {v > 0 ? `+${v}k` : v === 0 ? "CF" : `${v}k`}
                    </span>
                  </div>
                ));
              })()
            : [0, 1000, 2000, 3000, 4000, 5000, 6000].map((v) => (
                <div key={v} className="flex flex-col items-center pt-1">
                  <div className="w-px h-2 bg-slate-700" />
                  <span className="text-[9px] text-slate-500">{v / 1000}k</span>
                </div>
              ))}
        </div>

        {/* S-Meter Bar Overlay */}
        <div className="absolute bottom-0 left-0 right-0 h-10 bg-[#0a1218]/90 backdrop-blur-sm border-t border-[#1a2b36] px-6 flex items-center gap-4 z-20 pointer-events-auto">
          <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest w-16 shrink-0">
            SIGNAL
          </span>
          <div className="flex-1 h-3 bg-black/50 border border-[#1a2b36] rounded-full overflow-hidden relative">
            <div
              className={`h-full transition-all duration-300 ${smeter.pct > 70 ? "bg-rose-500" : smeter.pct > 40 ? "bg-amber-400" : "bg-cyan-500"}`}
              style={{
                width: `${smeter.pct}%`,
                boxShadow: "0 0 10px currentColor",
              }}
            />
            <div className="absolute inset-0 flex justify-between items-center px-4 pointer-events-none opacity-20">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <span key={n} className="text-[7px]">
                  S{n}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4 w-40 justify-end shrink-0">
            <span className={`font-bold transition-colors ${smeter.color}`}>
              {smeter.label}
            </span>
            <span className="text-slate-500 tabular-nums">
              {sMeterDbm?.toFixed(1) ?? "--"} dBm
            </span>
          </div>
        </div>
      </div>

      {/* ── RIGHT SIDEBAR: KiwiSDR SETTINGS ── */}
      <div className="w-72 border-l border-[#1a2b36] bg-[#0a1218] flex flex-col pt-0 overflow-y-auto">
        <CollapsibleSection
          title="Gain & Squelch"
          icon={Activity}
          isOpen={expandedSections.gain}
          onToggle={() => toggleSection("gain")}
        >
          <div className="space-y-5 pt-2">
            {/* RF Gain — sends SET agc/manGain to KiwiSDR */}
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <span className="text-[9px] text-slate-500 uppercase font-bold">
                  RF Gain
                </span>
                <span className="text-cyan-400 font-bold">{manGain} dB</span>
              </div>
              {/* AGC toggle */}
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    const next = true;
                    setAgcOn(next);
                    if (activeKiwiConfig && bridgeConnected)
                      sendAction({
                        action: "SET_AGC",
                        agc: next,
                        man_gain: manGain,
                      });
                  }}
                  className={`flex-1 py-1 rounded-l border text-[9px] font-bold transition-all ${agcOn ? "bg-cyan-600/20 border-cyan-500 text-cyan-300" : "bg-black/30 border-[#1a2b36] text-slate-600"}`}
                >
                  AGC
                </button>
                <button
                  onClick={() => {
                    const next = false;
                    setAgcOn(next);
                    if (activeKiwiConfig && bridgeConnected)
                      sendAction({
                        action: "SET_AGC",
                        agc: next,
                        man_gain: manGain,
                      });
                  }}
                  className={`flex-1 py-1 rounded-r border text-[9px] font-bold transition-all ${!agcOn ? "bg-amber-600/20 border-amber-500 text-amber-300" : "bg-black/30 border-[#1a2b36] text-slate-600"}`}
                >
                  MAN
                </button>
              </div>
              <input
                type="range"
                min={0}
                max={120}
                value={manGain}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = parseInt(e.target.value);
                  setManGain(val);
                  if (activeKiwiConfig && bridgeConnected)
                    sendAction({ action: "SET_AGC", agc: agcOn, man_gain: val });
                }}
                className="w-full h-1 accent-cyan-500 bg-[#1a2b36] rounded appearance-none cursor-pointer"
              />
            </div>

            {/* SQL Control — sends SET squelch to KiwiSDR */}
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <span className="text-[9px] text-slate-500 uppercase font-bold">
                  SQL (Squelch)
                </span>
                <span className="text-indigo-400 font-bold">
                  {sql > 0 ? `${sql}%` : "OFF"}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={sql}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = parseInt(e.target.value);
                  setSql(val);
                  if (activeKiwiConfig && bridgeConnected) {
                    sendAction({
                      action: "SET_SQUELCH",
                      enabled: val > 0,
                      threshold: val,
                      hysteresis: sqHysteresis,
                    });
                  }
                }}
                className="w-full h-1 accent-indigo-500 bg-[#1a2b36] rounded appearance-none cursor-pointer"
              />
              <div className="flex justify-between items-end">
                <span className="text-[9px] text-slate-600 uppercase">
                  Hysteresis
                </span>
                <span className="text-slate-500 text-[9px]">{sqHysteresis}</span>
              </div>
              <input
                type="range"
                min={0}
                max={50}
                value={sqHysteresis}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = parseInt(e.target.value);
                  setSqHysteresis(val);
                  if (activeKiwiConfig && bridgeConnected && sql > 0) {
                    sendAction({
                      action: "SET_SQUELCH",
                      enabled: true,
                      threshold: sql,
                      hysteresis: val,
                    });
                  }
                }}
                className="w-full h-0.5 accent-indigo-400 bg-[#131e28] rounded appearance-none cursor-pointer"
              />
            </div>

            {/* SQN — display-only noise floor meter */}
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <span className="text-[9px] text-slate-500 uppercase font-bold">
                  SQN (Noise Floor)
                </span>
                <span className="text-rose-400 font-bold">{sqn}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={sqn}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSqn(parseInt(e.target.value))
                }
                className="w-full h-1 accent-rose-500 bg-[#1a2b36] rounded appearance-none cursor-pointer"
              />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="DSP Interference"
          icon={Zap}
          isOpen={expandedSections.dsp}
          onToggle={() => toggleSection("dsp")}
        >
          <div className="space-y-5 pt-2">
            {/* Noise Blanker — impulse noise suppression */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[9px] text-slate-500 uppercase font-bold">
                  Noise Blanker
                </span>
                <button
                  onClick={() => {
                    const next = !nbEnabled;
                    setNbEnabled(next);
                    if (activeKiwiConfig && bridgeConnected)
                      sendAction({
                        action: "SET_NOISE_BLANKER",
                        enabled: next,
                        gate_usec: nbGate,
                        thresh_percent: nbThresh,
                      });
                  }}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all ${nbEnabled ? "bg-amber-600/20 border-amber-500 text-amber-300" : "bg-black/30 border-[#1a2b36] text-slate-600"}`}
                >
                  {nbEnabled ? "ON" : "OFF"}
                </button>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-[9px] text-slate-600 uppercase">Gate</span>
                <span className="text-slate-500 text-[9px]">{nbGate} µs</span>
              </div>
              <input
                type="range"
                min={100}
                max={2000}
                step={50}
                value={nbGate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = parseInt(e.target.value);
                  setNbGate(val);
                  if (activeKiwiConfig && bridgeConnected && nbEnabled)
                    sendAction({
                      action: "SET_NOISE_BLANKER",
                      enabled: true,
                      gate_usec: val,
                      thresh_percent: nbThresh,
                    });
                }}
                className="w-full h-0.5 accent-amber-500 bg-[#131e28] rounded appearance-none cursor-pointer"
              />
              <div className="flex justify-between items-end">
                <span className="text-[9px] text-slate-600 uppercase">
                  Threshold
                </span>
                <span className="text-slate-500 text-[9px]">{nbThresh}%</span>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                value={nbThresh}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = parseInt(e.target.value);
                  setNbThresh(val);
                  if (activeKiwiConfig && bridgeConnected && nbEnabled)
                    sendAction({
                      action: "SET_NOISE_BLANKER",
                      enabled: true,
                      gate_usec: nbGate,
                      thresh_percent: val,
                    });
                }}
                className="w-full h-0.5 accent-amber-400 bg-[#131e28] rounded appearance-none cursor-pointer"
              />
            </div>

            <div className="h-px bg-[#1a2b36]" />

            {/* De-emphasis — audio filter for AM/broadcast monitoring */}
            <div className="space-y-3">
              <span className="text-[9px] text-slate-500 uppercase font-bold">
                De-emphasis
              </span>
              <div className="flex gap-1">
                {(
                  [
                    ["Off", 0],
                    ["50µs", 1],
                    ["75µs", 2],
                  ] as [string, number][]
                ).map(([label, val]) => (
                  <button
                    key={val}
                    onClick={() => {
                      setDeEmp(val);
                      if (activeKiwiConfig && bridgeConnected)
                        sendAction({ action: "SET_DE_EMP", de_emp: val });
                    }}
                    className={`flex-1 py-1 rounded border text-[9px] font-bold transition-all ${
                      deEmp === val
                        ? "bg-cyan-600/20 border-cyan-500 text-cyan-300"
                        : "bg-black/20 border-[#1a2b36] text-slate-600 hover:text-slate-400"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-[#1a2b36]" />

            {/* Notch Filter — narrow interferer suppression */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[9px] text-slate-500 uppercase font-bold">
                  Notch Filter
                </span>
                <button
                  onClick={() => {
                    const next = !notchEnabled;
                    setNotchEnabled(next);
                    if (activeKiwiConfig && bridgeConnected)
                      sendAction({
                        action: "SET_NOTCH",
                        enabled: next,
                        freq_hz: notchFreq,
                        bw_hz: notchBw,
                      });
                  }}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all ${notchEnabled ? "bg-violet-600/20 border-violet-500 text-violet-300" : "bg-black/30 border-[#1a2b36] text-slate-600"}`}
                >
                  {notchEnabled ? "ON" : "OFF"}
                </button>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-[9px] text-slate-600 uppercase">Freq</span>
                <span className="text-slate-500 text-[9px]">{notchFreq} Hz</span>
              </div>
              <input
                type="range"
                min={100}
                max={4000}
                step={50}
                value={notchFreq}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = parseInt(e.target.value);
                  setNotchFreq(val);
                  if (activeKiwiConfig && bridgeConnected && notchEnabled)
                    sendAction({
                      action: "SET_NOTCH",
                      enabled: true,
                      freq_hz: val,
                      bw_hz: notchBw,
                    });
                }}
                className="w-full h-0.5 accent-violet-500 bg-[#131e28] rounded appearance-none cursor-pointer"
              />
              <div className="flex justify-between items-end">
                <span className="text-[9px] text-slate-600 uppercase">BW</span>
                <span className="text-slate-500 text-[9px]">{notchBw} Hz</span>
              </div>
              <input
                type="range"
                min={25}
                max={500}
                step={25}
                value={notchBw}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = parseInt(e.target.value);
                  setNotchBw(val);
                  if (activeKiwiConfig && bridgeConnected && notchEnabled)
                    sendAction({
                      action: "SET_NOTCH",
                      enabled: true,
                      freq_hz: notchFreq,
                      bw_hz: val,
                    });
                }}
                className="w-full h-0.5 accent-violet-400 bg-[#131e28] rounded appearance-none cursor-pointer"
              />
            </div>

            <div className="h-px bg-[#1a2b36]" />

            {/* NR / NF — Noise reduction and noise filter toggles */}
            <div className="space-y-3">
              <span className="text-[9px] text-slate-500 uppercase font-bold">
                Noise Processing
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    const next = !nrEnabled;
                    setNrEnabled(next);
                    if (activeKiwiConfig && bridgeConnected)
                      sendAction({ action: "SET_NR", enabled: next, param: 0 });
                  }}
                  className={`flex-1 py-1 rounded border text-[9px] font-bold transition-all ${nrEnabled ? "bg-teal-600/20 border-teal-500 text-teal-300" : "bg-black/30 border-[#1a2b36] text-slate-600"}`}
                >
                  NR {nrEnabled ? "ON" : "OFF"}
                </button>
                <button
                  onClick={() => {
                    const next = !nfEnabled;
                    setNfEnabled(next);
                    if (activeKiwiConfig && bridgeConnected)
                      sendAction({ action: "SET_NF", enabled: next, param: 0 });
                  }}
                  className={`flex-1 py-1 rounded border text-[9px] font-bold transition-all ${nfEnabled ? "bg-sky-600/20 border-sky-500 text-sky-300" : "bg-black/30 border-[#1a2b36] text-slate-600"}`}
                >
                  NF {nfEnabled ? "ON" : "OFF"}
                </button>
              </div>
            </div>

            <div className="h-px bg-[#1a2b36]" />

            {/* RF Attenuator — reduce front-end gain to prevent ADC overload */}
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <span className="text-[9px] text-slate-500 uppercase font-bold">
                  RF Attenuator
                </span>
                <span
                  className={`font-bold text-[9px] ${rfAttn < 0 ? "text-amber-400" : "text-slate-500"}`}
                >
                  {rfAttn === 0 ? "BYPASS" : `${rfAttn} dB`}
                </span>
              </div>
              <div className="flex gap-1">
                {([0, -10, -20, -30] as number[]).map((db) => (
                  <button
                    key={db}
                    onClick={() => {
                      setRfAttn(db);
                      if (activeKiwiConfig && bridgeConnected)
                        sendAction({ action: "SET_RF_ATTN", db });
                    }}
                    className={`flex-1 py-1 rounded border text-[10px] font-bold border-[#1a2b36] transition-all ${rfAttn === db ? "bg-amber-500/20 text-amber-400 border-amber-500/40" : "bg-black/20 text-slate-500 hover:bg-black/40"}`}
                  >
                    {db}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Waterfall Display"
          icon={Sliders}
          isOpen={expandedSections.display}
          onToggle={() => toggleSection("display")}
        >
          <div className="space-y-5 pt-2">
            {/* Waterfall Colour Map — server-side palette (requires W/F stream) */}
            <div className="space-y-3">
              <span className="text-[9px] text-slate-500 uppercase font-bold">
                WF Colour Map
              </span>
              <div className="grid grid-cols-3 gap-1">
                {WF_CMAPS.map(({ label, index }) => (
                  <button
                    key={index}
                    onClick={() => {
                      setWfCmap(index);
                      if (activeKiwiConfig && bridgeConnected)
                        sendAction({ action: "SET_CMAP", index });
                    }}
                    className={`py-1 rounded border text-[9px] font-bold transition-all ${
                      wfCmap === index
                        ? "bg-emerald-600/20 border-emerald-500 text-emerald-300"
                        : "bg-black/20 border-[#1a2b36] text-slate-600 hover:text-slate-400"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-[#1a2b36]" />

            {/* Waterfall Aperture — dynamic range centering */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[9px] text-slate-500 uppercase font-bold">
                  WF Aperture
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setWfAperture(true);
                      if (activeKiwiConfig && bridgeConnected)
                        sendAction({
                          action: "SET_APERTURE",
                          auto: true,
                          algo: 0,
                          param: 0,
                        });
                    }}
                    className={`px-2 py-0.5 rounded-l border text-[9px] font-bold transition-all ${wfAperture ? "bg-cyan-600/20 border-cyan-500 text-cyan-300" : "bg-black/30 border-[#1a2b36] text-slate-600"}`}
                  >
                    AUTO
                  </button>
                  <button
                    onClick={() => {
                      setWfAperture(false);
                      if (activeKiwiConfig && bridgeConnected)
                        sendAction({
                          action: "SET_APERTURE",
                          auto: false,
                          algo: 0,
                          param: 0,
                        });
                    }}
                    className={`px-2 py-0.5 rounded-r border text-[9px] font-bold transition-all ${!wfAperture ? "bg-amber-600/20 border-amber-500 text-amber-300" : "bg-black/30 border-[#1a2b36] text-slate-600"}`}
                  >
                    MAN
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-[9px] text-slate-500 uppercase font-bold">
                  WF Baseline (Offset)
                </span>
                <span className="text-emerald-400 font-bold">{wfOffset}</span>
              </div>
              <input
                type="range"
                min={0}
                max={255}
                value={wfOffset}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setWfOffset(parseInt(e.target.value))
                }
                className="w-full h-1 accent-emerald-500 bg-[#1a2b36] rounded appearance-none cursor-pointer"
              />
            </div>

            <div className="h-px bg-[#1a2b36]" />

            {/* Waterfall Zoom */}
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <span className="text-[9px] text-slate-500 uppercase font-bold">
                  Spectral Zoom
                </span>
                <span className="text-cyan-400 font-bold">LVL {zoom}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const next = Math.max(0, zoom - 1);
                    setZoom(next);
                    sendAction({ action: "SET_ZOOM", zoom: next });
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
                    sendAction({ action: "SET_ZOOM", zoom: next });
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
            <div className="space-y-3 pb-5">
              <span className="text-[9px] text-slate-500 uppercase font-bold">
                Waterfall Cadence
              </span>
              <div className="flex gap-1">
                {(
                  [
                    ["¼", 4],
                    ["½", 2],
                    ["1×", 1],
                  ] as [string, number][]
                ).map(([label, skip]) => (
                  <button
                    key={label}
                    onClick={() => setWfSkip(skip)}
                    className={`flex-1 py-1 rounded border text-[9px] font-bold transition-all ${
                      wfSkip === skip
                        ? "bg-cyan-600/20 border-cyan-500 text-cyan-300"
                        : "bg-black/20 border-[#1a2b36] text-slate-600 hover:text-slate-400"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Global Stats Sidebar Bottom Overlay */}
        <div className="sticky bottom-0 left-0 right-0 mt-auto p-5 bg-[#0d161d]/95 backdrop-blur-md border-t border-[#1a2b36] space-y-3 z-20 shadow-[0_-10px_20px_rgba(0,0,0,0.5)]">
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-500">ENGINE</span>
            <span className="text-emerald-500/80 font-bold">KIWI_WF</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-500">BITRATE</span>
            <span className="text-slate-300 select-all">192.4 kbps</span>
          </div>
        </div>
      </div>

    </div>
  );
}
