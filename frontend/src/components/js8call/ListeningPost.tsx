/**
 * ListeningPost — Live HF audio monitor with waterfall spectrum display.
 *
 * Rendered by RadioTerminal when the operator switches to LISTEN mode.
 * Requires an active KiwiSDR connection (activeKiwiConfig must be non-null)
 * and a live AnalyserNode from the useListenAudio hook.
 *
 * Layout:
 *   ┌─ audio status / enable prompt ──────────────────────────┐
 *   │  WATERFALL CANVAS (scrolling, 2 s history)             │
 *   │  ← 0 Hz ─────────────────────── 6000 Hz →             │
 *   ├─ S-METER ───────────────────────────────────────────────┤
 *   ├─ FREQUENCY CONTROLS ────────────────────────────────────┤
 *   │  [freq display]  step buttons ±1/10/100 kHz            │
 *   │  mode [USB][LSB][AM][CW][NFM]  volume slider           │
 *   ├─ BAND PRESETS ──────────────────────────────────────────┤
 *   │  [160m][80m][40m][30m][20m][17m][15m][12m][10m]       │
 *   └─────────────────────────────────────────────────────────┘
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Volume2, VolumeX, Radio, Activity, Zap } from 'lucide-react';

// ---------------------------------------------------------------------------
// Band presets for general HF listening (centre frequencies, not JS8 offsets)
// ---------------------------------------------------------------------------

const HF_BANDS = [
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
] as const;

const KIWI_MODES = ['usb', 'lsb', 'am', 'cw', 'nbfm'] as const;
type KiwiMode = typeof KIWI_MODES[number];

// ---------------------------------------------------------------------------
// S-meter conversion (IARU standard: S9 = −73 dBm, 6 dB per S-unit)
// ---------------------------------------------------------------------------

function dbmToSmeter(dbm: number): { label: string; pct: number; color: string } {
  // Map −127 dBm (S0) → 0%, −73 dBm (S9) → 54%, beyond → > 54%
  const pct = Math.min(100, Math.max(0, ((dbm + 127) / 97) * 100));
  let label: string;
  if (dbm >= -73) {
    const over = Math.round(dbm + 73);
    label = `S9+${over}`;
  } else {
    const s = Math.max(0, Math.min(9, Math.round((dbm + 127) / 6)));
    label = `S${s}`;
  }
  const color = pct > 70 ? 'bg-rose-500' : pct > 45 ? 'bg-amber-400' : 'bg-emerald-500';
  return { label, pct, color };
}

// ---------------------------------------------------------------------------
// Waterfall colour palette (value 0–255 → CSS colour string)
// Dark navy at noise floor → cyan → green → yellow → red at strong signal
// ---------------------------------------------------------------------------

function waterfallColor(value: number): [number, number, number] {
  // Hue sweeps 240° (blue) → 0° (red) as value goes 0 → 255
  // Lightness increases 8% → 55%
  const hue = 240 - value * 0.94;
  const lum = 8 + value * 0.18;
  // Approximate HSL → RGB without Math.cos/sin to keep it fast
  const h = ((hue % 360) + 360) % 360;
  const s = 1.0;
  const l = lum / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if      (h < 60)  { r = c;  g = x;  b = 0; }
  else if (h < 120) { r = x;  g = c;  b = 0; }
  else if (h < 180) { r = 0;  g = c;  b = x; }
  else if (h < 240) { r = 0;  g = x;  b = c; }
  else if (h < 300) { r = x;  g = 0;  b = c; }
  else              { r = c;  g = 0;  b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
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
// Component
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
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const rafRef     = useRef<number>(0);
  const dataRef    = useRef<Uint8Array | null>(null);

  // Local frequency mirror for snappy UI feedback before KIWI.STATUS echo arrives
  const [localFreq, setLocalFreq] = useState<number>(activeKiwiConfig?.freq ?? 14200);
  const [localMode, setLocalMode] = useState<KiwiMode>(
    (activeKiwiConfig?.mode as KiwiMode) ?? 'usb'
  );

  // Sync local state when activeKiwiConfig changes from outside (e.g. header band select)
  useEffect(() => {
    if (activeKiwiConfig) {
      setLocalFreq(activeKiwiConfig.freq);
      setLocalMode((activeKiwiConfig.mode as KiwiMode) ?? 'usb');
    }
  }, [activeKiwiConfig?.freq, activeKiwiConfig?.mode]);

  // ── Waterfall RAF loop ────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserNode) return;

    const ctx2d = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx2d) return;

    const bufLen = analyserNode.frequencyBinCount; // fftSize / 2
    const data   = new Uint8Array(bufLen);
    dataRef.current = data;

    const draw = () => {
      analyserNode.getByteFrequencyData(data);

      const w = canvas.width;
      const h = canvas.height;

      // Scroll existing content down by 1 px
      const existing = ctx2d.getImageData(0, 0, w, h - 1);
      ctx2d.putImageData(existing, 0, 1);

      // Draw new row at top
      const row = ctx2d.createImageData(w, 1);
      const pixels = row.data;
      for (let i = 0; i < w; i++) {
        // Map pixel column to FFT bin (linear mapping across 0–Nyquist)
        const bin   = Math.floor(i * bufLen / w);
        const value = data[Math.min(bin, bufLen - 1)];
        const [r, g, b] = waterfallColor(value);
        const idx = i * 4;
        pixels[idx]     = r;
        pixels[idx + 1] = g;
        pixels[idx + 2] = b;
        pixels[idx + 3] = 255;
      }
      ctx2d.putImageData(row, 0, 0);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyserNode]);

  // ── Frequency / mode dispatch helpers ────────────────────────────────────

  const tune = useCallback((freq: number, mode: KiwiMode) => {
    if (!activeKiwiConfig || !bridgeConnected) return;
    const clamped = Math.max(100, Math.min(30000, freq));
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

  const step = useCallback((delta: number) => {
    tune(localFreq + delta, localMode);
  }, [localFreq, localMode, tune]);

  const handleFreqInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) setLocalFreq(v);
  }, []);

  const handleFreqBlur = useCallback(() => {
    tune(localFreq, localMode);
  }, [localFreq, localMode, tune]);

  const handleFreqKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') tune(localFreq, localMode);
  }, [localFreq, localMode, tune]);

  // ── S-meter ───────────────────────────────────────────────────────────────

  const smeter = sMeterDbm !== null ? dbmToSmeter(sMeterDbm) : null;

  // ── Connection guard ──────────────────────────────────────────────────────

  const canControl = !!(activeKiwiConfig && bridgeConnected);

  return (
    <div className="flex flex-col h-full bg-slate-950/80 text-slate-200 font-mono text-xs overflow-hidden">

      {/* ── Audio status / enable prompt ─────────────────────────────────── */}
      <div className={`flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0 ${
        isAudioPlaying ? 'bg-emerald-950/30' : 'bg-slate-950'
      }`}>
        <div className="flex items-center gap-2">
          <Radio className={`w-3.5 h-3.5 ${isAudioPlaying ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
          <span className="text-slate-400 uppercase tracking-widest text-[10px]">Listening Post</span>
          {isConnected && (
            <span className="ml-2 text-[10px] text-slate-600">
              ● {activeKiwiConfig
                  ? `${activeKiwiConfig.host} — ${localFreq.toLocaleString()} kHz ${localMode.toUpperCase()}`
                  : 'No SDR connected'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isAudioPlaying && (
            <span className="text-emerald-400 text-[10px] tracking-wider uppercase animate-pulse">
              ▶ RX
            </span>
          )}
          {!audioEnabled && (
            <button
              onClick={enableAudio}
              className="flex items-center gap-1.5 px-3 py-1 text-[10px] bg-indigo-600/80 hover:bg-indigo-500/80 border border-indigo-500/50 rounded-md text-white uppercase tracking-wider transition-all"
            >
              <Zap className="w-3 h-3" />
              Enable Audio
            </button>
          )}
          {!isConnected && audioEnabled && (
            <span className="text-amber-400/70 text-[10px] tracking-wider uppercase">Waiting for SDR…</span>
          )}
        </div>
      </div>

      {/* ── Waterfall canvas ─────────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-0 bg-black overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ imageRendering: 'pixelated' }}
          // Dimensions set in CSS; actual resolution via width/height attributes
          width={1024}
          height={512}
        />
        {/* Frequency axis labels overlay */}
        <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1 py-0.5 pointer-events-none">
          {['0', '1k', '2k', '3k', '4k', '5k', '6k'].map((lbl) => (
            <span key={lbl} className="text-[9px] text-slate-600/70 font-mono">{lbl}</span>
          ))}
        </div>
        {/* No-signal overlay */}
        {!analyserNode && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <Activity className="w-8 h-8 text-slate-700" />
            <p className="text-slate-600 text-xs tracking-wider uppercase">
              {!audioEnabled ? 'Click "Enable Audio" to start' : 'Waiting for audio stream…'}
            </p>
          </div>
        )}
      </div>

      {/* ── S-meter ─────────────────────────────────────────────────────── */}
      <div className="px-4 py-2 border-t border-white/10 bg-slate-950/60 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-slate-500 uppercase tracking-widest text-[9px] w-12">S-METER</span>
          <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
            {smeter ? (
              <div
                className={`h-full rounded-full transition-all duration-300 ${smeter.color}`}
                style={{ width: `${smeter.pct}%` }}
              />
            ) : (
              <div className="h-full w-0" />
            )}
          </div>
          {/* S-unit scale ticks */}
          <div className="hidden sm:flex items-center gap-0.5 text-[8px] text-slate-700 select-none">
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <span key={n} className="w-4 text-center">{n}</span>
            ))}
            <span className="w-8 text-center text-[8px]">+</span>
          </div>
          <span className={`text-[11px] font-semibold w-14 text-right tabular-nums ${
            smeter ? (smeter.pct > 70 ? 'text-rose-400' : smeter.pct > 45 ? 'text-amber-400' : 'text-emerald-400')
                   : 'text-slate-600'
          }`}>
            {smeter ? smeter.label : '–'}
          </span>
          <span className="text-slate-600 text-[10px] w-20 text-right tabular-nums">
            {sMeterDbm !== null ? `${sMeterDbm.toFixed(1)} dBm` : '--'}
          </span>
        </div>
      </div>

      {/* ── Frequency + mode controls ────────────────────────────────────── */}
      <div className="px-4 py-2.5 border-t border-white/10 bg-slate-950/80 shrink-0 space-y-2">
        {/* Row 1: frequency display + step buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-500 text-[9px] uppercase tracking-widest w-8">FREQ</span>
          <input
            type="number"
            value={localFreq}
            onChange={handleFreqInput}
            onBlur={handleFreqBlur}
            onKeyDown={handleFreqKey}
            disabled={!canControl}
            className="w-24 bg-black/60 border border-white/10 text-emerald-300 font-semibold rounded px-2 py-0.5 text-xs text-center focus:border-emerald-500/60 outline-none appearance-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-40"
          />
          <span className="text-slate-600 text-[10px]">kHz</span>

          {/* Step buttons */}
          <div className="flex gap-0.5">
            {([-100, -10, -1, 1, 10, 100] as const).map((delta) => (
              <button
                key={delta}
                onClick={() => step(delta)}
                disabled={!canControl}
                className="px-1.5 py-0.5 text-[10px] bg-slate-800 hover:bg-slate-700 border border-white/10 rounded font-mono text-slate-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {delta > 0 ? `+${delta}` : `${delta}`}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: mode selector + volume */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-slate-500 text-[9px] uppercase tracking-widest w-8">MODE</span>
          <div className="flex gap-0.5">
            {KIWI_MODES.map((m) => (
              <button
                key={m}
                onClick={() => tune(localFreq, m)}
                disabled={!canControl}
                className={`px-2 py-0.5 text-[10px] border rounded uppercase font-semibold tracking-wider transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                  localMode === m
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-800/60 border-white/10 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                }`}
              >
                {m === 'nbfm' ? 'NFM' : m.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Volume control */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => onVolumeChange(volume === 0 ? 0.8 : 0)}
              className="text-slate-500 hover:text-slate-300 transition-colors"
              title={volume === 0 ? 'Unmute' : 'Mute'}
            >
              {volume === 0
                ? <VolumeX className="w-3.5 h-3.5" />
                : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-20 h-1 accent-indigo-500 cursor-pointer"
              title={`Volume: ${Math.round(volume * 100)}%`}
            />
            <span className="text-slate-600 text-[10px] w-8 text-right tabular-nums">
              {Math.round(volume * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* ── Band presets ─────────────────────────────────────────────────── */}
      <div className="px-4 py-2 border-t border-white/10 bg-slate-950/60 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-500 text-[9px] uppercase tracking-widest w-8">BAND</span>
          <div className="flex gap-1 flex-wrap">
            {HF_BANDS.map(({ label, freq }) => {
              const active = activeKiwiConfig
                ? Math.abs(activeKiwiConfig.freq - freq) < 200
                : false;
              return (
                <button
                  key={label}
                  onClick={() => tune(freq, localMode)}
                  disabled={!canControl}
                  title={`${freq.toLocaleString()} kHz`}
                  className={`px-2 py-0.5 text-[10px] border rounded font-semibold tracking-wider transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                    active
                      ? 'bg-emerald-600/80 border-emerald-500/60 text-white'
                      : 'bg-slate-800/40 border-white/10 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
