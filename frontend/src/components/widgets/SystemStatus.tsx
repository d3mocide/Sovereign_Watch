import React, { useState } from 'react';
import { Database, ShieldCheck, ChevronDown, ChevronUp, Radio } from 'lucide-react';
import { MapFilters } from '../../types';

interface SystemStatusProps {
  trackCounts: { air: number; sea: number; orbital?: number };
  filters?: MapFilters;
  onFilterChange?: (key: string, value: boolean) => void;
}

export const SystemStatus: React.FC<SystemStatusProps> = ({ trackCounts, filters, onFilterChange }) => {
  const [showLayers, setShowLayers] = useState(false);

  const orbitalCount = trackCounts.orbital || 0;
  const total = trackCounts.air + trackCounts.sea + orbitalCount;
  const airPercent = total > 0 ? (trackCounts.air / total) * 100 : 0;
  const seaPercent = total > 0 ? (trackCounts.sea / total) * 100 : 0;
  const orbitalPercent = total > 0 ? (orbitalCount / total) * 100 : 0;

  // Active layers count for the indicator if needed
  const activeLayersCount = filters ? [filters.showRepeaters].filter(Boolean).length : 0;

  return (
    <div className="flex flex-col rounded-sm border border-tactical-border bg-black/40 backdrop-blur-md shadow-inner overflow-hidden">
      {/* System Status Header with Layers toggle */}
      <div className="flex items-center justify-between border-b border-tactical-border bg-white/5 px-3 py-2 cursor-pointer hover:bg-white/10 transition-colors"
        onClick={() => setShowLayers(!showLayers)}>
        <div className="flex flex-col">
          <span className="text-[9px] text-white/40 font-bold tracking-widest uppercase">Map Layers</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Quick layer toggle icon */}
          {filters && onFilterChange && (
            <div className="flex items-center gap-2 mr-2">
              <button
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onFilterChange('showRepeaters', !filters.showRepeaters);
                }}
                className={`p-1 rounded transition-colors ${filters.showRepeaters
                  ? 'bg-teal-400/20 text-teal-400 border border-teal-400/30'
                  : 'text-white/30 hover:text-white/70 hover:bg-white/5 border border-transparent'
                  }`}
                title="Toggle Amateur Radio Repeaters"
              >
                <Radio size={12} className={filters.showRepeaters ? 'animate-pulse' : ''} />
              </button>
            </div>
          )}

          {showLayers ? (
            <ChevronUp size={14} className="text-white/40 group-hover:text-white/70 transition-colors" />
          ) : (
            <ChevronDown size={14} className="text-white/40 group-hover:text-white/70 transition-colors" />
          )}
        </div>
      </div>

      {showLayers && filters && onFilterChange && (
        <div className="p-2 space-y-2 border-b border-tactical-border bg-black/60">
          {/* RF Infrastructure Toggle Detail */}
          <div
            className={`flex items-center justify-between p-2 rounded border transition-colors cursor-pointer group ${filters.showRepeaters
              ? 'bg-teal-400/10 border-teal-400/30 text-teal-400'
              : 'bg-black/40 border-white/5 text-white/50 hover:bg-white/5 hover:text-white/80'
              }`}
            onClick={() => onFilterChange('showRepeaters', !filters.showRepeaters)}
          >
            <div className="flex items-center gap-3">
              <Radio size={14} className={filters.showRepeaters ? 'text-teal-400 animate-pulse' : 'text-white/30 group-hover:text-white/50'} />
              <div className="flex flex-col">
                <span className="text-mono-sm font-bold tracking-wider uppercase">RF Infrastructure</span>
                <span className="text-[9px] font-mono opacity-60">Amateur Radio Repeaters, Coverage area: ~75km</span>
              </div>
            </div>
            <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${filters.showRepeaters ? 'bg-teal-400/30' : 'bg-white/10'}`}>
              <div className={`w-3 h-3 rounded-full bg-current transition-transform ${filters.showRepeaters ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
          </div>
        </div>
      )}

      <div className="p-3 space-y-3">
        {/* Compact Headers & Counts */}
        <div className="flex items-end justify-between">
          <div className="flex flex-col">
            <span className="text-[9px] text-white/40 font-bold tracking-widest uppercase mb-1">Total Objects</span>
            <span className="text-xl font-bold text-hud-green tabular-nums leading-none">{total}</span>
          </div>

          <div className="flex gap-4 text-right">
            <div className="flex flex-col items-end">
              <span className="text-[8px] text-air-accent uppercase font-bold tracking-wider">Aviation</span>
              <span className="text-sm font-bold text-white/90 tabular-nums leading-none">{trackCounts.air}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[8px] text-sea-accent uppercase font-bold tracking-wider">Maritime</span>
              <span className="text-sm font-bold text-white/90 tabular-nums leading-none">{trackCounts.sea}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[8px] text-purple-400 uppercase font-bold tracking-wider">Orbital</span>
              <span className="text-sm font-bold text-white/90 tabular-nums leading-none">{orbitalCount}</span>
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

      {/* System Footer Info (Compact) */}
      <div className="flex items-center justify-between border-t border-tactical-border bg-white/5 px-3 py-1.5 opacity-50">
        <div className="flex items-center gap-1.5">
          <Database size={9} className="text-hud-green" />
          <span className="text-[8px] font-mono text-white/60">DB: CONNECTED</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={9} className="text-hud-green" />
          <span className="text-[8px] font-mono text-white/60">SECURE_LINK</span>
        </div>
      </div>
    </div>
  );
};
