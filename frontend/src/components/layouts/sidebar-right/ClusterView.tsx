import { HexagonIcon, Info, X } from "lucide-react";
import React from "react";
import { BaseViewProps } from "./types";

export const ClusterView: React.FC<BaseViewProps> = ({
  entity,
  onClose,
  onCenterMap,
}) => {
  const detail = entity.detail as Record<string, unknown>;
  const entityCount = Number(detail?.entity_count ?? 0);
  const uids = (detail?.uids as string[] | undefined) ?? [];
  const startTime = detail?.start_time ? new Date(String(detail.start_time)) : null;
  const endTime = detail?.end_time ? new Date(String(detail.end_time)) : null;
  const durationMs =
    startTime && endTime ? endTime.getTime() - startTime.getTime() : null;
  const durationMin = durationMs != null ? Math.round(durationMs / 60_000) : null;

  return (
    <div className="pointer-events-auto flex flex-col h-auto max-h-[calc(100vh-8rem)] overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
      {/* Header */}
      <div className="p-3 border border-b-0 border-amber-400/30 bg-gradient-to-br from-amber-400/20 to-amber-400/5 backdrop-blur-md rounded-t-sm">
        <div className="flex justify-between items-start">
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <HexagonIcon size={14} className="text-amber-400" />
              <span className="text-[10px] font-bold tracking-[.3em] text-white/40">
                CONVERGENCE_ANALYSIS
              </span>
            </div>
            <h2 className="text-mono-xl font-bold tracking-tighter text-amber-400 drop-shadow-[0_0_8px_currentColor] mb-2">
              {entity.callsign}
            </h2>
            <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
              <h3 className="text-mono-sm font-bold text-white/90">
                ST-DBSCAN_CLUSTER
              </h3>
              <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                <div className="flex gap-2">
                  <span className="text-white/30 w-20">Entities:</span>
                  <span className="text-amber-400 font-bold">{entityCount}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-white/30 w-20">Centroid:</span>
                  <span className="text-white/80">
                    {entity.lat.toFixed(4)}, {entity.lon.toFixed(4)}
                  </span>
                </div>
              </div>
            </section>
          </div>
          <button
            onClick={onClose}
            aria-label="Close details"
            className="ml-2 shrink-0 p-1 rounded hover:bg-white/10 transition-colors text-white/40 hover:text-white/80"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="border border-t-0 border-amber-400/30 bg-black/80 backdrop-blur-md rounded-b-sm overflow-y-auto flex-1 min-h-0">
        {/* Timing */}
        <div className="p-3 border-b border-white/5">
          <span className="text-[8px] text-white/30 uppercase tracking-widest mb-2 block">
            Temporal Window
          </span>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
            <div>
              <span className="text-[8px] text-white/40 block leading-tight">FIRST OBS</span>
              <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
                {startTime ? startTime.toLocaleTimeString() : "—"}
              </span>
            </div>
            <div>
              <span className="text-[8px] text-white/40 block leading-tight">LAST OBS</span>
              <span className="text-[10px] text-hud-green font-mono font-bold leading-tight">
                {endTime ? endTime.toLocaleTimeString() : "—"}
              </span>
            </div>
            {durationMin != null && (
              <div className="col-span-2">
                <span className="text-[8px] text-white/40 block leading-tight">DURATION</span>
                <span className="text-[10px] text-amber-400 font-mono font-bold leading-tight">
                  {durationMin} min
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Temporal note */}
        <div className="px-3 py-2 border-b border-white/5 flex gap-2 items-start">
          <Info size={10} className="text-white/25 mt-0.5 shrink-0" />
          <span className="text-[9px] text-white/30 leading-relaxed">
            Clusters refresh every 30s. Entities must be within
            2 km <span className="text-white/50">and</span> 15 min of each other
            to co-cluster — transient contacts will appear/disappear between polls.
          </span>
        </div>

        {/* Entity UIDs */}
        {uids.length > 0 && (
          <div className="p-3 border-b border-white/5">
            <span className="text-[8px] text-white/30 uppercase tracking-widest mb-2 block">
              Tracked UIDs ({uids.length})
            </span>
            <div className="flex flex-col gap-1">
              {uids.map((uid) => (
                <div
                  key={uid}
                  className="text-[10px] font-mono text-amber-200/80 bg-amber-400/5 border border-amber-400/10 px-2 py-1.5 rounded-sm truncate leading-tight"
                  title={uid}
                >
                  {uid}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Center map action */}
        {onCenterMap && (
          <div className="p-3">
            <button
              onClick={onCenterMap}
              className="w-full text-[9px] font-mono uppercase tracking-widest text-amber-400 border border-amber-400/30 py-1.5 rounded-sm hover:bg-amber-400/10 transition-colors"
            >
              Center Map on Cluster
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

