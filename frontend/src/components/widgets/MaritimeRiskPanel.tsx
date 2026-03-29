/**
 * MaritimeRiskPanel — Phase 3 Geospatial maritime conditions HUD.
 *
 * Presents a compact operating picture for a selected AIS vessel:
 *   - A simple conditions badge derived from nearby advisories and buoy anomalies
 *   - A coarse conditions index (0–10) from the existing report payload
 *   - Nearby advisories when present
 *   - Sea state anomaly alert when Z-score > 2σ
 *
 * Auto-refreshes every 30 s while the vessel remains selected (managed by
 * useMaritimeRisk).  Collapses cleanly when no sea vessel is selected.
 */

import { AlertTriangle, Shield, Skull, Waves } from "lucide-react";
import React from "react";
import type { MaritimeRiskReport } from "../../hooks/useMaritimeRisk";

interface Props {
  report: MaritimeRiskReport | null;
  isLoading: boolean;
  callsign: string;
}

// ─── colour helpers ──────────────────────────────────────────────────────────

function conditionsBadgeClass(level: string): string {
  switch (level) {
    case "ELEVATED":
      return "bg-red-600/90 text-white border-red-400/60";
    case "ADVISORY":
      return "bg-orange-500/90 text-white border-orange-400/60";
    case "WATCH":
      return "bg-amber-500/80 text-black border-amber-400/60";
    default:
      return "bg-emerald-700/70 text-emerald-200 border-emerald-500/40";
  }
}

function conditionsBadgeLabel(report: MaritimeRiskReport): string {
  if (report.incident_count > 0 && report.sea_state_anomaly) return "ELEVATED";
  if (report.incident_count > 0) return "ADVISORY";
  if (report.sea_state_anomaly) return "WATCH";
  return "STABLE";
}

function scoreBarColor(score: number): string {
  if (score >= 7) return "bg-red-500";
  if (score >= 4.5) return "bg-orange-500";
  if (score >= 2) return "bg-amber-500";
  return "bg-emerald-500";
}

function hostilityColor(hostility: string | null): string {
  if (!hostility) return "text-white/40";
  const h = hostility.toLowerCase();
  if (h.includes("kidnap") || h.includes("hijack")) return "text-red-400";
  if (h.includes("fired") || h.includes("assault")) return "text-orange-400";
  if (h.includes("robbery") || h.includes("boarding")) return "text-amber-400";
  return "text-white/60";
}

function conditionsSummary(report: MaritimeRiskReport): string {
  if (report.incident_count > 0 && report.sea_state_anomaly) {
    return "Nearby advisories and elevated buoy conditions.";
  }
  if (report.incident_count > 0) {
    return "Nearby advisories present in the current maritime feed.";
  }
  if (report.sea_state_anomaly) {
    return "Buoy readings are elevated against the local baseline.";
  }
  return "No nearby advisories and no buoy anomaly detected.";
}

// ─── component ───────────────────────────────────────────────────────────────

