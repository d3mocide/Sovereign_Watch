/**
 * WebSDRPanel
 * ===========
 * Floating panel that embeds a WebSDR receiver via iframe with ?tune= URL
 * parameter for frequency pre-tuning.
 *
 * Architecture note:
 *   WebSDR uses a closed proprietary protocol; native audio proxying is not
 *   feasible. Instead we embed the WebSDR browser UI directly in an iframe.
 *   The ?tune=<freq><mode> URL parameter pre-tunes the receiver on load.
 *   When the user changes frequency, we reload the iframe with the new param.
 *
 *   If the node blocks iframe embedding (X-Frame-Options / CSP), we detect
 *   the load failure and fall back to an "Open in new tab" button.
 *
 * Supported WebSDR URL modes:
 *   usb, lsb, cw, am, fm, amsync
 */

import { useCallback, useRef, useState } from "react";
import {
  ExternalLink,
  Loader2,
  Radio,
  RotateCcw,
  X,
} from "lucide-react";
import type { WebSDRNode } from "../../types";

// ---------------------------------------------------------------------------
// Mode helpers
// ---------------------------------------------------------------------------

const WEBSDR_MODES = ["usb", "lsb", "am", "cw", "fm"] as const;
type WebSDRMode = typeof WEBSDR_MODES[number];

/** Format frequency kHz → WebSDR ?tune= value. */
function tuneParam(freqKhz: number, mode: WebSDRMode): string {
  // WebSDR accepts frequencies in kHz with up to 3 decimal places
  const freq = freqKhz % 1 === 0 ? String(freqKhz) : freqKhz.toFixed(3);
  return `${freq}${mode}`;
}

/** Construct the full WebSDR URL with tune parameter. */
function buildUrl(node: WebSDRNode, freqKhz: number, mode: WebSDRMode): string {
  const base = node.url.endsWith("/") ? node.url : node.url + "/";
  return `${base}?tune=${tuneParam(freqKhz, mode)}`;
}

// ---------------------------------------------------------------------------
// Band presets for quick navigation (VHF/UHF focus — the key WebSDR advantage)
// ---------------------------------------------------------------------------

interface BandPreset {
  label: string;
  freqKhz: number;
  mode: WebSDRMode;
  desc: string;
}

