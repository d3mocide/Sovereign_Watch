import { Antenna } from "lucide-react";
import React from "react";
import type { RFSiteResult } from "./MiniMap";

interface RFSiteSearchPanelProps {
  count: number;
  results: RFSiteResult[];
}

export const RFSiteSearchPanel: React.FC<RFSiteSearchPanelProps> = ({
  count,
  results,
}) => {
  return (
    <div className="flex flex-col border-r border-white/5 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-black/50 border-b border-white/5 flex-shrink-0">
        <Antenna size={11} className="text-amber-400/70" />
        <span className="text-[10px] font-bold tracking-widest uppercase text-white/55">
          Emergency Comm Sites
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[9px] font-bold text-amber-400 tabular-nums">
            {count}
          </span>
          <div className="h-1.5 w-px bg-white/10" />
          <span className="text-[7px] text-white/30 uppercase tracking-tighter">
            Regional Grid
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-black/10">
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center opacity-30">
            <Antenna size={24} strokeWidth={1} />
            <span className="text-[9px] uppercase tracking-widest">
              Scanning for Local Infrastructure...
            </span>
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Summary Bar */}
            <div className="flex items-center gap-3 px-3 py-1.5 bg-amber-400/5 border-b border-white/5">
              {(["ARES", "RACES", "SKYWARN"] as const).map((flag) => {
                const flagCount = results.filter((s) =>
                  s.emcomm_flags?.includes(flag),
                ).length;
                return (
                  <div key={flag} className="flex items-center gap-1">
                    <span className="text-[7px] text-white/30 font-bold">
                      {flag}:
                    </span>
                    <span className="text-[8px] text-amber-400 font-mono">
                      {flagCount}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Status Grid */}
            <div className="grid grid-cols-2 md:grid-cols-1 xl:grid-cols-2 gap-px bg-white/[0.03]">
              {results.slice(0, 32).map((site) => (
                <div
                  key={site.id}
                  className="bg-black/40 p-2 border-b border-white/[0.02] hover:bg-white/5 transition-all group cursor-default"
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1 w-1 rounded-full bg-amber-500 animate-pulse" />
                      <span className="text-[9px] font-bold text-amber-500/90 group-hover:text-amber-400 transition-colors">
                        {site.callsign}
                      </span>
                    </div>
                    <span className="text-[7px] text-white/20 font-mono">
                      {site.modes?.[0] || site.service}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-1 overflow-hidden">
                    <span className="text-[8px] text-white/40 truncate flex-1">
                      {site.city || "Unknown QTH"}
                    </span>
                    {site.emcomm_flags &&
                      site.emcomm_flags.length > 0 &&
                      (site.emcomm_flags.includes("RACES") ||
                        site.emcomm_flags.includes("ARES")) && (
                        <span className="text-[6px] text-amber-500/40 font-black tracking-tighter">
                          CERT
                        </span>
                      )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
