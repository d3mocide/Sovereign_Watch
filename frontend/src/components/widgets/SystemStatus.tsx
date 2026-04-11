import React, { useState } from "react";
import { MapFilters } from "../../types";
import { IntegrationStatus } from "./IntegrationStatus";
import { LayerVisibilityControls } from "./LayerVisibilityControls";

interface SystemStatusProps {
  trackCounts: { air: number; sea: number; orbital?: number };
  filters?: MapFilters;
  onFilterChange?: (key: string, value: boolean | number) => void;
}

export const SystemStatus: React.FC<SystemStatusProps> = ({
  trackCounts,
  filters,
  onFilterChange,
}) => {
  const [integrations, setIntegrations] = useState<{
    radioref_enabled?: boolean;
  } | null>(null);

  React.useEffect(() => {
    fetch("/api/config/features")
      .then((res) => res.json())
      .then((data) => setIntegrations(data))
      .catch(console.error);
  }, []);

  const orbitalCount = trackCounts.orbital || 0;
  const total = trackCounts.air + trackCounts.sea + orbitalCount;
  const airPercent = total > 0 ? (trackCounts.air / total) * 100 : 0;
  const seaPercent = total > 0 ? (trackCounts.sea / total) * 100 : 0;
  const orbitalPercent = total > 0 ? (orbitalCount / total) * 100 : 0;

  return (
    <div className="flex flex-col overflow-hidden widget-panel">
      <LayerVisibilityControls
        filters={filters}
        onFilterChange={onFilterChange}
        radiorefEnabled={integrations?.radioref_enabled}
      />

      <div className="p-3 space-y-3">
        {/* Compact Headers & Counts */}
        <div className="flex items-end justify-between">
          <div className="flex flex-col">
            <span className="text-[9px] text-white/40 font-bold tracking-widest uppercase mb-1">
              Total Tracking
            </span>
            <span className="text-xl font-bold text-hud-green tabular-nums leading-none">
              {total}
            </span>
          </div>

          <div className="flex gap-4 text-right">
            <div className="flex flex-col items-end">
              <span className="text-[8px] text-air-accent uppercase font-bold tracking-wider">
                Aviation
              </span>
              <span className="text-sm font-bold text-white/90 tabular-nums leading-none">
                {trackCounts.air}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[8px] text-sea-accent uppercase font-bold tracking-wider">
                Maritime
              </span>
              <span className="text-sm font-bold text-white/90 tabular-nums leading-none">
                {trackCounts.sea}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[8px] text-purple-400 uppercase font-bold tracking-wider">
                Orbital
              </span>
              <span className="text-sm font-bold text-white/90 tabular-nums leading-none">
                {orbitalCount}
              </span>
            </div>
          </div>
        </div>

        {/* Visual Bar */}
        <div className="h-1.5 w-full bg-white/10 rounded-full flex overflow-hidden">
          <div
            className="h-full bg-air-accent transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(0,255,65,0.5)]"
            style={{ width: `${airPercent}%` }}
          />
          <div
            className="h-full bg-sea-accent transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(0,255,255,0.5)]"
            style={{ width: `${seaPercent}%` }}
          />
          <div
            className="h-full bg-purple-400 transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(168,85,247,0.5)]"
            style={{ width: `${orbitalPercent}%` }}
          />
        </div>
      </div>

      <IntegrationStatus />
      
          </div>
  );
};
