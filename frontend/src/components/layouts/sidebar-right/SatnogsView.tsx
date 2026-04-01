import { Crosshair, Radio, Satellite, X } from "lucide-react";
import React from "react";
import { AnalysisWidget } from "../../widgets/AnalysisWidget";
import { TimeTracked } from "../TimeTracked";
import { BaseViewProps } from "./types";

export const SatnogsView: React.FC<BaseViewProps> = ({
  entity,
  onClose,
  onCenterMap,
  onOpenAnalystPanel,
}) => {
  const detail = (entity.detail || {}) as Record<string, unknown>;
  const status = String(detail.status || "unknown").toUpperCase();
  const satnogsId = String(detail.satnogs_id || "N/A");
  const altitudeM = Number(detail.altitude_m ?? entity.altitude ?? 0);

  return (
    <div className="pointer-events-auto flex flex-col h-auto max-h-full overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
      <div className="p-3 border border-b-0 border-teal-300/30 bg-gradient-to-br from-teal-300/15 to-teal-300/5 backdrop-blur-md rounded-t-sm">
        <div className="flex justify-between items-start">
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Satellite size={14} className="text-teal-300" />
              <span className="text-[10px] font-bold tracking-[.3em] text-white/40">SATNOGS_GROUND</span>
            </div>
            <h2 className="text-mono-xl font-bold tracking-tighter text-teal-300 drop-shadow-[0_0_8px_rgba(45,212,191,0.8)] mb-2 truncate" title={entity.callsign}>
              {entity.callsign}
            </h2>
            <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
              <h3 className="text-mono-sm font-bold text-white/90">GROUND_STATION</h3>
              <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                <div className="flex gap-2">
                  <span className="text-white/30 w-16">Node ID:</span>
                  <span className="text-white/80">{satnogsId}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-white/30 w-16">Status:</span>
                  <span className="text-hud-green">{status}</span>
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
            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-b from-teal-300/30 to-teal-300/10 border border-teal-300/50 text-teal-300 hover:brightness-110 py-1.5 rounded text-[10px] font-bold tracking-widest transition-all active:scale-[0.98]"
          >
            <Crosshair size={12} />
            CENTER_VIEW
          </button>
        </div>
      </div>

      <div className="overflow-y-auto min-h-0 shrink border-x border-tactical-border bg-black/30 backdrop-blur-md p-3 space-y-3 scrollbar-none font-mono">
        <section className="space-y-2">
          <h3 className="text-[10px] text-white/50 font-bold uppercase tracking-wider">
            Station_Details
          </h3>
          <div className="space-y-1 text-mono-xs font-medium">
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">LATITUDE:</span>
              <span className="text-white tabular-nums">{entity.lat.toFixed(5)}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">LONGITUDE:</span>
              <span className="text-white tabular-nums">{entity.lon.toFixed(5)}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">ALTITUDE:</span>
              <span className="text-teal-300 tabular-nums">{Math.round(altitudeM).toLocaleString()} m</span>
            </div>
          </div>
        </section>
      </div>

      <div className="border border-t-0 border-teal-300/30 bg-black/50 backdrop-blur-md p-3 rounded-b-sm space-y-3">
        <AnalysisWidget
          accentColor="text-teal-300"
          onOpenPanel={onOpenAnalystPanel}
        />

        <section className="space-y-2">
          <h3 className="text-[10px] text-white/50 font-bold uppercase tracking-wider">Tracking_Status</h3>
          <div className="flex items-center gap-2 text-teal-300 text-[10px]">
            <Radio size={12} />
            <span className="font-bold uppercase">SatNOGS node available for RF correlation</span>
          </div>
        </section>

        <TimeTracked lastSeen={entity.lastSeen} />
      </div>
    </div>
  );
};

export default SatnogsView;
