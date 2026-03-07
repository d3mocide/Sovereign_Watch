import React, { useState } from 'react';
import { Database, ShieldCheck, ChevronDown, ChevronUp, Radio, Network, ChevronRight, Layers, BrainCircuit, Loader2 } from 'lucide-react';
import { MapFilters } from '../../types';
import { useAIConfig } from '../../hooks/useAIConfig';

interface SystemStatusProps {
  trackCounts: { air: number; sea: number; orbital?: number };
  filters?: MapFilters;
  onFilterChange?: (key: string, value: boolean) => void;
}

export const SystemStatus: React.FC<SystemStatusProps> = ({ trackCounts, filters, onFilterChange }) => {
  const [showLayers, setShowLayers] = useState(false);
  const [infraExpanded, setInfraExpanded] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const { config: aiConfig, isSaving, selectModel } = useAIConfig();

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
                className={`p-1 rounded transition-colors ${filters.showRepeaters
                  ? 'bg-emerald-400/20 text-emerald-400 border border-emerald-400/30'
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
                className={`p-1 rounded transition-colors ${filters.showCables !== false
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
        <div className="p-2 space-y-2 border-b border-white/10 bg-black/60">
          {/* RF Infrastructure Toggle Detail */}
          <div
            className={`flex items-center justify-between p-2 rounded border transition-colors cursor-pointer group ${filters.showRepeaters
              ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-400'
              : 'bg-black/40 border-white/5 text-white/50 hover:bg-white/5 hover:text-white/80'
              }`}
            onClick={() => onFilterChange('showRepeaters', !filters.showRepeaters)}
          >
            <div className="flex items-center gap-3">
              <Radio size={14} className={filters.showRepeaters ? 'text-emerald-400 animate-pulse' : 'text-white/30 group-hover:text-white/50'} />
              <div className="flex flex-col">
                <span className="text-mono-sm font-bold tracking-wider uppercase text-white/90">RF Infrastructure</span>
                <span className="text-[9px] font-mono text-emerald-400/60">Amateur Radio Repeaters</span>
              </div>
            </div>
            <div
              className={`h-3 w-6 shrink-0 rounded-full transition-colors duration-200 ease-in-out relative ${filters.showRepeaters ? 'bg-emerald-400' : 'bg-white/10 hover:bg-white/20'}`}
            >
              <div className={`absolute top-0.5 h-2 w-2 transform rounded-full bg-black transition duration-200 ease-in-out ${filters.showRepeaters ? 'left-3.5' : 'left-0.5'}`} />
            </div>
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
                <label className={`group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showLandingStations !== false ? 'border-cyan-400/20 bg-cyan-400/5' : 'border-white/5 bg-white/5'}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px]">⚓</span>
                    <span className={`text-[9px] font-bold tracking-wide ${filters.showLandingStations !== false ? 'text-cyan-400/80' : 'text-cyan-400/30'}`}>LANDING STATIONS</span>
                  </div>
                  <input type="checkbox" className="sr-only" checked={filters.showLandingStations !== false} onChange={(e) => onFilterChange('showLandingStations', e.target.checked)} />
                  <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showLandingStations !== false ? 'bg-cyan-400/80' : 'bg-white/10'}`}><div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showLandingStations !== false ? 'left-2.5' : 'left-0.5'}`} /></div>
                </label>

                {/* Opacity Slider */}
                <div className="group flex flex-col gap-1 rounded border border-white/5 bg-white/5 p-2 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold tracking-wide text-white/50">CABLE OPACITY</span>
                    <span className="text-[9px] text-white/50">{Math.round((filters.cableOpacity ?? 0.6) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="1"
                    step="0.1"
                    value={filters.cableOpacity ?? 0.6}
                    onChange={(e) => onFilterChange('cableOpacity', parseFloat(e.target.value))}
                    className="h-1 w-full appearance-none rounded bg-white/10 outline-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Engine selector */}
      <div
        className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-2 cursor-pointer transition-colors"
        onClick={() => setShowAI(!showAI)}
      >
        <div className="flex items-center gap-2">
          <BrainCircuit size={13} className="text-violet-400" />
          <span className="text-[10px] font-bold tracking-[.3em] text-white/50 uppercase">AI Engine</span>
          {aiConfig && (
            <span className="text-[9px] font-mono text-violet-400/60 truncate max-w-[90px]">
              {aiConfig.available_models.find(m => m.id === aiConfig.active_model)?.label ?? aiConfig.active_model}
            </span>
          )}
        </div>
        {showAI
          ? <ChevronUp size={14} className="text-white/40" />
          : <ChevronDown size={14} className="text-white/40" />
        }
      </div>

      {showAI && (
        <div className="p-2 space-y-1.5 border-b border-white/10 bg-black/60">
          {!aiConfig ? (
            <div className="flex items-center gap-2 px-1 py-1 text-[10px] text-white/30 font-mono">
              <Loader2 size={10} className="animate-spin" />
              Loading models...
            </div>
          ) : (
            aiConfig.available_models.map(model => {
              const isActive = model.id === aiConfig.active_model;
              return (
                <button
                  key={model.id}
                  disabled={isSaving}
                  onClick={() => selectModel(model.id)}
                  className={`w-full flex items-center justify-between p-2 rounded border transition-all text-left ${
                    isActive
                      ? 'bg-violet-400/10 border-violet-400/30'
                      : 'bg-black/40 border-white/5 hover:bg-white/5 hover:border-white/10'
                  }`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className={`text-[10px] font-bold tracking-wide truncate ${isActive ? 'text-violet-300' : 'text-white/60'}`}>
                      {model.label}
                    </span>
                    <span className={`text-[8px] font-mono ${model.local ? 'text-emerald-400/60' : 'text-white/30'}`}>
                      {model.local ? 'LOCAL · ' : ''}{model.provider}
                    </span>
                  </div>
                  <div className={`shrink-0 h-2 w-2 rounded-full ml-2 transition-colors ${
                    isActive ? 'bg-violet-400 shadow-[0_0_6px_rgba(167,139,250,0.8)]' : 'bg-white/10'
                  }`} />
                </button>
              );
            })
          )}
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
