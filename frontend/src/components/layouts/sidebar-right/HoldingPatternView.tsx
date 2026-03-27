import { Crosshair, Map as MapIcon, Shield, Activity, Target, X } from "lucide-react";
import React, { useState } from "react";
import { AnalysisWidget } from "../../widgets/AnalysisWidget";
import { TrackHistoryPanel } from "../../widgets/TrackHistoryPanel";
import { AircraftViewProps } from "./types";

export const HoldingPatternView: React.FC<AircraftViewProps> = ({
  entity,
  onClose,
  onCenterMap,
  onOpenAnalystPanel,
  onHistoryLoaded,
}) => {
  const [showHistory, setShowHistory] = useState(false);
  const p = (entity.detail ?? {}) as any;

  return (
    <div className="pointer-events-auto flex flex-col h-auto max-h-full overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
      {/* Header */}
      <div className="p-3 border border-b-0 border-amber-500/30 shadow-[inset_0_1px_1px_rgba(255,140,0,0.1)] bg-gradient-to-br from-amber-500/20 to-amber-500/5 backdrop-blur-md rounded-t-sm relative">
        <div className="relative z-10 flex justify-between items-start gap-2">
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Shield size={14} className="text-amber-500" />
              <span className="text-[10px] font-bold tracking-[.3em] text-white/40 uppercase">
                Holding Pattern Active
              </span>
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wider bg-amber-500/20 text-amber-500 border border-amber-500/30 uppercase">
                RESTRICTED
              </span>
            </div>
            <h2 className="text-mono-xl font-bold tracking-tighter text-amber-500 drop-shadow-[0_0_8px_currentColor] mb-2">
              {entity.callsign}
            </h2>

            <section className="border-l-2 border-l-amber-500/20 pl-3 py-1 mb-2 space-y-0.5">
              <h3 className="text-mono-sm font-bold text-white/90 uppercase">
                {p.platform || "RESTRICTED MANEUVER ENFORCED"}
              </h3>
              <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                <div className="flex gap-2">
                  <span className="text-white/30 w-16">Callsign:</span>
                  <span className="text-white/80">{p.callsign || entity.callsign}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-white/30 w-16">Detection:</span>
                  <span className="text-white/80">TACTICAL_PATTERN_RECOGNITION</span>
                </div>
              </div>
            </section>
          </div>
          <button
            onClick={onClose}
            aria-label="Close details"
            className="p-1.5 hover:bg-white/10 rounded-sm text-white/30 hover:text-white transition-all group outline-none"
          >
            <X size={14} className="group-hover:rotate-90 transition-transform duration-300" />
          </button>
        </div>

        {/* Tactical Badges */}
        <div className="flex gap-2 overflow-hidden mb-2">
          <div className="bg-black/40 px-2 py-1 rounded border border-white/10 flex flex-col min-w-0 shadow-inner">
            <span className="text-[8px] text-white/30 uppercase font-bold tracking-tight">TYPE_TAG</span>
            <span className="text-mono-xs font-bold truncate text-white">{entity.type}</span>
          </div>
          <div className="bg-black/40 px-2 py-1 rounded border border-white/10 flex flex-col flex-1 shadow-inner">
            <span className="text-[8px] text-white/30 uppercase font-bold tracking-tight">STATUS</span>
            <span className="text-mono-xs font-bold truncate text-amber-400 animate-pulse">ESTABLISHED</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCenterMap}
            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-b from-amber-500/30 to-amber-500/10 hover:from-amber-500/40 hover:to-amber-500/20 border border-amber-500/50 py-1.5 rounded text-[10px] font-bold tracking-widest text-amber-500 transition-all active:scale-[0.98] shadow-[0_0_15px_rgba(245,158,11,0.1)]"
          >
            <Crosshair size={12} />
            CENTER_VIEW
          </button>
          <button
            onClick={() => setShowHistory((h) => !h)}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded text-[10px] font-bold tracking-widest transition-all ${
              showHistory
                ? "bg-gradient-to-b from-amber-500/30 to-amber-500/10 border border-amber-500/50 text-amber-500"
                : "bg-white/10 border border-white/10 text-white/70"
            }`}
          >
            <MapIcon size={12} />
            TRACK_LOG
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="overflow-y-auto min-h-0 shrink border-x border-tactical-border bg-black/30 backdrop-blur-md p-3 space-y-3 scrollbar-none font-mono">
        {showHistory && (
          <TrackHistoryPanel
            entity={entity}
            onHistoryLoaded={onHistoryLoaded ?? (() => {})}
          />
        )}

        {/* Hold Statistics */}
        <section className="bg-amber-500/5 border border-amber-500/20 p-3 rounded space-y-3">
            <div className="flex items-center gap-2 text-amber-500/80">
                <Activity size={12} />
                <h3 className="text-[10px] font-bold uppercase tracking-widest">Hold Parameter Telemetry</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-mono-xs font-medium">
                <div className="flex flex-col border-b border-white/5 pb-2">
                    <span className="text-[8px] text-white/30 uppercase mb-1">Completed Cycles</span>
                    <span className="text-amber-400 text-lg font-black tracking-tighter">
                        {p.turns_completed || "0.0"} <span className="text-[10px] opacity-50 font-bold tracking-normal uppercase">Turns</span>
                    </span>
                </div>
                <div className="flex flex-col border-b border-white/5 pb-2">
                    <span className="text-[8px] text-white/30 uppercase mb-1">Current Altitude</span>
                    <span className="text-white text-lg font-black tracking-tighter">
                        {Math.round(entity.altitude || 0).toLocaleString()} <span className="text-[10px] opacity-50 font-bold tracking-normal uppercase">ft</span>
                    </span>
                </div>
            </div>

            <div className="space-y-2 pt-1 font-mono text-mono-xs">
                <div className="flex justify-between items-center text-white/40">
                    <span className="text-[9px] uppercase font-bold tracking-widest flex items-center gap-1">
                        <Target size={10} /> Center Coordinate
                    </span>
                    <span className="text-white/80 tabular-nums">
                        {entity.lat.toFixed(6)} / {entity.lon.toFixed(6)}
                    </span>
                </div>
            </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-[10px] text-white/30 font-bold uppercase tracking-[.2em]">Contextual_Analysis</h3>
          <div className="p-2 bg-white/5 border border-white/10 rounded text-[9px] text-white/60 leading-relaxed italic">
            This aircraft has triggered pattern recognition for a non-standard holding loop. 
            Tactical monitoring is advised to determine intent (Arrival delay, Emergency, or SigInt).
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="p-3 border border-t-0 border-tactical-border bg-black/40 backdrop-blur-md rounded-b-sm flex flex-col gap-2">
        <AnalysisWidget
          accentColor="text-amber-500"
          onOpenPanel={onOpenAnalystPanel}
        />
        <div className="flex items-center justify-between text-[8px] font-mono text-white/30 pt-1 border-t border-white/5">
          <span>SOURCE: <span className="text-amber-500/70">AV_TACTICAL_POLLER</span></span>
          <span className="text-hud-green uppercase font-bold tracking-widest">Pattern_Locked</span>
        </div>
      </div>
    </div>
  );
};
