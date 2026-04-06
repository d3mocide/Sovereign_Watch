/**
 * NWSAlertsWidget — National Weather Service alerts HUD for the Tactical Map.
 *
 * Shows a count summary of active NWS alerts. When a mission AOT is active,
 * filters to alerts that intersect the AOT and fires onEvent() for newly
 * appearing Severe/Extreme events within the mission area.
 *
 * Positioning: top-left corner of the tactical map, styled to match the
 * glass-morphism aesthetic used by SpaceWeatherPanel on the orbital view.
 */

import type { Feature, FeatureCollection } from "geojson";
import { CloudRain, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Mission {
  lat: number;
  lon: number;
  radius_nm: number;
}

interface IntelEvent {
  type: "new" | "lost" | "alert";
  message: string;
  entityType?: "air" | "sea" | "orbital" | "infra";
}

interface Props {
  nwsAlerts: FeatureCollection | null;
  mission?: Mission | null;
  onEvent?: (event: IntelEvent) => void;
  visible?: boolean;
}

// ── Severity helpers ──────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  Extreme: 4,
  Severe:  3,
  Moderate: 2,
  Minor:   1,
};

function severityColor(sev: string): string {
  switch (sev) {
    case "Extreme":  return "#ef4444";
    case "Severe":   return "#f97316";
    case "Moderate": return "#f59e0b";
    case "Minor":    return "#3b82f6";
    default:         return "#6b7280";
  }
}

function sortBySeverity(a: Feature, b: Feature): number {
  const sa = SEVERITY_ORDER[a.properties?.severity ?? ""] ?? 0;
  const sb = SEVERITY_ORDER[b.properties?.severity ?? ""] ?? 0;
  return sb - sa; // descending
}

// ── AOT intersection ──────────────────────────────────────────────────────────

/**
 * Rough bbox-overlap test: does this NWS alert polygon intersect the AOT?
 * The AOT is approximated as a bounding box around the mission centre circle.
 * 1 NM ≈ 1/60° latitude; longitude is compensated for latitude convergence.
 */
function alertIntersectsAOT(feature: Feature, mission: Mission): boolean {
  const radiusDeg = mission.radius_nm / 60;
  const lonOffset = radiusDeg / Math.cos((mission.lat * Math.PI) / 180);

  const aotMinLat = mission.lat - radiusDeg;
  const aotMaxLat = mission.lat + radiusDeg;
  const aotMinLon = mission.lon - lonOffset;
  const aotMaxLon = mission.lon + lonOffset;

  const geom = feature.geometry as any;
  if (!geom) return false;

  let allCoords: [number, number][] = [];
  if (geom.type === "Polygon") {
    allCoords = geom.coordinates[0] as [number, number][];
  } else if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) {
      allCoords = allCoords.concat(poly[0] as [number, number][]);
    }
  }

  if (allCoords.length === 0) return false;

  const lons = allCoords.map((c) => c[0]);
  const lats = allCoords.map((c) => c[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  return (
    aotMinLat <= maxLat &&
    aotMaxLat >= minLat &&
    aotMinLon <= maxLon &&
    aotMaxLon >= minLon
  );
}

function alertId(feature: Feature): string {
  return String(
    feature.properties?.id ?? feature.id ?? JSON.stringify(feature.properties?.sent)
  );
}

function fmtExpiry(isoStr: string | undefined): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    const hh = d.getUTCHours().toString().padStart(2, "0");
    const mm = d.getUTCMinutes().toString().padStart(2, "0");
    return `expires ${d.toUTCString().slice(5, 11)} ${hh}:${mm}Z`;
  } catch {
    return "";
  }
}

// ── Re-notify interval: 30 minutes ───────────────────────────────────────────
const RENOTIFY_MS = 30 * 60 * 1000;

// Extracted so react-hooks/purity lint rule allows it inside effects
function currentTimestamp(): number { return Date.now(); }

// ── Component ────────────────────────────────────────────────────────────────

