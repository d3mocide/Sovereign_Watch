import { Crosshair, Radio, X } from "lucide-react";
import React from "react";
import { AnalysisWidget } from "../../widgets/AnalysisWidget";
import { Compass } from "../../widgets/Compass";
import { TimeTracked } from "../TimeTracked";
import { BaseViewProps } from "./types";

export const JS8View: React.FC<BaseViewProps> = ({
  entity,
  onClose,
  onCenterMap,
  onOpenAnalystPanel,
}) => {
  const snr = entity.detail?.snr as number | undefined;
  const grid = entity.detail?.grid as string | undefined;
  const distKm = entity.detail?.distance_km as number | undefined;
  const bearingDeg = entity.detail?.bearing_deg as number | undefined;
  const freq = entity.detail?.freq as number | undefined;

  function snrClass(v: number | undefined): string {
    if (v == null) return "text-white/40";
    if (v >= -10) return "text-emerald-400";
    if (v >= -18) return "text-yellow-400";
    return "text-red-400";
  }

  return (
    <div className="pointer-events-auto flex flex-col h-auto max-h-full overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
      {/* Header */}
      <div className="p-3 border border-b-0 border-indigo-400/30 bg-gradient-to-br from-indigo-400/20 to-indigo-400/5 backdrop-blur-md rounded-t-sm">
        <div className="flex justify-between items-start">
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Radio size={14} className="text-indigo-400 shrink-0" />
              <span className="text-[10px] font-bold tracking-[.3em] text-white/40">
                HF_RADIO_CONTACT
              </span>
            </div>
            <h2 className="text-mono-xl font-bold tracking-tighter text-indigo-300 drop-shadow-[0_0_8px_currentColor] mb-2">
              {entity.callsign}
            </h2>
            <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
              <h3 className="text-mono-sm font-bold text-white/90">
                JS8CALL STATION
              </h3>
              <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                <div className="flex gap-2">
                  <span className="text-white/30 w-16">Grid:</span>
                  <span className="text-white/80">{grid || "UNKNOWN"}</span>
                </div>
                {freq != null && (
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">Freq:</span>
                    <span className="text-white/80">
                      {(freq / 1000).toFixed(3)} kHz
                    </span>
                  </div>
                )}
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
        <div className="flex gap-2">
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
          <h3 className="text-[10px] text-white/50 font-bold">Signal_Data</h3>
          <div className="space-y-1 text-mono-xs font-medium">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-white/30">SNR:</span>
                <span className={`tabular-nums font-bold ${snrClass(snr)}`}>
                  {snr != null ? `${snr > 0 ? "+" : ""}${snr} dB` : "---"}
                </span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-white/30">BRG:</span>
                <span className="text-white tabular-nums">
                  {bearingDeg != null ? `${Math.round(bearingDeg)}°` : "---"}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-white/30">DIST:</span>
                <span className="text-white tabular-nums">
                  {distKm != null ? `${distKm} km` : "---"}
                </span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-white/30">GRID:</span>
                <span className="text-white tabular-nums">
                  {grid || "---"}
                </span>
              </div>
            </div>
          </div>
          <div className="pt-1 flex justify-center opacity-80">
            <Compass
              heading={bearingDeg ?? 0}
              size={180}
              accentColor="indigo-400"
            />
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="p-3 border border-t-0 border-tactical-border bg-black/40 backdrop-blur-md rounded-b-sm flex flex-col gap-2">
        <div className="flex gap-2 w-full">
          <AnalysisWidget
            accentColor="text-indigo-400"
            onOpenPanel={onOpenAnalystPanel}
          />
        </div>
        <div className="flex items-center justify-between text-[8px] font-mono text-white/30 pt-1 border-t border-white/5">
          <span>
            SIG: <span className="text-hud-green/70">JS8CALL_HF</span>
          </span>
          <span>
            <TimeTracked lastSeen={entity.lastSeen} />
          </span>
        </div>
      </div>
    </div>
  );
};
