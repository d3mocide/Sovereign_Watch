import {
  Shield,
  Crosshair,
  X,
  Globe,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import React from "react";
import { AnalysisWidget } from "../../widgets/AnalysisWidget";
import { TimeTracked } from "../TimeTracked";
import { AirspaceDetail, BaseViewProps } from "./types";

export const AirspaceView: React.FC<BaseViewProps> = ({
  entity,
  onClose,
  onCenterMap,
  onOpenAnalystPanel,
}) => {
  const detail = (entity.detail as unknown as AirspaceDetail) || {};
  const props = detail.properties || ({} as any);

  const type = props.type || "UNKNOWN";
  
  // tactical color mapping for sidebar elements
  const accentColor = 
    type === "PROHIBITED" ? "text-rose-400" :
    type === "RESTRICTED" ? "text-orange-400" :
    type === "DANGER"     ? "text-yellow-400" :
    type === "WARNING"    ? "text-amber-400" :
    type === "TRA"        ? "text-violet-400" :
    type === "TSA"        ? "text-fuchsia-400" :
    type === "ADIZ"       ? "text-cyan-400" :
    type === "CTR" || type === "TMA" || type === "CONTROL" || type === "CLASS" ? "text-blue-400" :
    type === "FIR"        ? "text-indigo-400" :
    type === "FIS" || type === "VFR" ? "text-emerald-400" :
    "text-slate-400";

  const accentBorder = 
    type === "PROHIBITED" ? "border-rose-400/30" :
    type === "RESTRICTED" ? "border-orange-400/30" :
    type === "DANGER"     ? "border-yellow-400/30" :
    type === "WARNING" || type === "CAUTION" ? "border-amber-400/30" :
    type === "TRA"        ? "border-violet-400/30" :
    type === "TSA"        ? "border-fuchsia-400/30" :
    type === "ADIZ"       ? "border-cyan-400/30" :
    type === "CTR" || type === "TMA" || type === "CONTROL" || type === "CLASS" ? "border-blue-400/30" :
    "border-slate-400/30";

  const accentBg = 
    type === "PROHIBITED" ? "from-rose-400/20 to-rose-400/5" :
    type === "RESTRICTED" ? "from-orange-400/20 to-orange-400/5" :
    type === "DANGER"     ? "from-yellow-400/20 to-yellow-400/5" :
    type === "WARNING" || type === "CAUTION" ? "from-amber-400/20 to-amber-400/5" :
    type === "TRA"        ? "from-violet-400/20 to-violet-400/5" :
    type === "TSA"        ? "from-fuchsia-400/20 to-fuchsia-400/5" :
    type === "ADIZ"       ? "from-cyan-400/20 to-cyan-400/5" :
    type === "CTR" || type === "TMA" || type === "CONTROL" || type === "CLASS" ? "from-blue-400/20 to-blue-400/5" :
    "from-slate-400/20 to-slate-400/5";

  const accentGlow = 
    type === "PROHIBITED" ? "text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]" :
    type === "RESTRICTED" ? "text-orange-300 drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]" :
    type === "DANGER"     ? "text-yellow-300 drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]" :
    "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]";

  return (
    <div className="pointer-events-auto flex flex-col h-auto max-h-full overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
      {/* Header */}
      <div
        className={`p-3 border border-b-0 ${accentBorder} bg-gradient-to-br ${accentBg} backdrop-blur-md rounded-t-sm`}
      >
        <div className="flex justify-between items-start">
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Shield size={14} className={accentColor} />
              <span className="text-[10px] font-bold tracking-[.3em] text-white/40">
                AIRSPACE_ZONE
              </span>
            </div>
            <h2
              className={`text-mono-xl font-bold tracking-tighter ${accentGlow} mb-2 truncate`}
              title={props.name}
            >
              {props.name}
            </h2>
            <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
              <h3 className={`text-mono-sm font-bold ${accentColor}`}>
                TYPE: {type}
              </h3>
              <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                <div className="flex gap-2">
                  <span className="text-white/30 w-16">ICAO:</span>
                  <span className="text-white/80">{props.icao_class || "N/A"}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-white/30 w-16">Country:</span>
                  <span className="text-white/80">{props.country || "Global"}</span>
                </div>
              </div>
            </section>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-sm text-white/30 hover:text-white transition-all group shrink-0 outline-none"
          >
            <X size={14} className="group-hover:rotate-90 transition-transform duration-300" />
          </button>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCenterMap?.();
            }}
            className={`flex-1 flex items-center justify-center gap-2 bg-gradient-to-b ${accentBg} border ${accentBorder} ${accentColor} hover:brightness-110 py-1.5 rounded text-[10px] font-bold tracking-widest transition-all active:scale-[0.98]`}
          >
            <Crosshair size={12} />
            CENTER_VIEW
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="overflow-y-auto min-h-0 shrink border-x border-tactical-border bg-black/30 backdrop-blur-md p-3 space-y-3 scrollbar-none font-mono">
        {/* Vertical Limits */}
        <section className="space-y-2">
          <h3 className="text-[10px] text-white/50 font-bold uppercase tracking-wider">
            Vertical_Limits
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/5 p-2 border border-white/10 rounded">
              <div className="flex items-center gap-2 text-[8px] text-white/30 mb-1">
                <ArrowUp size={10} /> UPPER
              </div>
              <div className="text-[14px] font-bold text-white/90">
                {props.upper_limit || "UNLIMITED"}
              </div>
            </div>
            <div className="bg-white/5 p-2 border border-white/10 rounded">
              <div className="flex items-center gap-2 text-[8px] text-white/30 mb-1">
                <ArrowDown size={10} /> LOWER
              </div>
              <div className="text-[14px] font-bold text-white/90">
                {props.lower_limit || "GND"}
              </div>
            </div>
          </div>
        </section>

        {/* Metadata */}
        <section className="space-y-2">
          <h3 className="text-[10px] text-white/50 font-bold uppercase tracking-wider">
            Metadata
          </h3>
          <div className="space-y-1 text-mono-xs font-medium bg-white/5 p-2 border border-white/10 rounded">
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">ZONE_ID:</span>
              <span className="text-white/60 truncate">{props.zone_id}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">ICAO_CLASS:</span>
              <span className="text-white/80">{props.icao_class || "N/A"}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2">
              <span className="text-white/30">SOURCE:</span>
              <span className="text-hud-green">OpenAIP_Core</span>
            </div>
          </div>
        </section>

        {/* Tactical Reference */}
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
      </div>

      {/* Footer */}
      <div className="p-3 border border-t-0 border-tactical-border bg-black/40 backdrop-blur-md rounded-b-sm flex flex-col gap-2">
        <div className="flex gap-2 w-full">
          <AnalysisWidget
            accentColor={accentColor}
            onOpenPanel={onOpenAnalystPanel}
          />
        </div>
        <div className="flex items-center justify-between text-[8px] font-mono text-white/30 pt-1 border-t border-white/5">
          <div className="flex items-center gap-2">
            <Globe size={10} className="text-cyan-400/50" />
            <span>Tactical Airspace Overlay</span>
          </div>
          <span>
            <TimeTracked lastSeen={entity.lastSeen} />
          </span>
        </div>
      </div>
    </div>
  );
};