export function NWSAlertsWidget({ nwsAlerts, mission, onEvent, visible = true }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Dedup: map of alertId → timestamp of last notification
  const alertedRef = useRef<Map<string, number>>(new Map());

  const features: Feature[] = nwsAlerts?.features ?? [];

  // Split all features vs AOT-intersecting features
  const aotFeatures = mission
    ? features.filter((f) => alertIntersectsAOT(f, mission))
    : features; // if no mission, show all

  const sorted = [...aotFeatures].sort(sortBySeverity);

  // Count buckets across AOT features
  const counts = sorted.reduce(
    (acc, f) => {
      const sev = f.properties?.severity ?? "Unknown";
      if (sev === "Extreme") acc.extreme++;
      else if (sev === "Severe") acc.severe++;
      else if (sev === "Moderate") acc.moderate++;
      else acc.minor++;
      return acc;
    },
    { extreme: 0, severe: 0, moderate: 0, minor: 0 },
  );

  // Fire onEvent for newly entered Severe/Extreme AOT alerts
  useEffect(() => {
    if (!onEvent) return;
    const now = currentTimestamp();
    for (const f of aotFeatures) {
      const sev = f.properties?.severity ?? "";
      if (sev !== "Severe" && sev !== "Extreme") continue;
      const id = alertId(f);
      const lastFired = alertedRef.current.get(id) ?? 0;
      if (now - lastFired < RENOTIFY_MS) continue;
      alertedRef.current.set(id, now);
      const event = f.properties?.event ?? "Weather Alert";
      const area = f.properties?.areaDesc ?? "unknown area";
      onEvent({
        type: "alert",
        message: `NWS ${sev.toUpperCase()}: ${event} — ${area}`,
        entityType: "infra",
      });
    }
  }, [aotFeatures, onEvent]);

  if (!visible) return null;

  // Determine header accent colour from worst-severity alert in AOT
  const worstSev = sorted[0]?.properties?.severity ?? null;
  const headerColor = worstSev ? severityColor(worstSev) : "#f59e0b";
  const hasAOT = mission != null;
  const total = features.length;
  const aotTotal = aotFeatures.length;

  if (total === 0) return null;

  return (
    <div
      className="pointer-events-auto flex flex-col overflow-hidden
                 animate-in slide-in-from-top duration-500 font-mono"
      style={{ width: 262 }}
    >
      {/* ── Header ── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between p-2.5 rounded-t-sm border border-b-0 backdrop-blur-md text-left w-full"
        style={{
          background: `linear-gradient(135deg, ${headerColor}14 0%, ${headerColor}05 100%)`,
          borderColor: `${headerColor}35`,
        }}
      >
        <div className="flex items-center gap-2">
          <CloudRain size={12} style={{ color: headerColor }} />
          <span className="text-[10px] font-bold tracking-[.25em] text-white/50 uppercase">
            NWS_Alerts
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Severity pill counts */}
          {counts.extreme > 0 && (
            <span className="text-[9px] font-bold px-1 py-0.5 rounded"
                  style={{ background: "#ef444420", border: "1px solid #ef444455", color: "#ef4444" }}>
              {counts.extreme}E
            </span>
          )}
          {counts.severe > 0 && (
            <span className="text-[9px] font-bold px-1 py-0.5 rounded"
                  style={{ background: "#f9731620", border: "1px solid #f9731655", color: "#f97316" }}>
              {counts.severe}S
            </span>
          )}
          {counts.moderate > 0 && (
            <span className="text-[9px] font-bold px-1 py-0.5 rounded"
                  style={{ background: "#f59e0b20", border: "1px solid #f59e0b55", color: "#f59e0b" }}>
              {counts.moderate}M
            </span>
          )}
          {expanded ? (
            <ChevronDown size={10} className="text-white/30" />
          ) : (
            <ChevronRight size={10} className="text-white/30" />
          )}
        </div>
      </button>

      {/* ── Body ── */}
      {expanded && (
        <div
          className="border border-t-0 bg-black/50 backdrop-blur-md rounded-b-sm"
          style={{ borderColor: `${headerColor}25` }}
        >
          {/* AOT context line */}
          {hasAOT && (
            <div className="px-2.5 py-1.5 border-b text-[8px] font-mono tracking-widest"
                 style={{ borderColor: `${headerColor}15` }}>
              <span className="text-white/30">AOT:</span>{" "}
              <span style={{ color: aotTotal > 0 ? headerColor : "rgba(255,255,255,0.2)" }}>
                {aotTotal} of {total} alerts intersect mission area
              </span>
            </div>
          )}

          {/* Alert list */}
          <div className="max-h-60 overflow-y-auto scrollbar-none">
            {sorted.length === 0 ? (
              <div className="px-2.5 py-2 text-[9px] text-white/20 italic">
                No alerts in mission area
              </div>
            ) : (
              sorted.map((f, i) => {
                const sev = f.properties?.severity ?? "Unknown";
                const c = severityColor(sev);
                const event = f.properties?.event ?? "Weather Alert";
                const area = f.properties?.areaDesc ?? "";
                const expiry = fmtExpiry(f.properties?.expires);
                const isAot = mission ? alertIntersectsAOT(f, mission) : true;

                return (
                  <div
                    key={alertId(f) + i}
                    className="px-2.5 py-1.5 border-b last:border-0 space-y-0.5"
                    style={{ borderColor: "rgba(255,255,255,0.04)" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isAot && mission && (
                          <AlertTriangle size={8} style={{ color: c, flexShrink: 0 }} />
                        )}
                        <span className="text-[10px] text-white/80 font-bold truncate">
                          {event}
                        </span>
                      </div>
                      <span
                        className="text-[8px] font-bold px-1 rounded shrink-0"
                        style={{ background: `${c}20`, border: `1px solid ${c}40`, color: c }}
                      >
                        {sev.slice(0, 3).toUpperCase()}
                      </span>
                    </div>
                    {area && (
                      <div className="text-[8px] text-white/35 leading-snug line-clamp-2">
                        {area}
                      </div>
                    )}
                    {expiry && (
                      <div className="text-[8px] text-white/25">{expiry}</div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
