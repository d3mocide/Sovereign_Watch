/**
 * IntelSidebar — Left panel for the INTEL globe view.
 *
 * Sections:
 *  1. Header — title, refresh, time window, map style, spin toggle
 *  2. ACTIVE CONFLICT ZONES — countries ranked by event count + threat level
 *  3. ACTIVE ACTORS — actor list with intel score badge
 *  4. SITREP SUMMARY footer — hot zones count + GENERATE SITREP button
 */
import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle,
  Activity,
  Globe2,
  RefreshCw,
  Layers,
  RotateCcw,
  FileText,
} from "lucide-react";
import { type MapStyleKey, MAP_STYLE_LABELS } from "../map/intelMapStyles";

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
  mapStyle?: MapStyleKey;
  onMapStyleChange?: (style: MapStyleKey) => void;
  spin?: boolean;
  onSpinToggle?: () => void;
  /** Called with a pre-formatted context string when the user requests a SITREP. */
  onGenerateSitrep?: (context: string) => void;
}

function threatColor(level: ActorEntry["threat_level"]): string {
  switch (level) {
    case "CRITICAL":   return "text-red-400";
    case "ELEVATED":   return "text-amber-400";
    case "MONITORING": return "text-yellow-400";
    default:           return "text-hud-green/60";
  }
}

function threatBorderColor(level: ActorEntry["threat_level"]): string {
  switch (level) {
    case "CRITICAL":   return "border-red-500/40";
    case "ELEVATED":   return "border-amber-500/40";
    case "MONITORING": return "border-yellow-500/40";
    default:           return "border-white/10";
  }
}

function threatBadgeBg(level: ActorEntry["threat_level"]): string {
  switch (level) {
    case "CRITICAL":   return "bg-red-500/20 text-red-300 border border-red-500/40";
    case "ELEVATED":   return "bg-amber-500/20 text-amber-300 border border-amber-500/40";
    case "MONITORING": return "bg-yellow-500/15 text-yellow-300 border border-yellow-500/30";
    default:           return "bg-white/5 text-white/40 border border-white/10";
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
      (a) => `  ${a.actor} — ${a.event_count} events, Goldstein avg ${a.avg_goldstein.toFixed(1)}`,
    ),
    ``,
    `TOP ACTORS BY EVENT COUNT:`,
    ...actors.slice(0, 8).map(
      (a) => `  ${a.actor} (${a.threat_level}): ${a.event_count} total, ${a.verbal_conflict} verbal conflict, ${a.material_conflict} material conflict`,
    ),
  ];

  return lines.join("\n");
}

