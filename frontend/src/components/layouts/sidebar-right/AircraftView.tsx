import { Crosshair, Map as MapIcon, Shield, Terminal, X } from "lucide-react";
import React, { useState } from "react";
import { AnalysisWidget } from "../../widgets/AnalysisWidget";
import { Compass } from "../../widgets/Compass";
import { PayloadInspector } from "../../widgets/PayloadInspector";
import { TrackHistoryPanel } from "../../widgets/TrackHistoryPanel";
import { TimeTracked } from "../TimeTracked";
import { AircraftViewProps } from "./types";

export const AircraftView: React.FC<AircraftViewProps> = ({
  entity,
  onClose,
  onCenterMap,
  onOpenAnalystPanel,
  onHistoryLoaded,
}) => {
  const [showInspector, setShowInspector] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const cl = entity.classification;

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

  const isHelicopterOrDrone =
    cl?.platform === "helicopter" || cl?.platform === "drone";
  const showAffiliationBadge =
    cl?.affiliation &&
    !(cl.affiliation === "general_aviation" && isHelicopterOrDrone);

  return (
    <div className="pointer-events-auto flex flex-col h-auto max-h-full overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
      {/* Header */}
      <div className="p-3 border border-b-0 border-air-accent/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] bg-gradient-to-br from-air-accent/20 to-air-accent/5 backdrop-blur-md rounded-t-sm relative">
        <div className="relative z-10 flex justify-between items-start gap-2">
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Shield size={14} className="text-air-accent" />
              <span className="text-[10px] font-bold tracking-[.3em] text-white/40">
                IDENTIFIED_TARGET
              </span>
              {cl && (
                <div className="flex gap-1.5">
                  {showAffiliationBadge && (
                    <span
                      className={`text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wider ${
                        ["military", "government"].includes(cl.affiliation!)
                          ? "bg-[#FF8800]/20 text-[#FF8800] border border-[#FF8800]/30"
                          : "bg-white/10 text-white/60 border border-white/20"
                      }`}
                    >
                      {cl.affiliation!.toUpperCase()}
                    </span>
                  )}
                  {isHelicopterOrDrone && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wider bg-[#FF8800]/20 text-[#FF8800] border border-[#FF8800]/30">
                      {cl.platform!.toUpperCase()}
                    </span>
                  )}
                </div>
              )}
            </div>
            <h2 className="text-mono-xl font-bold tracking-tighter text-air-accent drop-shadow-[0_0_8px_currentColor] mb-2">
              {entity.callsign}
            </h2>

            {cl && (
              <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
                <h3 className="text-mono-sm font-bold text-white/90">
                  {cl.description || cl.icaoType || "UNKNOWN_MODEL"}
                </h3>
                <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">Operator:</span>
                    <span className="text-white/80">
                      {cl.operator || "UNKNOWN"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">Category:</span>
                    <span className="text-white/80">
                      {cl.category || cl.sizeClass || "UNKNOWN"}
                    </span>
                  </div>
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
              {cl?.registration || "N/A"}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onCenterMap?.();
            }}
            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-b from-air-accent/30 to-air-accent/10 hover:from-air-accent/40 hover:to-air-accent/20 border border-air-accent/50 py-1.5 rounded text-[10px] font-bold tracking-widest text-air-accent transition-all active:scale-[0.98] shadow-[0_0_15px_rgba(0,255,65,0.1)]"
          >
            <Crosshair size={12} />
            CENTER_VIEW
          </button>
          <button
            onClick={() => setShowHistory((h) => !h)}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded text-[10px] font-bold tracking-widest transition-all active:scale-[0.98] ${
              showHistory
                ? "bg-gradient-to-b from-air-accent/30 to-air-accent/10 hover:from-air-accent/40 hover:to-air-accent/20 border border-air-accent/50 text-air-accent shadow-[0_0_15px_rgba(0,255,65,0.1)]"
                : "bg-gradient-to-b from-white/10 to-transparent hover:from-white/20 hover:to-white/5 border border-white/10 text-white/70"
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
          <>
            <TrackHistoryPanel
              entity={entity}
              onHistoryLoaded={onHistoryLoaded ?? (() => {})}
            />
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
                <span className="text-air-accent tabular-nums">
                  {(entity.speed * 1.94384).toFixed(1)} kts
                </span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-white/30">COG:</span>
                <span className="text-air-accent tabular-nums">
                  {Math.round(entity.course)}°
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-white/30">ALT:</span>
                <span className="text-white tabular-nums">
                  {entity.altitude > 0
                    ? Math.round(entity.altitude * 3.28084).toLocaleString()
                    : "GND"}{" "}
                  ft
                </span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-white/30">VS:</span>
                <span
                  className={`${entity.vspeed && Math.abs(entity.vspeed) > 100 ? "text-white" : "text-white/40"} tabular-nums`}
                >
                  {entity.vspeed
                    ? Math.round(entity.vspeed).toLocaleString()
                    : "0"}{" "}
                  fpm
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-white/30">SQUAWK:</span>
                <span className="text-amber-500/80 tabular-nums">
                  {cl?.squawk || "----"}
                </span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-white/30">EMRG:</span>
                <span
                  className={`${cl?.emergency && cl.emergency !== "none" ? "text-alert-red animate-pulse font-bold" : "text-white/40"} tabular-nums`}
                >
                  {cl?.emergency ? cl.emergency.toUpperCase() : "NONE"}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-1 flex justify-center opacity-80 scale-100">
            <Compass
              heading={entity.course}
              size={180}
              accentColor="air-accent"
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
            accentColor="text-air-accent"
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
            <span className="text-hud-green/70">ADSB_Poller</span>
          </span>
          <span>
            <TimeTracked lastSeen={entity.lastSeen} />
          </span>
        </div>
      </div>
    </div>
  );
};
