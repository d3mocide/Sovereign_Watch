import React, { useState } from 'react';
import { Database, ShieldCheck, ChevronDown, ChevronUp, Radio, Network, ChevronRight, Layers } from 'lucide-react';
import { MapFilters } from '../../types';

interface SystemStatusProps {
  trackCounts: { air: number; sea: number; orbital?: number };
  filters?: MapFilters;
  onFilterChange?: (key: string, value: boolean) => void;
}

export const SystemStatus: React.FC<SystemStatusProps> = ({ trackCounts, filters, onFilterChange }) => {
  const [showLayers, setShowLayers] = useState(false);
  const [infraExpanded, setInfraExpanded] = useState(false);
  const [rfExpanded, setRfExpanded] = useState(false);
  const [integrations, setIntegrations] = useState<{ repeaterbook_enabled?: boolean; radioref_enabled?: boolean } | null>(null);

  React.useEffect(() => {
    fetch('/api/config/features')
      .then(res => res.json())
      .then(data => setIntegrations(data))
      .catch(console.error);
  }, []);

  const orbitalCount = trackCounts.orbital || 0;
  const total = trackCounts.air + trackCounts.sea + orbitalCount;
  const airPercent = total > 0 ? (trackCounts.air / total) * 100 : 0;
  const seaPercent = total > 0 ? (trackCounts.sea / total) * 100 : 0;
  const orbitalPercent = total > 0 ? (orbitalCount / total) * 100 : 0;

  return (
    <div className="flex flex-col overflow-hidden widget-panel">
      {/* System Status Header with Layers toggle */}
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-2 cursor-pointer transition-colors"
        onClick={() => setShowLayers(!showLayers)}>
        <div className="flex items-center gap-2">
          <Layers size={13} className="text-cyan-400" />
          <span className="text-[10px] font-bold tracking-[.3em] text-white/50 uppercase">
            Map Layers
          </span>
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
                className={`p-1 rounded transition-colors focus-visible:ring-1 focus-visible:ring-amber-400 outline-none ${filters.showRepeaters
                  ? 'bg-amber-400/20 text-amber-400 border border-amber-400/30'
                  : 'text-white/30 hover:text-white/70 hover:bg-white/5 border border-transparent'
                  }`}
                title="Toggle Amateur Radio Repeaters"
              >
                <Radio size={12} className={filters.showRepeaters ? 'animate-pulse' : ''} />
              </button>
              <button
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  const isCurrentlyOn = filters.showCables !== false;
                  // If turning ON: only turn on cables (landing stations default to OFF)
                  // If turning OFF: turn off both for clean map state
                  if (isCurrentlyOn) {
                    onFilterChange('showCables', false);
                    onFilterChange('showLandingStations', false);
                  } else {
                    onFilterChange('showCables', true);
                  }
                }}
                className={`p-1 rounded transition-colors focus-visible:ring-1 focus-visible:ring-hud-green outline-none ${filters.showCables !== false
                  ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/30'
                  : 'text-white/30 hover:text-white/70 hover:bg-white/5 border border-transparent'
                  }`}
                title="Toggle Submarine Cables"
              >
                <Network size={12} className={filters.showCables !== false ? 'animate-pulse' : ''} />
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
        <div className="p-2 space-y-2 border-b border-white/10 bg-black/60 max-h-[60vh] overflow-y-auto">
          {/* RF Infrastructure Filter */}
          <div className="flex flex-col gap-1">
            <div className={`group flex items-center justify-between rounded border transition-all ${filters.showRepeaters ? 'border-amber-400/30 bg-amber-400/10' : 'border-white/5 bg-white/5 hover:bg-white/10'}`}>
              <div
                className="flex flex-1 items-center justify-between p-2 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setRfExpanded(!rfExpanded);
                }}
              >
                <div className="flex items-center gap-3">
                  <Radio size={14} className={filters.showRepeaters ? 'text-amber-400 animate-pulse' : 'text-white/30 group-hover:text-white/50'} />
                  <div className="flex flex-col">
                    <span className="text-mono-sm font-bold tracking-wider uppercase text-white/90">RF Infrastructure</span>
                    <span className="text-[9px] font-mono text-amber-400/60">Ham / NOAA / Public Safety</span>
                  </div>
                </div>
                <div className="w-4 flex justify-center transition-transform duration-200 shrink-0" style={{ transform: rfExpanded ? 'rotate(90deg)' : 'none' }}>
                  <ChevronRight size={14} className="text-white/40" />
                </div>
              </div>
              <div className="border-l border-white/10 p-2" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" className="sr-only" checked={filters.showRepeaters} onChange={() => onFilterChange('showRepeaters', !filters.showRepeaters)} />
                <div
                  className={`h-3 w-6 cursor-pointer rounded-full transition-colors relative ${filters.showRepeaters ? 'bg-amber-400' : 'bg-white/10 hover:bg-white/20'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFilterChange('showRepeaters', !filters.showRepeaters);
                  }}
                >
                  <div className={`absolute top-0.5 h-2 w-2 rounded-full bg-black transition-all ${filters.showRepeaters ? 'left-3.5' : 'left-0.5'}`} />
                </div>
              </div>
            </div>

            {/* Sub-filters for RF Infrastructure */}
            {rfExpanded && (
              <div className="flex flex-col gap-1 px-1 pl-3">
                <div className="flex items-center gap-2 mb-1 mt-1">
                  <span className="text-[9px] font-bold text-white/40 tracking-wider uppercase">Services</span>
                </div>
                <div className="flex flex-row gap-1">
                  {/* Ham / GMRS */}
                  <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.showHam !== false
                      ? 'border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_8px_rgba(16,185,129,0.2)]'
                      : 'border-white/5 bg-white/5 hover:bg-white/10'
                    }`}>
                    <span className={`text-[9px] font-bold tracking-tight ${filters.showHam !== false ? 'text-emerald-400' : 'text-emerald-400/30'}`}>HAM</span>
                    <input type="checkbox" className="sr-only" checked={filters.showHam !== false} onChange={() => onFilterChange('showHam', filters.showHam === false)} />
                    <div className={`h-1.5 w-3 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showHam !== false ? 'bg-emerald-400' : 'bg-white/10'}`}>
                      <div className={`absolute top-0.25 h-1 w-1 rounded-full bg-black transition-all ${filters.showHam !== false ? 'left-1.75' : 'left-0.25'}`} />
                    </div>
                  </label>

                  {/* NOAA NWR */}
                  <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.showNoaa !== false
                      ? 'border-sky-500/50 bg-sky-500/10 shadow-[0_0_8px_rgba(56,189,248,0.2)]'
                      : 'border-white/5 bg-white/5 hover:bg-white/10'
                    }`}>
                    <span className={`text-[9px] font-bold tracking-tight ${filters.showNoaa !== false ? 'text-sky-400' : 'text-sky-400/30'}`}>NOAA</span>
                    <input type="checkbox" className="sr-only" checked={filters.showNoaa !== false} onChange={() => onFilterChange('showNoaa', filters.showNoaa === false)} />
                    <div className={`h-1.5 w-3 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showNoaa !== false ? 'bg-sky-400' : 'bg-white/10'}`}>
                      <div className={`absolute top-0.25 h-1 w-1 rounded-full bg-black transition-all ${filters.showNoaa !== false ? 'left-1.75' : 'left-0.25'}`} />
                    </div>
                  </label>

                  {/* Public Safety */}
                  {integrations?.radioref_enabled !== false && (
                    <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.showPublicSafety !== false
                        ? 'border-amber-500/50 bg-amber-500/10 shadow-[0_0_8px_rgba(251,191,36,0.2)]'
                        : 'border-white/5 bg-white/5 hover:bg-white/10'
                      }`}>
                      <span className={`text-[9px] font-bold tracking-tight ${filters.showPublicSafety !== false ? 'text-amber-400' : 'text-amber-400/30'}`}>PSB</span>
                      <input type="checkbox" className="sr-only" checked={filters.showPublicSafety !== false} onChange={() => onFilterChange('showPublicSafety', filters.showPublicSafety === false)} />
                      <div className={`h-1.5 w-3 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showPublicSafety !== false ? 'bg-amber-400' : 'bg-white/10'}`}>
                        <div className={`absolute top-0.25 h-1 w-1 rounded-full bg-black transition-all ${filters.showPublicSafety !== false ? 'left-1.75' : 'left-0.25'}`} />
                      </div>
                    </label>
                  )}
                </div>
                {/* RF Range Buttons */}
                <div className="mt-2 mb-2 p-1 border border-white/5 bg-white/5 rounded">
                  <div className="flex items-center justify-between gap-1 mb-1 px-1">
                    <span className="text-[9px] font-bold text-white/40 tracking-wider">RANGE</span>
                    <span className="text-[9px] font-bold text-amber-400/80">{filters.rfRadius || 300} NM</span>
                  </div>
                  <div className="flex w-full gap-1">
                    {[100, 500, 1000, 2000].map(dist => (
                      <button
                        key={dist}
                        className={`flex-1 py-1 text-[9px] font-bold rounded border transition-all ${(filters.rfRadius || 300) === dist
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-[0_0_8px_rgba(251,191,36,0.3)]'
                          : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10 hover:text-white/60'
                          }`}
                        onClick={() => onFilterChange('rfRadius', dist)}
                      >
                        {dist > 999 ? `${dist / 1000}K` : dist}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Modes Filter - only when Ham is selected */}
                {filters.showHam !== false && integrations?.repeaterbook_enabled !== false && (
                  <div className="mt-2 pl-2 border-l border-white/10">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-bold text-white/40 tracking-wider">MODES</span>
                    </div>
                    {/* EMCOMM Only */}
                    <label className={`group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.rfEmcommOnly ? 'border-red-400/20 bg-red-400/5' : 'border-white/5 bg-white/5'} mb-1`}>
                      <span className={`text-[8px] font-bold tracking-wide ${filters.rfEmcommOnly ? 'text-red-400/80' : 'text-red-400/30'}`}>EMCOMM ONLY</span>
                      <input type="checkbox" className="sr-only" checked={filters.rfEmcommOnly || false} onChange={(e) => onFilterChange('rfEmcommOnly', e.target.checked)} />
                      <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.rfEmcommOnly ? 'bg-red-400/80' : 'bg-white/10'}`}><div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.rfEmcommOnly ? 'left-2.5' : 'left-0.5'}`} /></div>
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Infra Filter */}
          <div className="flex flex-col gap-1">
            <div className={`group flex items-center justify-between rounded border transition-all ${filters.showCables !== false ? 'border-cyan-400/30 bg-cyan-400/10' : 'border-white/5 bg-white/5 hover:bg-white/10'}`}>
              <div
                className="flex flex-1 items-center justify-between p-2 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setInfraExpanded(!infraExpanded);
                }}
              >
                <div className="flex items-center gap-3">
                  <Network size={14} className={filters.showCables !== false ? 'text-cyan-400' : 'text-white/20'} />
                  <div className="flex flex-col">
                    <span className="text-mono-sm font-bold tracking-wider uppercase text-white/90">SUBMARINE CABLES</span>
                    <span className="text-[9px] font-mono text-cyan-400/60">Global Undersea Infrastructure</span>
                  </div>
                </div>
                <div className="w-4 flex justify-center transition-transform duration-200 shrink-0" style={{ transform: infraExpanded ? 'rotate(90deg)' : 'none' }}>
                  <ChevronRight size={14} className="text-white/40" />
                </div>
              </div>

              <div className="border-l border-white/10 p-2" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" className="sr-only" checked={filters.showCables !== false} onChange={() => {
                  const isCurrentlyOn = filters.showCables !== false;
                  onFilterChange('showCables', !isCurrentlyOn);
                  onFilterChange('showLandingStations', !isCurrentlyOn);
                }} />
                <div
                  className={`h-3 w-6 cursor-pointer rounded-full transition-colors relative ${filters.showCables !== false ? 'bg-cyan-400' : 'bg-white/10 hover:bg-white/20'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const isCurrentlyOn = filters.showCables !== false;
                    if (isCurrentlyOn) {
                      onFilterChange('showCables', false);
                      onFilterChange('showLandingStations', false);
                    } else {
                      onFilterChange('showCables', true);
                    }
                  }}
                >
                  <div className={`absolute top-0.5 h-2 w-2 rounded-full bg-black transition-all ${filters.showCables !== false ? 'left-3.5' : 'left-0.5'}`} />
                </div>
              </div>
            </div>

            {/* Sub-filters for Infra */}
            {infraExpanded && (
              <div className="flex flex-col gap-1 px-1 opacity-90">
                {/* Landing Stations */}
                <label className={`group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.showLandingStations !== false ? 'border-cyan-400/20 bg-cyan-400/5' : 'border-white/5 bg-white/5'}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px]">⚓</span>
                    <span className={`text-[9px] font-bold tracking-wide ${filters.showLandingStations !== false ? 'text-cyan-400/80' : 'text-cyan-400/30'}`}>LANDING STATIONS</span>
                  </div>
                  <input type="checkbox" className="sr-only" checked={filters.showLandingStations !== false} onChange={(e) => onFilterChange('showLandingStations', e.target.checked)} />
                  <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showLandingStations !== false ? 'bg-cyan-400/80' : 'bg-white/10'}`}><div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showLandingStations !== false ? 'left-2.5' : 'left-0.5'}`} /></div>
                </label>

                {/* Opacity Slider */}
                <div className="group flex flex-col gap-1 rounded border border-white/5 bg-white/5 p-1.5 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold tracking-wide text-white/50">CABLE OPACITY</span>
                    <span className="text-[9px] text-white/50">{Math.round(((filters.cableOpacity as unknown as number) ?? 0.6) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="1"
                    step="0.1"
                    value={(filters.cableOpacity as unknown as number) ?? 0.6}
                    onChange={(e) => onFilterChange('cableOpacity', parseFloat(e.target.value) as unknown as boolean)}
                    className="h-1 w-full appearance-none rounded bg-white/10 outline-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="p-3 space-y-3">
        {/* Compact Headers & Counts */}
        <div className="flex items-end justify-between">
          <div className="flex flex-col">
            <span className="text-[9px] text-white/40 font-bold tracking-widest uppercase mb-1">Total Tracking</span>
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
      <div className="flex items-center justify-between border-t border-white/10 bg-white/5 px-3 py-1.5 opacity-50">
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