export const MaritimeRiskPanel: React.FC<Props> = ({
  report,
  isLoading,
  callsign,
}) => {
  if (!report && !isLoading) return null;

  const badgeLabel = report ? conditionsBadgeLabel(report) : "STABLE";

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 bg-black/60 border-t border-white/8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Shield size={10} className="text-cyan-400" />
          <span className="text-[9px] font-bold tracking-widest text-cyan-400/80 uppercase">
            Maritime Conditions
          </span>
          <span className="text-[8px] text-white/30 font-mono">{callsign}</span>
        </div>
        {isLoading && (
          <span className="text-[8px] text-white/30 animate-pulse">
            updating…
          </span>
        )}
      </div>

      {isLoading && !report && (
        <div className="text-[9px] text-white/30 py-1">
          Updating conditions…
        </div>
      )}

      {report && (
        <>
          {/* Conditions badge + score bar */}
          <div className="flex items-center gap-2">
            <span
              className={`text-[8px] font-bold px-1.5 py-0.5 rounded border tracking-widest ${conditionsBadgeClass(badgeLabel)}`}
            >
              {badgeLabel}
            </span>
            <div className="flex-1 flex items-center gap-1">
              <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${scoreBarColor(report.composite_score)}`}
                  style={{ width: `${(report.composite_score / 10) * 100}%` }}
                />
              </div>
              <span className="text-[8px] font-mono text-white/50 shrink-0">
                {report.composite_score.toFixed(1)}/10
              </span>
            </div>
          </div>
          <div className="text-[8px] text-white/35 leading-tight">
            {conditionsSummary(report)}
          </div>

          {/* Sea state anomaly alert */}
          {report.sea_state_anomaly && (
            <div className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/30 rounded px-1.5 py-0.5">
              <Waves size={9} className="text-blue-400 shrink-0" />
              <span className="text-[8px] text-blue-300">
                Sea state anomaly detected — wave height &gt;2σ above baseline
              </span>
            </div>
          )}

          {/* Nearby advisories */}
          {report.incident_count > 0 ? (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1 mb-0.5">
                <Skull size={8} className="text-red-400/70" />
                <span className="text-[8px] text-white/40 uppercase tracking-wider">
                  {report.incident_count} advisory
                  {report.incident_count !== 1 ? "s" : ""} within{" "}
                  {report.radius_nm}nm
                </span>
              </div>
              {report.nearby_incidents.slice(0, 5).map((inc) => (
                <div
                  key={inc.reference}
                  className="flex items-center justify-between bg-white/3 rounded px-1.5 py-0.5"
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <span
                      className={`text-[8px] font-mono shrink-0 ${hostilityColor(inc.hostility)}`}
                    >
                      {(inc.hostility ?? "Unknown").slice(0, 14)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[8px] font-mono text-white/30">
                      {inc.distance_nm}nm
                    </span>
                    <span
                      className="text-[8px] font-mono font-bold"
                      style={{
                        color: `hsl(${Math.max(0, (1 - inc.threat_score / 10) * 120)}, 80%, 55%)`,
                      }}
                    >
                      {inc.threat_score.toFixed(1)}
                    </span>
                  </div>
                </div>
              ))}
              {report.incident_count > 5 && (
                <span className="text-[8px] text-white/25 pl-1">
                  +{report.incident_count - 5} more
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 text-emerald-500/60">
              <AlertTriangle size={8} />
              <span className="text-[8px]">
                No nearby advisories within {report.radius_nm}nm
              </span>
            </div>
          )}

          {/* Sea state readings */}
          {report.sea_state.length > 0 && (
            <div className="flex flex-col gap-0.5 mt-0.5">
              <span className="text-[8px] text-white/30 uppercase tracking-wider">
                Nearest buoy conditions
              </span>
              {report.sea_state.slice(0, 2).map((s) => (
                <div
                  key={s.buoy_id}
                  className="flex items-center justify-between bg-white/3 rounded px-1.5 py-0.5"
                >
                  <span className="text-[8px] font-mono text-blue-300/70">
                    {s.buoy_id}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {s.wvht_m !== null && (
                      <span className="text-[8px] font-mono text-white/50">
                        {s.wvht_m.toFixed(1)}m WVHT
                      </span>
                    )}
                    {s.wvht_zscore !== null && (
                      <span
                        className={`text-[8px] font-mono font-bold ${Math.abs(s.wvht_zscore) > 2 ? "text-blue-400" : "text-white/30"}`}
                      >
                        Z={s.wvht_zscore > 0 ? "+" : ""}
                        {s.wvht_zscore.toFixed(1)}
                      </span>
                    )}
                    <span className="text-[8px] text-white/25">
                      {s.distance_nm}nm
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {report.sea_state.length === 0 && (
            <div className="flex items-center gap-1 text-white/35">
              <Waves size={8} />
              <span className="text-[8px]">
                No recent buoy observations within {report.radius_nm}nm
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
};
