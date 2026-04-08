import { AlertTriangle } from "lucide-react";
import React, { useEffect, useState } from "react";

interface ActorEntry {
  actor: string;
  event_count: number;
  avg_goldstein: number;
  threat_level: "CRITICAL" | "ELEVATED" | "MONITORING" | "STABLE";
  material_conflict: number;
}

function threatColor(level: ActorEntry["threat_level"]): string {
  switch (level) {
    case "CRITICAL":
      return "text-red-400";
    case "ELEVATED":
      return "text-amber-400";
    default:
      return "text-yellow-400";
  }
}

function threatBadge(level: ActorEntry["threat_level"]): string {
  switch (level) {
    case "CRITICAL":
      return "bg-red-500/20 text-red-300 border border-red-500/40";
    case "ELEVATED":
      return "bg-amber-500/20 text-amber-300 border border-amber-500/40";
    default:
      return "bg-yellow-500/15 text-yellow-300 border border-yellow-500/30";
  }
}

export const ActiveConflictWidget: React.FC = () => {
  const [zones, setZones] = useState<ActorEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/gdelt/actors?limit=40&hours=24");
        if (r.ok) {
          const data: ActorEntry[] = await r.json();
          setZones(
            data.filter(
              (a) =>
                a.threat_level === "CRITICAL" || a.threat_level === "ELEVATED",
            ),
          );
        }
      } catch {
        /* non-critical */
      } finally {
        setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-black/50 border-b border-white/5 flex-shrink-0">
        <AlertTriangle size={11} className="text-red-400/70" />
        <span className="text-[10px] font-bold tracking-widest uppercase text-white/55">
          Active Conflict Zones
        </span>
        {zones.length > 0 && (
          <span className="ml-auto text-[9px] text-red-400/60">
            {zones.length} active
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && zones.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[9px] text-white/15 uppercase tracking-widest">
            Scanning OSINT Feed...
          </div>
        ) : zones.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[9px] text-white/15 uppercase tracking-widest">
            No Active Conflict Zones
          </div>
        ) : (
          zones.map((zone, i) => (
            <div
              key={zone.actor}
              className="px-3 py-1.5 border-b border-white/[0.03] hover:bg-white/5"
            >
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-white/20 w-4 flex-shrink-0 tabular-nums font-bold text-right">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={`text-[9px] flex-1 truncate font-bold ${threatColor(zone.threat_level)}`}
                >
                  {zone.actor}
                </span>
                <span
                  className={`text-[7px] font-black px-1 py-px rounded-sm tracking-[.1em] uppercase flex-shrink-0 ${threatBadge(zone.threat_level)}`}
                >
                  {zone.threat_level === "CRITICAL" ? "CRIT" : "ELEV"}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-0.5 pl-6">
                <span className="text-white/25 text-[8px] tabular-nums">
                  {zone.event_count.toLocaleString()} RPTS
                </span>
                {zone.material_conflict > 0 && (
                  <span className="text-red-400/60 text-[8px] tabular-nums">
                    ⚡{zone.material_conflict}
                  </span>
                )}
                <span className="text-white/15 text-[8px] tabular-nums ml-auto">
                  GS {zone.avg_goldstein.toFixed(1)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
