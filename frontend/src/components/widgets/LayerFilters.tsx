import React, { useState } from 'react';
import { Plane, Ship, Activity, ChevronDown, ChevronRight } from 'lucide-react';

interface LayerFiltersProps {
  filters: { 
      showAir: boolean; 
      showSea: boolean;
      showHelicopter?: boolean;
      showMilitary?: boolean;
      showGovernment?: boolean;
      showCommercial?: boolean;
      showPrivate?: boolean;
      [key: string]: boolean | undefined;
  };
  onFilterChange: (key: string, value: boolean) => void;
}

export const LayerFilters: React.FC<LayerFiltersProps> = ({ filters, onFilterChange }) => {
  const [airExpanded, setAirExpanded] = useState(false);
  const [seaExpanded, setSeaExpanded] = useState(false);

  return (
    <div className="flex flex-col rounded-sm border border-tactical-border bg-black/40 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] overflow-hidden relative">
      <div className="flex items-center justify-between border-b border-tactical-border bg-white/[0.03] px-3 py-2 relative z-10">
        <h3 className="text-mono-xs font-bold uppercase tracking-[0.2em] text-hud-green/70 flex items-center gap-2">
            <Activity size={12} className="text-hud-green" />
            Active Collection Filters
        </h3>
      </div>
      
      <div className="flex flex-col gap-2 p-3">
        {/* Aircraft Filter Group */}
        <div className="flex flex-col gap-1">
            <div className={`group flex items-center justify-between rounded border transition-all ${filters.showAir ? 'border-air-accent/30 bg-air-accent/10' : 'border-white/5 bg-white/5 hover:bg-white/10'}`}>
              <div 
                className="flex flex-1 items-center gap-2 p-2 cursor-pointer"
                onClick={() => setAirExpanded(!airExpanded)}
              >
                {airExpanded ? <ChevronDown size={14} className="text-white/40" /> : <ChevronRight size={14} className="text-white/40" />}
                <Plane size={14} className={filters.showAir ? 'text-air-accent' : 'text-white/20'} />
                <span className={`text-[10px] font-bold tracking-widest ${filters.showAir ? 'text-white' : 'text-white/40'}`}>AIR</span>
              </div>
              
              <div 
                className="p-2 cursor-pointer flex items-center"
                onClick={() => onFilterChange('showAir', !filters.showAir)}
              >
                <div className={`h-3 w-6 shrink-0 rounded-full transition-colors duration-200 ease-in-out relative ${filters.showAir ? 'bg-air-accent' : 'bg-white/10'}`}>
                  <div className={`absolute top-0.5 h-2 w-2 transform rounded-full bg-black transition duration-200 ease-in-out ${filters.showAir ? 'left-3.5' : 'left-0.5'}`} />
                </div>
              </div>
            </div>

            {/* Sub-filters for Air */}
            {filters.showAir && airExpanded && (
                <div className="grid grid-cols-2 gap-1.5 pl-6 mt-1">
                    {/* Helicopter Sub-filter */}
                    <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showHelicopter !== false ? 'border-air-accent/20 bg-air-accent/5' : 'border-white/5 bg-white/5'}`}>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px]">🚁</span>
                            <span className={`text-[9px] font-bold tracking-wide ${filters.showHelicopter !== false ? 'text-white/80' : 'text-white/30'}`}>HELO</span>
                        </div>
                        <input 
                            type="checkbox" 
                            className="sr-only"
                            checked={filters.showHelicopter !== false}
                            onChange={(e) => onFilterChange('showHelicopter', e.target.checked)}
                        />
                        <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showHelicopter !== false ? 'bg-air-accent/80' : 'bg-white/10'}`}>
                            <div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showHelicopter !== false ? 'left-2.5' : 'left-0.5'}`} />
                        </div>
                    </label>

                     {/* Military Sub-filter */}
                     <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showMilitary !== false ? 'border-amber-500/20 bg-amber-500/5' : 'border-white/5 bg-white/5'}`}>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px]">🔶</span>
                            <span className={`text-[9px] font-bold tracking-wide ${filters.showMilitary !== false ? 'text-amber-500/80' : 'text-white/30'}`}>MIL</span>
                        </div>
                        <input 
                            type="checkbox" 
                            className="sr-only"
                            checked={filters.showMilitary !== false}
                            onChange={(e) => onFilterChange('showMilitary', e.target.checked)}
                        />
                        <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showMilitary !== false ? 'bg-amber-500/80' : 'bg-white/10'}`}>
                            <div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showMilitary !== false ? 'left-2.5' : 'left-0.5'}`} />
                        </div>
                    </label>

                    {/* Gov Sub-filter */}
                    <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showGovernment !== false ? 'border-blue-400/20 bg-blue-400/5' : 'border-white/5 bg-white/5'}`}>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px]">🏛</span>
                            <span className={`text-[9px] font-bold tracking-wide ${filters.showGovernment !== false ? 'text-blue-400/80' : 'text-white/30'}`}>GOV</span>
                        </div>
                        <input 
                            type="checkbox" 
                            className="sr-only"
                            checked={filters.showGovernment !== false}
                            onChange={(e) => onFilterChange('showGovernment', e.target.checked)}
                        />
                         <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showGovernment !== false ? 'bg-blue-400/80' : 'bg-white/10'}`}>
                            <div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showGovernment !== false ? 'left-2.5' : 'left-0.5'}`} />
                        </div>
                    </label>

                     {/* Commercial Sub-filter */}
                     <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showCommercial !== false ? 'border-sky-400/20 bg-sky-400/5' : 'border-white/5 bg-white/5'}`}>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px]">🏢</span>
                            <span className={`text-[9px] font-bold tracking-wide ${filters.showCommercial !== false ? 'text-sky-400/80' : 'text-white/30'}`}>COM</span>
                        </div>
                        <input 
                            type="checkbox" 
                            className="sr-only"
                            checked={filters.showCommercial !== false}
                            onChange={(e) => onFilterChange('showCommercial', e.target.checked)}
                        />
                         <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showCommercial !== false ? 'bg-sky-400/80' : 'bg-white/10'}`}>
                            <div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showCommercial !== false ? 'left-2.5' : 'left-0.5'}`} />
                        </div>
                    </label>

                     {/* Civilian/GA Sub-filter */}
                     <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showPrivate !== false ? 'border-hud-green/20 bg-hud-green/5' : 'border-white/5 bg-white/5'}`}>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px]">🛩</span>
                            <span className={`text-[9px] font-bold tracking-wide ${filters.showPrivate !== false ? 'text-hud-green/80' : 'text-white/30'}`}>CIV</span>
                        </div>
                        <input 
                            type="checkbox" 
                            className="sr-only"
                            checked={filters.showPrivate !== false}
                            onChange={(e) => onFilterChange('showPrivate', e.target.checked)}
                        />
                         <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showPrivate !== false ? 'bg-hud-green/80' : 'bg-white/10'}`}>
                            <div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showPrivate !== false ? 'left-2.5' : 'left-0.5'}`} />
                        </div>
                    </label>
                </div>
            )}
        </div>

        {/* Vessel Filter */}
        <div className="flex flex-col gap-1">
          <div className={`group flex items-center justify-between rounded border transition-all ${filters.showSea ? 'border-sea-accent/30 bg-sea-accent/10' : 'border-white/5 bg-white/5 hover:bg-white/10'}`}>
            <div 
              className="flex flex-1 items-center gap-2 p-2 cursor-pointer"
              onClick={() => setSeaExpanded(!seaExpanded)}
            >
              {seaExpanded ? <ChevronDown size={14} className="text-white/40" /> : <ChevronRight size={14} className="text-white/40" />}
              <Ship size={14} className={filters.showSea ? 'text-sea-accent' : 'text-white/20'} />
              <span className={`text-[10px] font-bold tracking-widest ${filters.showSea ? 'text-white' : 'text-white/40'}`}>SEA</span>
            </div>
            
            <div 
              className="p-2 cursor-pointer flex items-center"
              onClick={() => onFilterChange('showSea', !filters.showSea)}
            >
              <div className={`h-3 w-6 shrink-0 rounded-full transition-colors duration-200 ease-in-out relative ${filters.showSea ? 'bg-sea-accent' : 'bg-white/10'}`}>
                <div className={`absolute top-0.5 h-2 w-2 transform rounded-full bg-black transition duration-200 ease-in-out ${filters.showSea ? 'left-3.5' : 'left-0.5'}`} />
              </div>
            </div>
          </div>
          
          {/* Sub-filters for Sea (Placeholder for future use) */}
          {filters.showSea && seaExpanded && (
            <div className="pl-6 py-2 text-[9px] text-white/20 italic tracking-wider">
              No marine sub-filters available
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
