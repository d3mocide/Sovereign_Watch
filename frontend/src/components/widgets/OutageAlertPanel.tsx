import { Globe } from "lucide-react";
import React, { useEffect, useState } from "react";

interface OutageItem {
  country: string;
  country_code: string;
  severity: number;
}

function severityColor(s: number): string {
  if (s >= 60) return "text-alert-red";
  if (s >= 25) return "text-amber-400";
  return "text-yellow-300";
}

function severityBarClass(s: number): string {
  if (s >= 60) return "bg-alert-red";
  if (s >= 25) return "bg-amber-400";
  return "bg-yellow-300";
}

export const OutageAlertPanel: React.FC = () => {
  const [outages, setOutages] = useState<OutageItem[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/infra/outages");
        if (r.ok) {
          const geojson = await r.json();
          const items: OutageItem[] = (geojson.features ?? [])
            .map(
              (f: {
                properties: {
                  country: string;
                  country_code: string;
                  severity: number;
                };
              }) => ({
                country: f.properties.country,
                country_code: f.properties.country_code,
                severity: f.properties.severity,
              }),
            )
            .sort((a: OutageItem, b: OutageItem) => b.severity - a.severity)
            .slice(0, 20);
          setOutages(items);
        }
      } catch {
        /* non-critical */
      }
    };
    load();
    const t = setInterval(load, 30 * 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-black/50 border-b border-white/5 flex-shrink-0">
        <Globe size={11} className="text-red-400/70" />
        <span className="text-[10px] font-bold tracking-widest uppercase text-white/55">
          Internet Outages
        </span>
        {outages.length > 0 && (
          <span className="ml-auto text-[9px] text-alert-red/60">
            {outages.length} regions
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {outages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[9px] text-white/15 uppercase tracking-widest">
            No Outages Detected
          </div>
        ) : (
          <div className="grid grid-cols-2 divide-x divide-white/[0.03]">
            {outages.map((o) => (
              <div
                key={o.country_code}
                className="px-2.5 py-1.5 border-b border-white/[0.03] hover:bg-white/5"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-white/50 w-6 flex-shrink-0 tabular-nums font-bold">
                    {o.country_code}
                  </span>
                  <span
                    className={`text-[9px] flex-1 truncate ${severityColor(o.severity)}`}
                  >
                    {o.country}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-0.5 pl-[1.875rem]">
                  <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${severityBarClass(o.severity)}`}
                      style={{ width: `${Math.min(100, o.severity)}%` }}
                    />
                  </div>
                  <span
                    className={`text-[8px] tabular-nums w-5 text-right flex-shrink-0 ${severityColor(o.severity)}`}
                  >
                    {Math.round(o.severity)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
