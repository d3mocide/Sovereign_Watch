import React from 'react';
import { Plane, Ship, Activity } from 'lucide-react';

interface LayerFiltersProps {
  filters: { showAir: boolean; showSea: boolean };
  onFilterChange: (key: 'showAir' | 'showSea', value: boolean) => void;
}

export const LayerFilters: React.FC<LayerFiltersProps> = ({ filters, onFilterChange }) => {
  return (
    <div className="flex flex-col rounded-sm border border-tactical-border bg-black/40 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] overflow-hidden relative">
      {/* Premium Shine */}
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.02] to-transparent pointer-events-none -translate-x-full animate-shimmer" />
      
      <div className="flex items-center justify-between border-b border-tactical-border bg-white/[0.03] px-3 py-2 relative z-10">
        <h3 className="text-mono-xs font-bold uppercase tracking-[0.2em] text-hud-green/70 flex items-center gap-2">
            <Activity size={12} className="text-hud-green" />
            Active Collection Filters
        </h3>
      </div>
      
      <div className="grid grid-cols-2 gap-2 p-3"> {/* Added p-3 here to maintain padding for the grid */}
        {/* Aircraft Filter */}
        <label className={`group flex cursor-pointer items-center justify-between rounded border p-2 transition-all ${filters.showAir ? 'border-air-cyan/30 bg-air-cyan/10' : 'border-white/5 bg-white/5 hover:bg-white/10'}`}>
          <div className="flex items-center gap-2">
            <Plane size={14} className={filters.showAir ? 'text-air-cyan' : 'text-white/20'} />
            <span className={`text-[10px] font-bold tracking-widest ${filters.showAir ? 'text-white' : 'text-white/40'}`}>AIR</span>
          </div>
          
          <input 
            type="checkbox" 
            className="sr-only"
            checked={filters.showAir}
            onChange={(e) => onFilterChange('showAir', e.target.checked)}
          />
          <div className={`h-3 w-6 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out relative ${filters.showAir ? 'bg-air-cyan' : 'bg-white/10'}`}>
            <div className={`absolute top-0.5 h-2 w-2 transform rounded-full bg-black transition duration-200 ease-in-out ${filters.showAir ? 'left-3.5' : 'left-0.5'}`} />
          </div>
        </label>

        {/* Vessel Filter */}
        <label className={`group flex cursor-pointer items-center justify-between rounded border p-2 transition-all ${filters.showSea ? 'border-sea-green/30 bg-sea-green/10' : 'border-white/5 bg-white/5 hover:bg-white/10'}`}>
          <div className="flex items-center gap-2">
            <Ship size={14} className={filters.showSea ? 'text-sea-green' : 'text-white/20'} />
            <span className={`text-[10px] font-bold tracking-widest ${filters.showSea ? 'text-white' : 'text-white/40'}`}>SEA</span>
          </div>
          
          <input 
            type="checkbox" 
            className="sr-only"
            checked={filters.showSea}
            onChange={(e) => onFilterChange('showSea', e.target.checked)}
          />
          <div className={`h-3 w-6 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out relative ${filters.showSea ? 'bg-sea-green' : 'bg-white/10'}`}>
            <div className={`absolute top-0.5 h-2 w-2 transform rounded-full bg-black transition duration-200 ease-in-out ${filters.showSea ? 'left-3.5' : 'left-0.5'}`} />
          </div>
        </label>
      </div>
    </div>
  );
};
