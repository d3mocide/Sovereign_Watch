import { Crosshair, Radio, X } from "lucide-react";
import React from "react";
import { AnalysisWidget } from "../../widgets/AnalysisWidget";
import { TimeTracked } from "../TimeTracked";
import { BaseViewProps, InfraDetail } from "./types";

export const TowerView: React.FC<BaseViewProps> = ({
  entity,
  onClose,
  onCenterMap,
  onOpenAnalystPanel,
}) => {
  const detail = (entity.detail || {}) as InfraDetail;
  const props = detail.properties || {};

  return (
    <div className="pointer-events-auto flex flex-col h-auto max-h-full overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
      {/* Header */}
      <div className="p-3 border border-b-0 border-orange-400/30 bg-gradient-to-br from-orange-400/20 to-orange-400/5 backdrop-blur-md rounded-t-sm">
        <div className="flex justify-between items-start">
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Radio size={14} className="text-orange-400 shrink-0" />
              <span className="text-[10px] font-bold tracking-[.3em] text-white/40">
                FCC_INFRASTRUCTURE
              </span>
            </div>
            <h2
              className="text-mono-xl font-bold tracking-tighter text-orange-300 drop-shadow-[0_0_8px_currentColor] mb-2 truncate"
              title={entity.callsign}
            >
              {entity.callsign}
            </h2>
            <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
              <h3 className="text-mono-sm font-bold text-white/90">
                COMMUNICATIONS TOWER
              </h3>
              <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                <div className="flex gap-2">
                  <span className="text-white/30 w-16">FCC ID:</span>
                  <span className="text-white/80">
                    {String(props.fcc_id || "UNKNOWN")}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-white/30 w-16">Type:</span>
                  <span className="text-white/80 uppercase">
                    {String(props.tower_type || "COMMERCIAL")}
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
            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-b from-orange-400/30 to-orange-400/10 hover:from-orange-400/40 hover:to-orange-400/20 border border-orange-400/50 py-1.5 rounded text-[10px] font-bold tracking-widest text-orange-400 transition-all active:scale-[0.98]"
          >
            <Crosshair size={12} />
            CENTER_VIEW
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="overflow-y-auto min-h-0 shrink border-x border-tactical-border bg-black/30 backdrop-blur-md p-3 space-y-3 scrollbar-none font-mono">
        <section className="space-y-2">
          <h3 className="text-[10px] text-white/50 font-bold uppercase tracking-wider">
            Tower_Specs
          </h3>
          <div className="space-y-1 text-mono-xs font-medium">
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">STATUS:</span>
              <span className="text-hud-green tabular-nums font-bold uppercase">
                {String(props.status || "ACTIVE")}
              </span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">HEIGHT:</span>
              <span className="text-orange-400 tabular-nums font-bold">
                {props.height_m != null
                  ? `${Number(props.height_m).toLocaleString()} m`
                  : "N/A"}
              </span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">ELEVATION:</span>
              <span className="text-white tabular-nums">
                {props.elevation_m != null
                  ? `${Number(props.elevation_m).toLocaleString()} m`
                  : "N/A"}
              </span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">OWNER:</span>
              <span
                className="text-amber-400 truncate"
                title={String(props.owner || "UNKNOWN")}
              >
                {String(props.owner || "UNKNOWN")}
              </span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">ID:</span>
              <span className="text-white/50">{props.id || "N/A"}</span>
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
            accentColor="text-orange-400"
            onOpenPanel={onOpenAnalystPanel}
          />
        </div>
        <div className="flex items-center justify-between text-[8px] font-mono text-white/30 pt-1 border-t border-white/5">
          <span>
            SRC: <span className="text-orange-400/70">FCC_Tower_DB</span>
          </span>
          <span>
            <TimeTracked lastSeen={entity.lastSeen} />
          </span>
        </div>
      </div>
    </div>
  );
};