export function IntelSidebar({
  onFlyTo,
  mapStyle = "dark",
  onMapStyleChange,
  spin = false,
  onSpinToggle,
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

  const formatTime = (d: Date) =>
    d.toISOString().split("T")[1].split(".")[0];

  const handleSitrep = useCallback(() => {
    if (!onGenerateSitrep || !actors.length) return;
    onGenerateSitrep(buildSitrepContext(actors, timeWindow));
  }, [onGenerateSitrep, actors, timeWindow]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden font-mono text-xs select-none">

      {/* Header */}
      <div className="shrink-0 px-3 py-2 bg-black/40 border border-hud-green/20 backdrop-blur-md rounded-sm">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Globe2 size={12} className="text-hud-green" />
            <span className="text-hud-green font-black tracking-widest text-[10px]">
              INTEL // OSINT GLOBE
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Globe spin toggle */}
            {onSpinToggle && (
              <button
                onClick={onSpinToggle}
                title={spin ? "Pause globe rotation" : "Start globe rotation"}
                className={`p-0.5 rounded-sm transition-colors ${
                  spin
                    ? "text-hud-green border border-hud-green/40 bg-hud-green/10"
                    : "text-white/30 hover:text-hud-green border border-transparent"
                }`}
              >
                <RotateCcw
                  size={10}
                  className={spin ? "animate-spin-slow" : ""}
                />
              </button>
            )}
            <button
              onClick={() => fetchActors(true)}
              className="p-0.5 text-white/30 hover:text-hud-green transition-colors"
              title="Refresh actor data"
            >
              <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        {lastUpdated && (
          <div className="text-[9px] text-white/30 tracking-wider">
            UPDATED // {formatTime(lastUpdated)} UTC
          </div>
        )}

        {/* Time window selector */}
        <div className="flex items-center gap-1 mt-2">
          <span className="text-[9px] text-white/30 tracking-wider">WINDOW:</span>
          {([24, 48, 72] as const).map((h) => (
            <button
              key={h}
              onClick={() => setTimeWindow(h)}
              className={`px-1.5 py-0.5 text-[9px] font-bold tracking-wider rounded-sm transition-colors ${
                timeWindow === h
                  ? "bg-hud-green/20 text-hud-green border border-hud-green/40"
                  : "text-white/30 hover:text-white/60 border border-white/10"
              }`}
            >
              {h}H
            </button>
          ))}
        </div>

        {/* Map style selector */}
        {onMapStyleChange && (
          <div className="flex items-center gap-1 mt-1.5">
            <Layers size={9} className="text-white/30 shrink-0" />
            <span className="text-[9px] text-white/30 tracking-wider shrink-0">STYLE:</span>
            {(Object.keys(MAP_STYLE_LABELS) as MapStyleKey[]).map((key) => (
              <button
                key={key}
                onClick={() => onMapStyleChange(key)}
                className={`px-1.5 py-0.5 text-[9px] font-bold tracking-wider rounded-sm transition-colors ${
                  key === mapStyle
                    ? "bg-hud-green/20 text-hud-green border border-hud-green/40"
                    : "text-white/30 hover:text-white/60 border border-white/10"
                }`}
              >
                {MAP_STYLE_LABELS[key].split(" ")[0]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Conflict Zones */}
      <div className="flex flex-col min-h-0 bg-black/40 border border-hud-green/15 backdrop-blur-md rounded-sm overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <AlertTriangle size={11} className="text-red-400" />
            <span className="text-[10px] font-black tracking-widest text-white/80">
              ACTIVE CONFLICT ZONES
            </span>
            <span className="text-[9px] text-red-400 font-bold">
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
                  <div className="flex items-center gap-2">
                    <span className="text-white/20 text-[9px] w-4 text-right shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className={`font-black tracking-wider text-[10px] ${threatColor(zone.threat_level)} group-hover:brightness-125`}>
                      {zone.actor}
                    </span>
                  </div>
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-sm tracking-wider ${threatBadgeBg(zone.threat_level)}`}>
                    {zone.threat_level}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 pl-6">
                  <span className="text-white/30 text-[9px]">
                    {zone.event_count} REPORTS
                  </span>
                  {zone.material_conflict > 0 && (
                    <span className="text-red-400/70 text-[9px]">
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
      <div className="flex flex-col min-h-0 bg-black/40 border border-hud-green/15 backdrop-blur-md rounded-sm overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Activity size={11} className="text-hud-green/70" />
            <span className="text-[10px] font-black tracking-widest text-white/80">
              ACTIVE ACTORS
            </span>
            <span className="text-[9px] text-hud-green/60 font-bold">
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
                <div className="flex items-center gap-2">
                  <span className={`font-bold tracking-wider text-[10px] ${threatColor(actor.threat_level)} group-hover:brightness-125`}>
                    {actor.actor}
                  </span>
                  <span className="text-white/20 text-[9px]">
                    {actor.actor_type}
                  </span>
                </div>
                <div className={`text-[8px] font-black px-1.5 py-0.5 rounded-sm tracking-widest ${threatBadgeBg(actor.threat_level)}`}>
                  INTEL: {actor.event_count}
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
      <div className="shrink-0 px-3 py-2 bg-black/30 border border-white/10 rounded-sm backdrop-blur-md">
        <div className="text-[9px] text-white/30 tracking-wider mb-1.5">
          ▶ SITREP SUMMARY
        </div>
        <div className="flex justify-between text-[9px] mb-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-white/40">HOT ZONES</span>
            <span className="text-red-400 font-bold">
              {conflictZones.filter((z) => z.threat_level === "CRITICAL").length}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-white/40">MONITORING</span>
            <span className="text-amber-400 font-bold">
              {actors.filter((a) => a.threat_level === "ELEVATED" || a.threat_level === "MONITORING").length}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-white/40">REPORTS</span>
            <span className="text-hud-green font-bold">
              {actors.reduce((s, a) => s + a.event_count, 0)}
            </span>
          </div>
        </div>

        {/* Generate SITREP button */}
        {onGenerateSitrep && (
          <button
            onClick={handleSitrep}
            disabled={!actors.length}
            className={`w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-sm text-[9px] font-black tracking-widest transition-all ${
              actors.length
                ? "bg-hud-green/10 border border-hud-green/40 text-hud-green hover:bg-hud-green/20 hover:shadow-[0_0_12px_rgba(0,255,65,0.2)]"
                : "bg-white/5 border border-white/10 text-white/20 cursor-not-allowed"
            }`}
          >
            <FileText size={10} />
            GENERATE AI SITREP
          </button>
        )}
      </div>
    </div>
  );
}