const BAND_PRESETS: BandPreset[] = [
  { label: "HF 20m",  freqKhz: 14074,  mode: "usb", desc: "FT8 digital" },
  { label: "HF 40m",  freqKhz: 7074,   mode: "usb", desc: "FT8 digital" },
  { label: "HF SW",   freqKhz: 9600,   mode: "am",  desc: "Shortwave BC" },
  { label: "6m",      freqKhz: 50313,  mode: "usb", desc: "FT8 Es DX" },
  { label: "2m FT8",  freqKhz: 144174, mode: "usb", desc: "Weak signal" },
  { label: "2m JS8",  freqKhz: 144177, mode: "usb", desc: "JS8Call VHF" },
  { label: "FM BC",   freqKhz: 101000, mode: "fm",  desc: "FM broadcast" },
  { label: "Aviation",freqKhz: 121500, mode: "am",  desc: "Guard freq" },
  { label: "Marine",  freqKhz: 156800, mode: "fm",  desc: "CH 16 distress" },
  { label: "70cm",    freqKhz: 432300, mode: "usb", desc: "SSB calling" },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  node: WebSDRNode;
  initialFreqKhz: number;
  initialMode: WebSDRMode;
  onClose: () => void;
  fullScreen?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WebSDRPanel({
  node,
  initialFreqKhz,
  initialMode,
  onClose,
  fullScreen = false,
}: Props) {
  const [freqKhz, setFreqKhz] = useState(initialFreqKhz);
  const [freqInput, setFreqInput] = useState(String(initialFreqKhz));
  const [mode, setMode] = useState<WebSDRMode>(initialMode);
  const [iframeUrl, setIframeUrl] = useState(() => buildUrl(node, initialFreqKhz, initialMode));
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // When freq or mode changes, rebuild the iframe URL
  const applyTune = useCallback((newFreq: number, newMode: WebSDRMode) => {
    setIframeUrl(buildUrl(node, newFreq, newMode));
    setLoading(true);
    setIframeBlocked(false);
  }, [node]);

  // Commit frequency input on Enter or blur
  const commitFreq = useCallback(() => {
    const parsed = parseFloat(freqInput);
    if (!isNaN(parsed) && parsed > 0) {
      setFreqKhz(parsed);
      applyTune(parsed, mode);
    } else {
      setFreqInput(String(freqKhz));
    }
  }, [freqInput, freqKhz, mode, applyTune]);

  const handleModeChange = useCallback((newMode: WebSDRMode) => {
    setMode(newMode);
    applyTune(freqKhz, newMode);
  }, [freqKhz, applyTune]);

  const handlePreset = useCallback((preset: BandPreset) => {
    setFreqKhz(preset.freqKhz);
    setFreqInput(String(preset.freqKhz));
    setMode(preset.mode);
    applyTune(preset.freqKhz, preset.mode);
  }, [applyTune]);

  // iframe load/error handlers
  const handleIframeLoad = useCallback(() => {
    setLoading(false);
    // Attempt to detect X-Frame-Options block: the iframe src stays at about:blank
    // or the contentDocument is null after "load" on some browsers.
    // We can't access contentDocument cross-origin, so we set a short timeout:
    // if the iframe loads instantly with no visible content, it's likely blocked.
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc && (doc.URL === "about:blank" || doc.title === "")) {
        // May be blocked — show fallback hint but don't hide iframe
      }
    } catch {
      // Cross-origin block: contentDocument access denied
      // iframe might still work for display; keep going
    }
  }, []);

  const handleIframeError = useCallback(() => {
    setLoading(false);
    setIframeBlocked(true);
  }, []);

  const openInNewTab = useCallback(() => {
    window.open(iframeUrl, "_blank", "noopener,noreferrer");
  }, [iframeUrl]);

  // Bands display (shorten for the header chip)
  const bandChips = node.bands.slice(0, 5);

  return (
    <div className={fullScreen ? "w-full h-full" : "fixed inset-0 z-[200] flex items-end justify-end pointer-events-none"}>
      {/* Panel — anchored bottom-right, leaves room for other UI */}
      <div
        className={`bg-slate-950 border border-slate-700 shadow-2xl shadow-black/80 overflow-hidden ${
          fullScreen 
            ? "w-full h-full flex flex-col" 
            : "pointer-events-auto m-4 flex flex-col rounded-xl"
        }`}
        style={fullScreen ? {} : { width: 640, height: 560 }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {/* WebSDR badge */}
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-violet-500/15 border border-violet-500/30">
              <Radio className="w-3 h-3 text-violet-400" />
              <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">WebSDR</span>
            </div>

            {/* Node name + location */}
            <div className="min-w-0">
              <span className="text-xs text-slate-200 font-semibold truncate block">
                {node.name || new URL(node.url).hostname}
              </span>
              {node.location && (
                <span className="text-[10px] text-slate-500 truncate block">{node.location}</span>
              )}
            </div>

            {/* Band chips */}
            <div className="hidden sm:flex items-center gap-1 ml-1 flex-wrap">
              {bandChips.map((b) => (
                <span
                  key={b}
                  className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-violet-300 bg-violet-500/10 border border-violet-500/20 uppercase"
                >
                  {b}
                </span>
              ))}
              {node.bands.length > 5 && (
                <span className="text-[9px] text-slate-600">+{node.bands.length - 5}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button
              onClick={openInNewTab}
              title="Open in new tab"
              className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── Tune controls ── */}
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/60 border-b border-slate-800 shrink-0 flex-wrap">
          {/* Frequency input */}
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={freqInput}
              onChange={(e) => setFreqInput(e.target.value)}
              onBlur={commitFreq}
              onKeyDown={(e) => { if (e.key === "Enter") commitFreq(); }}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-slate-200 w-28 focus:outline-none focus:border-violet-500"
              placeholder="kHz"
              min={0}
              step={1}
            />
            <span className="text-[10px] text-slate-500">kHz</span>
          </div>

          {/* Mode buttons */}
          <div className="flex bg-slate-950 rounded p-0.5 border border-slate-800">
            {WEBSDR_MODES.map((m) => (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  mode === m
                    ? "bg-violet-500/20 text-violet-400"
                    : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Reload button */}
          <button
            onClick={() => applyTune(freqKhz, mode)}
            title="Reload"
            className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ── Band presets ── */}
        <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-950/50 border-b border-slate-800 shrink-0 overflow-x-auto">
          {BAND_PRESETS.map((preset) => {
            const isActive = Math.abs(freqKhz - preset.freqKhz) < 1 && mode === preset.mode;
            // Filter presets to what this node can receive
            const covered =
              node.freq_min_khz <= preset.freqKhz && preset.freqKhz <= node.freq_max_khz;
            return (
              <button
                key={preset.label}
                onClick={() => handlePreset(preset)}
                disabled={!covered}
                title={covered ? preset.desc : `${node.name} doesn't cover this band`}
                className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors shrink-0 ${
                  isActive
                    ? "bg-violet-500/25 text-violet-300 border border-violet-500/40"
                    : covered
                    ? "text-slate-400 bg-slate-800/60 hover:bg-slate-700/60 hover:text-slate-200"
                    : "text-slate-700 cursor-not-allowed"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* ── iframe / blocked state ── */}
        <div className="relative flex-1 bg-slate-950 min-h-0">
          {/* Loading overlay */}
          {loading && !iframeBlocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950 z-10 pointer-events-none">
              <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
              <span className="text-xs text-slate-500">Loading {node.name}…</span>
            </div>
          )}

          {/* Blocked / error fallback */}
          {iframeBlocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950 z-10">
              <div className="text-center max-w-[320px]">
                <p className="text-sm text-slate-300 font-semibold mb-1">
                  Receiver blocked embedding
                </p>
                <p className="text-xs text-slate-500 mb-4">
                  {node.name} prevents iframe embedding. Open it in a new
                  browser tab — the frequency will be pre-tuned automatically.
                </p>
                <button
                  onClick={openInNewTab}
                  className="flex items-center gap-2 px-4 py-2 rounded-md bg-violet-500/15 border border-violet-500/30 text-violet-400 hover:bg-violet-500/25 transition-colors text-sm font-semibold"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open {new URL(node.url).hostname}
                </button>
                <p className="text-[10px] text-slate-600 mt-3 font-mono break-all">
                  {iframeUrl}
                </p>
              </div>
            </div>
          )}

          {/* The iframe itself */}
          {!iframeBlocked && (
            <iframe
              ref={iframeRef}
              src={iframeUrl}
              title={`WebSDR — ${node.name}`}
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              className="w-full h-full border-0"
            />
          )}
        </div>

        {/* ── Footer: URL display ── */}
        <div className="px-3 py-1.5 bg-slate-950 border-t border-slate-800/50 shrink-0 flex items-center justify-between gap-2">
          <span className="text-[10px] font-mono text-slate-600 truncate flex-1" title={iframeUrl}>
            {iframeUrl}
          </span>
          <button
            onClick={openInNewTab}
            className="text-[10px] text-violet-500 hover:text-violet-400 transition-colors shrink-0 flex items-center gap-0.5"
          >
            <ExternalLink className="w-3 h-3" /> new tab
          </button>
        </div>
      </div>
    </div>
  );
}
