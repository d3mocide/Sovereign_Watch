import { Brain, Crosshair, Shield, Terminal, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { fetchTrajectory } from "../../../api/trajectory";
import { NAV_STATUS_MAP, SHIP_TYPE_MAP } from "../../../constants/maritime";
import { AnalysisWidget } from "../../widgets/AnalysisWidget";
import { Compass } from "../../widgets/Compass";
import { HMMStateBadge, HMMTimelinePanel } from "../../widgets/HMMTimelinePanel";
import { PayloadInspector } from "../../widgets/PayloadInspector";
import { TimeTracked } from "../TimeTracked";
import { BaseViewProps } from "./types";

export const ShipView: React.FC<BaseViewProps> = ({
  entity,
  onClose,
  onCenterMap,
  onOpenAnalystPanel,
}) => {
  const [showInspector, setShowInspector] = useState(false);
  const [showHMM, setShowHMM] = useState(false);
  const [hmmState, setHmmState] = useState<{
    dominant: string;
    anomaly: number;
  } | null>(null);
  const vc = entity.vesselClassification;

  // Lazily fetch HMM dominant state for badge display
  useEffect(() => {
    let cancelled = false;
    fetchTrajectory(entity.uid).then((r) => {
      if (!cancelled && r)
        setHmmState({ dominant: r.dominant_state, anomaly: r.anomaly_score });
    });
    return () => { cancelled = true; };
  }, [entity.uid]);

  if (showInspector) {
    return (
      <div className="pointer-events-auto h-full animate-in slide-in-from-right duration-500 w-full">
        <PayloadInspector
          entity={entity}
          onClose={() => setShowInspector(false)}
        />
      </div>
    );
  }

  const categoryBadgeClass =
    vc?.category &&
    ["sar", "military", "law_enforcement"].includes(vc.category)
      ? "bg-[#FF8800]/20 text-[#FF8800] border border-[#FF8800]/30"
      : vc?.category === "cargo"
        ? "bg-green-500/20 text-green-500 border border-green-500/30"
        : vc?.category === "tanker"
          ? "bg-red-500/20 text-red-500 border border-red-500/30"
          : vc?.category === "passenger"
            ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
            : "bg-blue-500/20 text-blue-400 border border-blue-500/30";

  return (
    <div className="pointer-events-auto flex flex-col h-auto max-h-full overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
      {/* Header */}
      <div className="p-3 border border-b-0 border-sea-accent/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] bg-gradient-to-br from-sea-accent/20 to-sea-accent/5 backdrop-blur-md rounded-t-sm relative">
        <div className="relative z-10 flex justify-between items-start gap-2">
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Shield size={14} className="text-sea-accent" />
              <span className="text-[10px] font-bold tracking-[.3em] text-white/40">
                IDENTIFIED_TARGET
              </span>
              <div className="flex gap-1.5 flex-wrap">
                {vc?.category && (
                  <span
                    className={`text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wider ${categoryBadgeClass}`}
                  >
                    {vc.category.toUpperCase()}
                  </span>
                )}
                {hmmState && (
                  <HMMStateBadge
                    dominantState={hmmState.dominant}
                    anomalyScore={hmmState.anomaly}
                  />
                )}
              </div>
            </div>
            <h2 className="text-mono-xl font-bold tracking-tighter text-sea-accent drop-shadow-[0_0_8px_currentColor] mb-2">
              {entity.callsign}
            </h2>

            {vc && (
              <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
                <h3 className="text-mono-sm font-bold text-white/90">
                  {SHIP_TYPE_MAP[vc.shipType || 0] || "UNKNOWN VESSEL"}
                </h3>
                <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">IMO:</span>
                    <span className="text-white/80">
                      {vc.imo || "UNKNOWN"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">Flag MID:</span>
                    <span className="text-white/80">
                      {vc.flagMid || "UNKNOWN"}
                    </span>
                  </div>
                  {vc.length !== undefined && vc.length > 0 && (
                    <div className="flex gap-2">
                      <span className="text-white/30 w-16">Dimensions:</span>
                      <span className="text-white/80">
                        {vc.length}m × {vc.beam}m
                      </span>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close details"
            title="Close details"
            className="p-1.5 hover:bg-white/10 rounded-sm text-white/30 hover:text-white transition-all group focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
          >
            <X size={14} className="group-hover:rotate-90 transition-transform duration-300" />
          </button>
        </div>

        {/* Global IDs */}
        <div className="flex gap-2 overflow-hidden mb-2">
          <div className="bg-black/40 px-2 py-1 rounded border border-white/10 flex flex-col min-w-0 shadow-inner">
            <span className="text-[8px] text-white/30 uppercase font-bold tracking-tight">
              TYPE_TAG
            </span>
            <span className="text-mono-xs font-bold truncate text-white">
              {entity.type}
            </span>
          </div>
          <div className="bg-black/40 px-2 py-1 rounded border border-white/10 flex flex-col flex-1 shadow-inner">
            <span className="text-[8px] text-white/30 uppercase font-bold tracking-tight">
              REGISTRATION
            </span>
            <span className="text-mono-xs font-bold truncate text-white">
              {vc?.callsign?.trim() || (vc?.imo ? `IMO ${vc.imo}` : "N/A")}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onCenterMap?.();
            }}
            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-b from-sea-accent/30 to-sea-accent/10 hover:from-sea-accent/40 hover:to-sea-accent/20 border border-sea-accent/50 py-1.5 rounded text-[10px] font-bold tracking-widest text-sea-accent transition-all active:scale-[0.98] shadow-[0_0_15px_rgba(0,255,255,0.1)]"
          >
            <Crosshair size={12} />
            CENTER_VIEW
          </button>
          <button
            onClick={() => setShowHMM((h) => !h)}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded text-[10px] font-bold tracking-widest transition-all active:scale-[0.98] ${
              showHMM
                ? "bg-gradient-to-b from-amber-500/30 to-amber-500/10 hover:from-amber-500/40 hover:to-amber-500/20 border border-amber-500/50 text-amber-400 shadow-[0_0_15px_rgba(251,146,60,0.1)]"
                : "bg-gradient-to-b from-white/10 to-transparent hover:from-white/20 hover:to-white/5 border border-white/10 text-white/70"
            }`}
          >
            <Brain size={12} />
            HMM_STATES
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="overflow-y-auto min-h-0 shrink border-x border-tactical-border bg-black/30 backdrop-blur-md p-3 space-y-3 scrollbar-none font-mono">
        {showHMM && (
          <>
            <HMMTimelinePanel uid={entity.uid} />
            <div className="h-px bg-white/5 w-full" />
          </>
        )}

        <section className="space-y-2">
          <div className="flex items-center gap-2 text-hud-green/40 pb-1">
            <h3 className="text-[10px] text-white/50 font-bold">
              Positional_Telemetry
            </h3>
          </div>
          <div className="flex gap-4 text-mono-xs">
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

        <section className="space-y-2">
          <div className="flex items-center gap-2 text-hud-green/40 pb-1">
            <h3 className="text-[10px] text-white/50 font-bold">
              Vector_Dynamics
            </h3>
          </div>
          <div className="space-y-1 text-mono-xs font-medium">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-white/30">SOG:</span>
                <span className="text-sea-accent tabular-nums">
                  {(entity.speed * 1.94384).toFixed(1)} kts
                </span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-white/30">COG:</span>
                <span className="text-sea-accent tabular-nums">
                  {Math.round(entity.course)}°
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-white/30">STAT:</span>
                <span
                  className="text-white tabular-nums truncate max-w-[120px]"
                  title={
                    NAV_STATUS_MAP[vc?.navStatus ?? 15] || "Unknown"
                  }
                >
                  {NAV_STATUS_MAP[vc?.navStatus ?? 15] || "UNKNOWN"}
                </span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-white/30">DEST:</span>
                <span className="text-white tabular-nums truncate max-w-[100px]">
                  {vc?.destination || "UNKNOWN"}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-white/30">DRGT:</span>
                <span className="text-white tabular-nums">
                  {vc?.draught ? `${vc.draught}m` : "---"}
                </span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-white/30">HAZ:</span>
                <span
                  className={`${vc?.hazardous ? "text-red-500 animate-pulse font-bold" : "text-white/40"} tabular-nums`}
                >
                  {vc?.hazardous ? "YES" : "NONE"}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-1 flex justify-center opacity-80 scale-100">
            <Compass
              heading={entity.course}
              size={180}
              accentColor="sea-accent"
            />
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="p-3 border border-t-0 border-tactical-border bg-black/40 backdrop-blur-md rounded-b-sm flex flex-col gap-2">
        <div
          className={`flex items-stretch gap-2 w-full ${entity.raw ? "grid grid-cols-2" : ""}`}
        >
          <AnalysisWidget
            accentColor="text-sea-accent"
            onOpenPanel={onOpenAnalystPanel}
          />
          {entity.raw && (
            <button
              onClick={() => setShowInspector(true)}
              className="py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded group transition-all col-span-1"
            >
              <div className="flex items-center justify-between px-3 h-full">
                <span className="text-[10px] font-bold tracking-[.2em] text-white/30 group-hover:text-white/60">
                  RAW_PAYLOAD
                </span>
                <Terminal size={12} className="text-white/20" />
              </div>
            </button>
          )}
        </div>
        <div className="flex items-center justify-between text-[8px] font-mono text-white/30 pt-1 border-t border-white/5">
          <span>
            SIG:{" "}
            <span className="text-hud-green/70">AIS_Poller</span>
          </span>
          <span>
            <TimeTracked lastSeen={entity.lastSeen} />
          </span>
        </div>
      </div>
    </div>
  );
};
