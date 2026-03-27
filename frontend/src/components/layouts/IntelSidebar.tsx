/**
 * IntelSidebar — Left panel for the INTEL globe view.
 *
 * Sections:
 *  1. Header — title, refresh, time window, map style, spin toggle
 *  2. ACTIVE CONFLICT ZONES — countries ranked by event count + threat level
 *  3. ACTIVE ACTORS — actor list with intel score badge
 *  4. SITREP SUMMARY footer — hot zones count + GENERATE SITREP button
 */
import {
  Activity,
  AlertTriangle,
  FileText,
  Globe2,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
/* intel style imports removed */

export interface ActorEntry {
  actor: string;
  actor_type: string;
  event_count: number;
  avg_goldstein: number;
  threat_level: "CRITICAL" | "ELEVATED" | "MONITORING" | "STABLE";
  centroid_lat: number;
  centroid_lon: number;
  verbal_conflict: number;
  material_conflict: number;
  verbal_coop: number;
  material_coop: number;
}

interface IntelSidebarProps {
  onFlyTo?: (lat: number, lon: number) => void;
  /** Called with a pre-formatted context string when the user requests a SITREP. */
  onGenerateSitrep?: (context: string) => void;
}

function threatColor(level: ActorEntry["threat_level"]): string {
  switch (level) {
    case "CRITICAL":
      return "text-red-400";
    case "ELEVATED":
      return "text-amber-400";
    case "MONITORING":
      return "text-yellow-400";
    default:
      return "text-hud-green/80";
  }
}

function threatBorderColor(level: ActorEntry["threat_level"]): string {
  switch (level) {
    case "CRITICAL":
      return "border-red-500/40";
    case "ELEVATED":
      return "border-amber-500/40";
    case "MONITORING":
      return "border-yellow-500/40";
    default:
      return "border-white/10";
  }
}

function threatBadgeBg(level: ActorEntry["threat_level"]): string {
  switch (level) {
    case "CRITICAL":
      return "bg-red-500/20 text-red-300 border border-red-500/40";
    case "ELEVATED":
      return "bg-amber-500/20 text-amber-300 border border-amber-500/40";
    case "MONITORING":
      return "bg-yellow-500/15 text-yellow-300 border border-yellow-500/30";
    default:
      return "bg-white/5 text-white/40 border border-white/10";
  }
}

/** Build the SITREP context string from the current actors list. */
function buildSitrepContext(actors: ActorEntry[], timeWindow: number): string {
  const critical = actors.filter((a) => a.threat_level === "CRITICAL");
  const elevated = actors.filter((a) => a.threat_level === "ELEVATED");
  const totalEvents = actors.reduce((s, a) => s + a.event_count, 0);

  const lines: string[] = [
    `INTEL SITREP — OSINT GLOBE ANALYSIS`,
    `Time Window: Last ${timeWindow} hours`,
    `Total GDELT Events Indexed: ${totalEvents}`,
    ``,
    `CRITICAL THREAT ACTORS (${critical.length}):`,
    ...critical.map(
      (a) =>
        `  ${a.actor} — ${a.event_count} events, Goldstein avg ${a.avg_goldstein.toFixed(1)}, ${a.material_conflict} material conflict incidents`,
    ),
    ``,
    `ELEVATED THREAT ACTORS (${elevated.length}):`,
    ...elevated.map(
      (a) =>
        `  ${a.actor} — ${a.event_count} events, Goldstein avg ${a.avg_goldstein.toFixed(1)}`,
    ),
    ``,
    `TOP ACTORS BY EVENT COUNT:`,
    ...actors
      .slice(0, 8)
      .map(
        (a) =>
          `  ${a.actor} (${a.threat_level}): ${a.event_count} total, ${a.verbal_conflict} verbal conflict, ${a.material_conflict} material conflict`,
      ),
  ];

  return lines.join("\n");
}

export function IntelSidebar({
  onFlyTo,
  onGenerateSitrep,
}: IntelSidebarProps) {
  const [actors, setActors] = useState<ActorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [timeWindow, setTimeWindow] = useState<24 | 48 | 72>(24);

  const fetchActors = useCallback(
    async (bypassCache = false) => {
      setLoading(true);
      try {
        const url = `/api/gdelt/actors?limit=40&hours=${timeWindow}${bypassCache ? "&refresh=true" : ""}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setActors(data);
            setLastUpdated(new Date());
          }
        }
      } catch {
        // keep previous data
      } finally {
        setLoading(false);
      }
    },
    [timeWindow],
  );

  useEffect(() => {
    fetchActors();
    const interval = setInterval(() => fetchActors(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchActors]);

  const conflictZones = actors.filter(
    (a) => a.threat_level === "CRITICAL" || a.threat_level === "ELEVATED",
  );
  const allActors = actors.slice(0, 20);

  const formatTime = (d: Date) => d.toISOString().split("T")[1].split(".")[0];

  const handleSitrep = useCallback(() => {
    if (!onGenerateSitrep || !actors.length) return;
    onGenerateSitrep(buildSitrepContext(actors, timeWindow));
  }, [onGenerateSitrep, actors, timeWindow]);

  return (
    <div className="flex h-[98%] min-h-0 flex-col gap-3 overflow-hidden font-mono text-xs select-none">
      {/* Header */}
      <div className="shrink-0 px-3 py-3 bg-black/60 border border-white/10 backdrop-blur-xl rounded-sm shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-hud-green/30 to-transparent opacity-50" />

        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Globe2 size={13} className="text-hud-green" />
            <span className="text-white font-bold tracking-[.4em] text-[10px] uppercase">
              INTEL // OSINT GLOBE
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchActors(true)}
              className="p-1 text-white/20 hover:text-hud-green hover:bg-white/5 rounded transition-all"
              title="Refresh actor data"
            >
              <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {lastUpdated && (
          <div className="text-[9px] text-white/20 tracking-[.2em] font-medium mx-1 mb-3 flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-hud-green/40 animate-pulse" />
            UPDATED // {formatTime(lastUpdated)} UTC
          </div>
        )}

        <div className="space-y-2">
          {/* Time window selector */}
          <div className="flex items-center gap-2 px-1">
            <span className="text-[8px] text-white/30 tracking-[.2em] uppercase font-bold shrink-0">
              WINDOW
            </span>
            <div className="flex flex-1 gap-1">
              {([24, 48, 72] as const).map((h) => (
                <button
                  key={h}
                  onClick={() => setTimeWindow(h)}
                  className={`flex-1 py-1 text-[9px] font-bold tracking-widest rounded-sm transition-all ${
                    timeWindow === h
                      ? "bg-hud-green/20 text-hud-green border border-hud-green/40 shadow-[0_0_8px_rgba(0,255,65,0.1)]"
                      : "text-white/30 hover:text-white/60 bg-white/5 border border-white/5"
                  }`}
                >
                  {h}H
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Conflict Zones */}
      <div className="flex flex-col min-h-[25%] bg-black/60 border border-white/10 backdrop-blur-xl rounded-sm overflow-hidden shadow-2xl relative">
        <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2">
            <AlertTriangle size={12} className="text-red-400 opacity-80" />
            <span className="text-[10px] font-bold tracking-[.3em] text-white/80 uppercase">
              ACTIVE CONFLICT ZONES
            </span>
            <span className="text-[10px] text-red-500 font-black tabular-nums">
              [{conflictZones.length}]
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {loading && actors.length === 0 ? (
            <div className="px-3 py-4 text-center text-white/20 text-[10px] tracking-wider">
              SCANNING OSINT FEED...
            </div>
          ) : conflictZones.length === 0 ? (
            <div className="px-3 py-4 text-center text-white/20 text-[10px] tracking-wider">
              NO ACTIVE CONFLICT ZONES
            </div>
          ) : (
            conflictZones.map((zone, i) => (
              <button
                key={zone.actor}
                onClick={() =>
                  zone.centroid_lat &&
                  zone.centroid_lon &&
                  onFlyTo?.(zone.centroid_lat, zone.centroid_lon)
                }
                className={`w-full text-left px-3 py-2 border-b ${threatBorderColor(zone.threat_level)} hover:bg-white/5 transition-colors group`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-white/10 text-[9px] font-black w-4 text-right shrink-0 tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={`font-black tracking-widest text-xs ${threatColor(zone.threat_level)} group-hover:brightness-125 transition-all`}
                    >
                      {zone.actor}
                    </span>
                  </div>
                  <span
                    className={`text-[8px] font-black px-1.5 py-0.5 rounded-sm tracking-[.2em] backdrop-blur-md uppercase ${threatBadgeBg(zone.threat_level)}`}
                  >
                    {zone.threat_level}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-1 pl-7">
                  <span className="text-white/30 text-[9px] font-bold tracking-widest tabular-nums">
                    {zone.event_count.toLocaleString()} REPORTS
                  </span>
                  {zone.material_conflict > 0 && (
                    <span className="text-red-400/80 text-[9px] font-bold tracking-widest tabular-nums">
                      ⚡ {zone.material_conflict} MATERIAL
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Active Actors */}
      <div className="flex-1 flex flex-col min-h-0 bg-black/60 border border-white/10 backdrop-blur-xl rounded-sm overflow-hidden shadow-2xl relative transition-all">
        <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2">
            <Activity size={12} className="text-hud-green/70 animate-pulse" />
            <span className="text-[10px] font-bold tracking-[.3em] text-white/80 uppercase">
              ACTIVE ACTORS
            </span>
            <span className="text-[10px] text-hud-green font-black tabular-nums">
              [{allActors.length}]
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {allActors.map((actor) => (
            <button
              key={actor.actor}
              onClick={() =>
                actor.centroid_lat &&
                actor.centroid_lon &&
                onFlyTo?.(actor.centroid_lat, actor.centroid_lon)
              }
              className="w-full text-left px-3 py-1.5 border-b border-white/5 hover:bg-white/5 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className={`font-black tracking-widest text-[11px] ${threatColor(actor.threat_level)} group-hover:brightness-125 transition-all`}
                  >
                    {actor.actor}
                  </span>
                  <span className="text-white/20 text-[9px] font-medium tracking-widest uppercase">
                    {actor.actor_type}
                  </span>
                </div>
                <div
                  className={`text-[9px] font-black px-2 py-0.5 rounded-sm tracking-widest backdrop-blur-md ${threatBadgeBg(actor.threat_level)}`}
                >
                  <span className="opacity-50">INTEL:</span>{" "}
                  {actor.event_count.toLocaleString()}
                </div>
              </div>
            </button>
          ))}
          {loading && actors.length === 0 && (
            <div className="px-3 py-4 text-center text-white/20 text-[10px] tracking-wider">
              INDEXING ACTORS...
            </div>
          )}
        </div>
      </div>

      {/* SITREP Summary footer */}
      <div className="shrink-0 px-4 py-3 bg-black/70 border border-white/10 rounded-sm backdrop-blur-2xl shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-hud-green/5 to-transparent pointer-events-none" />

        <div className="text-[9px] text-white/40 font-black tracking-[.3em] uppercase mb-3 flex items-center gap-2">
          <div className="w-2 h-0.5 bg-hud-green/40" />
          SITREP SUMMARY
        </div>

        <div className="flex justify-between text-[10px] mb-4 relative z-10">
          <div className="flex flex-col gap-1">
            <span className="text-white/30 font-bold tracking-widest text-[8px] uppercase">
              HOT ZONES
            </span>
            <span className="text-red-500 font-black text-xs tabular-nums drop-shadow-[0_0_8px_rgba(239,68,68,0.3)]">
              {
                conflictZones.filter((z) => z.threat_level === "CRITICAL")
                  .length
              }
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-white/30 font-bold tracking-widest text-[8px] uppercase">
              MONITORING
            </span>
            <span className="text-amber-500 font-black text-xs tabular-nums drop-shadow-[0_0_8px_rgba(245,158,11,0.3)]">
              {
                actors.filter(
                  (a) =>
                    a.threat_level === "ELEVATED" ||
                    a.threat_level === "MONITORING",
                ).length
              }
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-white/30 font-bold tracking-widest text-[8px] uppercase">
              REPORTS
            </span>
            <span className="text-hud-green font-black text-xs tabular-nums drop-shadow-[0_0_8px_rgba(0,255,65,0.3)]">
              {actors.reduce((s, a) => s + a.event_count, 0).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Generate SITREP button */}
        {onGenerateSitrep && (
          <button
            onClick={handleSitrep}
            disabled={!actors.length}
            className={`w-full group relative flex items-center justify-center gap-3 px-4 py-2 rounded-sm text-[10px] font-black tracking-[.4em] transition-all overflow-hidden ${
              actors.length
                ? "bg-hud-green/10 border border-hud-green/40 text-hud-green hover:bg-hud-green/20 hover:shadow-[0_0_20px_rgba(0,255,65,0.2)]"
                : "bg-white/5 border border-white/10 text-white/20 cursor-not-allowed"
            }`}
          >
            <div className="absolute top-0 left-0 w-full h-[1px] bg-hud-green/30 group-hover:bg-hud-green/60 transition-all" />
            <FileText
              size={12}
              className="group-hover:scale-110 transition-transform"
            />
            <span className="uppercase">Generate AI Sitrep</span>
          </button>
        )}
      </div>
    </div>
  );
}
