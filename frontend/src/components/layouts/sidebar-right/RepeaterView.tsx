import { Crosshair, Radio, X } from "lucide-react";
import React from "react";
import { AnalysisWidget } from "../../widgets/AnalysisWidget";
import { TimeTracked } from "../TimeTracked";
import { BaseViewProps } from "./types";

function getHamBand(freqMhz?: number | string): string {
  const f = Number(freqMhz);
  if (!f || isNaN(f)) return "UNKNOWN";
  if (f >= 28 && f <= 29.7) return "10m";
  if (f >= 50 && f <= 54) return "6m";
  if (f >= 144 && f <= 148) return "2m";
  if (f >= 219 && f <= 225) return "1.25m";
  if (f >= 420 && f <= 450) return "70cm";
  if (f >= 902 && f <= 928) return "33cm";
  if (f >= 1240 && f <= 1300) return "23cm";
  if (f >= 162.4 && f <= 162.55) return "WX (VHF)";
  if (f >= 462 && f <= 468) return "GMRS (UHF)";
  if (f >= 136 && f <= 174) return "VHF COMMERCIAL";
  if (f >= 380 && f <= 512) return "UHF COMMERCIAL";
  if (f >= 769 && f <= 869) return "700/800 MHz";
  return "OTHER";
}

export const RepeaterView: React.FC<BaseViewProps> = ({
  entity,
  onClose,
  onCenterMap,
  onOpenAnalystPanel,
}) => {
  const detail = entity.detail || {};

  const formatFreq = (mhz?: string | number) =>
    mhz ? `${Number(mhz).toFixed(4)} MHz` : "UNKNOWN";

  const offset =
    detail.input_freq && detail.frequency
      ? Number(detail.input_freq) - Number(detail.frequency) > 0
        ? `+${(Number(detail.input_freq) - Number(detail.frequency)).toFixed(2)}`
        : (Number(detail.input_freq) - Number(detail.frequency)).toFixed(2)
      : "SIMPLEX";

  return (
    <div className="pointer-events-auto flex flex-col h-auto max-h-full overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
      {/* Header */}
      <div className="p-3 border border-b-0 border-teal-400/30 bg-gradient-to-br from-teal-400/20 to-teal-400/5 backdrop-blur-md rounded-t-sm">
        <div className="flex justify-between items-start">
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Radio size={14} className="text-teal-400 shrink-0" />
              <span className="text-[10px] font-bold tracking-[.3em] text-white/40">
                RF_INFRASTRUCTURE
              </span>
              <span className="px-1.5 py-[2px] rounded text-[9px] font-bold border border-white/20 text-white/70 bg-white/5 whitespace-nowrap mt-[-2px]">
                {getHamBand(detail.frequency as number)}
              </span>
            </div>
            <h2
              className="text-mono-xl font-bold tracking-tighter text-teal-300 drop-shadow-[0_0_8px_currentColor] mb-2 truncate"
              title={entity.callsign}
            >
              {entity.callsign}
            </h2>
            <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
              <h3 className="text-mono-sm font-bold text-white/90 tracking-[0.15em]">
                {String(detail.use || "REPEATER").toUpperCase()}
              </h3>
              <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                <div className="flex gap-2">
                  <span className="text-white/30 w-16">City:</span>
                  <span className="text-white/80">
                    {String(detail.city || "UNKNOWN")}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-white/30 w-16">State:</span>
                  <span className="text-white/80">
                    {String(detail.state || "UNKNOWN")}
                  </span>
                </div>
              </div>
            </section>
          </div>
          <button
            onClick={onClose}
            aria-label="Close details"
            title="Close details"
            className="p-1.5 hover:bg-white/10 rounded-sm text-white/30 hover:text-white transition-all group shrink-0 focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
          >
            <X size={14} className="group-hover:rotate-90 transition-transform duration-300" />
          </button>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onCenterMap?.();
            }}
            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-b from-hud-green/30 to-hud-green/10 hover:from-hud-green/40 hover:to-hud-green/20 border border-hud-green/50 py-1.5 rounded text-[10px] font-bold tracking-widest text-hud-green transition-all active:scale-[0.98]"
          >
            <Crosshair size={12} />
            CENTER_VIEW
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="overflow-y-auto min-h-0 shrink border-x border-tactical-border bg-black/30 backdrop-blur-md p-3 space-y-3 scrollbar-none font-mono">
        <section className="space-y-2">
          <h3 className="text-[10px] text-white/50 font-bold">RF_Parameters</h3>
          <div className="space-y-1 text-mono-xs font-medium">
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">BAND:</span>
              <span className="text-purple-300 font-bold">
                {getHamBand(detail.frequency as number)}
              </span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">OUTPUT:</span>
              <span className="text-teal-400 tabular-nums font-bold">
                {formatFreq(detail.frequency as number)}
              </span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">OFFSET:</span>
              <span className="text-white tabular-nums">{offset} MHz</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">CTCSS/PL:</span>
              <span className="text-amber-400 tabular-nums">
                {String(detail.ctcss || "NONE")}
              </span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">MODES:</span>
              <span
                className="text-purple-400 truncate"
                title={String(detail.modes || "FM")}
              >
                {String(detail.modes || "FM").toUpperCase()}
              </span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">STATUS:</span>
              <span
                className={`tabular-nums ${String(detail.status).toLowerCase().includes("on-air") ? "text-hud-green" : "text-slate-400"}`}
              >
                {String(detail.status || "UNKNOWN").toUpperCase()}
              </span>
            </div>
          </div>

          <div className="flex gap-4 text-mono-xs mt-3 pt-2 border-t border-white/5">
            <div className="flex gap-2">
              <span className="text-white/30">LAT:</span>
              <span className="text-white tabular-nums">
                {entity.lat.toFixed(6)}°
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-white/30">LON:</span>
              <span className="text-white tabular-nums">
                {entity.lon.toFixed(6)}°
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="p-3 border border-t-0 border-tactical-border bg-black/40 backdrop-blur-md rounded-b-sm flex flex-col gap-2">
        <div className="flex gap-2 w-full">
          <AnalysisWidget
            accentColor="text-teal-400"
            onOpenPanel={onOpenAnalystPanel}
          />
        </div>
        <div className="flex items-center justify-between text-[8px] font-mono text-white/30 pt-1 border-t border-white/5">
          <span>
            SRC: <span className="text-teal-400/70">RF_DATA</span>
          </span>
          <span>
            <TimeTracked lastSeen={entity.lastSeen} />
          </span>
        </div>
      </div>
    </div>
  );
};
