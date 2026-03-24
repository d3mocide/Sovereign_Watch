import React, { useEffect, useState } from "react";

interface StreamStatus {
  id: string;
  name: string;
  status: string;
}

const STREAM_ABBR: Record<string, string> = {
  aviation: "ADSB",
  maritime: "AIS",
  orbital: "ORB",
  radioref: "RREF",
  rf_public: "RF",
  ai: "AI",
};

function streamDotClass(status: string): string {
  if (status === "Active") return "bg-hud-green shadow-[0_0_4px_#00ff41]";
  if (status === "Missing Key") return "bg-amber-400 shadow-[0_0_4px_#fbbf24]";
  return "bg-white/20";
}

function streamTextClass(status: string): string {
  if (status === "Active") return "text-hud-green";
  if (status === "Missing Key") return "text-amber-400";
  return "text-white/25";
}

export const StreamStatusMonitor: React.FC = () => {
  const [streamStatuses, setStreamStatuses] = useState<StreamStatus[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/config/streams");
        if (r.ok) setStreamStatuses(await r.json());
      } catch {
        /* non-critical */
      }
    };
    load();
    const t = setInterval(load, 60_000);
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
                {STREAM_ABBR[s.id] ?? s.id.toUpperCase()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
