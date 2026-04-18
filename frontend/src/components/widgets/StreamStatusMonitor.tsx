import React, { useEffect, useState } from "react";

interface PollerHealth {
  id: string;
  name: string;
  group: string;
  status: string;
}

const DASHBOARD_STREAMS: Record<string, string> = {
  adsb: "ADSB",
  maritime: "AIS",
  orbital: "ORB",
  radioref: "RREF",
  rf_ard: "RF",
  ai: "AI",
};

function streamDotClass(status: string): string {
  if (status === "healthy" || status === "active") return "bg-hud-green shadow-[0_0_4px_#00ff41]";
  if (status === "stale" || status === "pending" || status === "no_credentials") return "bg-amber-400 shadow-[0_0_4px_#fbbf24]";
  if (status === "error") return "bg-alert-red shadow-[0_0_4px_#ff0000]";
  return "bg-white/20";
}

function streamTextClass(status: string): string {
  if (status === "healthy" || status === "active") return "text-hud-green";
  if (status === "stale" || status === "pending" || status === "no_credentials") return "text-amber-400";
  if (status === "error") return "text-alert-red";
  return "text-white/25";
}

export const StreamStatusMonitor: React.FC = () => {
  const [streamStatuses, setStreamStatuses] = useState<PollerHealth[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/config/poller-health");
        if (r.ok) {
          const data: PollerHealth[] = await r.json();
          const relevant = data.filter((s) => DASHBOARD_STREAMS[s.id]);
          const order = Object.keys(DASHBOARD_STREAMS);
          relevant.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
          setStreamStatuses(relevant);
        }
      } catch {
        /* non-critical */
      }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-white/25 uppercase tracking-widest">
        Streams
      </span>
      <div className="flex items-center gap-1">
        {streamStatuses.length === 0 ? (
          <span className="text-[8px] text-white/15">—</span>
        ) : (
          streamStatuses.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-0.5"
              title={`${s.name}: ${s.status}`}
            >
              <div
                className={`h-1.5 w-1.5 rounded-full ${streamDotClass(s.status)}`}
              />
              <span className={`text-[9px] ${streamTextClass(s.status)}`}>
                {DASHBOARD_STREAMS[s.id]}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
