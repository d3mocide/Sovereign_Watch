import { FeatureCollection } from "geojson";
import { Activity, Globe, ShieldAlert, Thermometer, Zap } from "lucide-react";
import React, { useMemo } from "react";

interface GdeltBreakdownWidgetProps {
  gdeltData: FeatureCollection | null;
}

export const GdeltBreakdownWidget: React.FC<GdeltBreakdownWidgetProps> = ({
  gdeltData,
}) => {
  const breakdown = useMemo(() => {
    if (!gdeltData?.features) return null;

    const stats = {
      conflict: 0, // Tone <= -5
      tension: 0, // -5 < Tone <= -2
      unstable: 0, // -2 < Tone < 0
      stable: 0, // Tone >= 0
      total: gdeltData.features.length,
      avgTone: 0,
    };

    let toneSum = 0;
    gdeltData.features.forEach((f: any) => {
      const tone = f.properties?.tone ?? 0;
      toneSum += tone;
      if (tone <= -5) stats.conflict++;
      else if (tone <= -2) stats.tension++;
      else if (tone < 0) stats.unstable++;
      else stats.stable++;
    });

    stats.avgTone = stats.total > 0 ? toneSum / stats.total : 0;
    return stats;
  }, [gdeltData]);

  if (!breakdown) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-white/20">
        <Activity size={24} className="animate-pulse" />
        <span className="text-[10px] tracking-widest uppercase">
          Initializing Global Monitor...
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-black/40">
      <div className="grid grid-cols-2 gap-2 p-3 pb-0">
        <div className="bg-white/[0.03] border border-white/5 p-2 rounded">
          <span className="text-[8px] text-white/30 block mb-1">
            GLOBAL INTEL PULSE
          </span>
          <div className="flex items-end gap-1">
            <span className="text-xl font-bold text-hud-green tabular-nums leading-none">
              {breakdown.total}
            </span>
            <span className="text-[9px] text-white/50 mb-0.5">EVENTS</span>
          </div>
        </div>
        <div className="bg-white/[0.03] border border-white/5 p-2 rounded">
          <span className="text-[8px] text-white/30 block mb-1">
            AVG STABILITY
          </span>
          <div className="flex items-end gap-1">
            <span
              className={`text-xl font-bold tabular-nums leading-none ${breakdown.avgTone < -1 ? "text-red-400" : "text-hud-green"}`}
            >
              {breakdown.avgTone.toFixed(2)}
            </span>
            <span className="text-[9px] text-white/50 mb-0.5">GS</span>
          </div>
        </div>
      </div>

      <div className="px-3 py-3 space-y-2">
        {/* Conflict */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 bg-red-600 rounded-full" />
          <div className="flex-1">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-bold text-red-500 uppercase tracking-tighter flex items-center gap-1">
                <ShieldAlert size={10} /> Kinetic / Conflict
              </span>
              <span className="text-[10px] text-red-400 font-mono font-bold">
                {((breakdown.conflict / breakdown.total) * 100).toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.5)]"
                style={{
                  width: `${(breakdown.conflict / breakdown.total) * 100}%`,
                }}
              />
            </div>
            <span className="text-[8px] text-white/30 mt-1 block uppercase">
              {breakdown.conflict} active incidents (Tone ≤ -5.0)
            </span>
          </div>
        </div>

        {/* Tension */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 bg-amber-500 rounded-full" />
          <div className="flex-1">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-tighter flex items-center gap-1">
                <Thermometer size={10} /> Political Tension
              </span>
              <span className="text-[10px] text-amber-400 font-mono font-bold">
                {((breakdown.tension / breakdown.total) * 100).toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500"
                style={{
                  width: `${(breakdown.tension / breakdown.total) * 100}%`,
                }}
              />
            </div>
            <span className="text-[8px] text-white/30 mt-1 block uppercase">
              {breakdown.tension} reported escalations
            </span>
          </div>
        </div>

        {/* Unstable */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 bg-hud-green/40 rounded-full" />
          <div className="flex-1">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-bold text-hud-green uppercase tracking-tighter flex items-center gap-1 opacity-60">
                <Globe size={10} /> Volatile / Unstable
              </span>
              <span className="text-[10px] text-hud-green/60 font-mono">
                {((breakdown.unstable / breakdown.total) * 100).toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-hud-green/30"
                style={{
                  width: `${(breakdown.unstable / breakdown.total) * 100}%`,
                }}
              />
            </div>
            <span className="text-[8px] text-white/20 mt-1 block uppercase">
              {breakdown.unstable} mixed indicators
            </span>
          </div>
        </div>

        {/* Stable */}
        <div className="flex items-center gap-3 opacity-40">
          <div className="h-8 w-1 bg-hud-green rounded-full" />
          <div className="flex-1">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-bold text-hud-green uppercase tracking-tighter flex items-center gap-1">
                <Zap size={10} /> Stability Indicators
              </span>
              <span className="text-[10px] text-hud-green/80 font-mono">
                {((breakdown.stable / breakdown.total) * 100).toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-hud-green"
                style={{
                  width: `${(breakdown.stable / breakdown.total) * 100}%`,
                }}
              />
            </div>
            <span className="text-[8px] text-white/20 mt-1 block uppercase">
              {breakdown.stable} cooperative events
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
