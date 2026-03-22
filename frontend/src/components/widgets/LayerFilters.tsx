import React, { useState } from "react";
import {
  Activity,
  Anchor,
  Box,
  Building2,
  ChevronRight,
  CloudRain,
  Compass,
  Cpu,
  Droplets,
  Eye,
  Helicopter,
  Landmark,
  LifeBuoy,
  LocateFixed,
  Package,
  Plane,
  Radio,
  Sailboat,
  Satellite,
  Settings,
  Shield,
  Ship,
  Users,
  Waves,
  Zap,
} from "lucide-react";

interface LayerFiltersProps {
  filters: {
    showAir: boolean;
    showSea: boolean;
    showSatellites: boolean;
    showHelicopter?: boolean;
    showMilitary?: boolean;
    showGovernment?: boolean;
    showCommercial?: boolean;
    showPrivate?: boolean;
    showDrone?: boolean;
    showCargo?: boolean;
    showTanker?: boolean;
    showPassenger?: boolean;
    showFishing?: boolean;
    showSeaMilitary?: boolean;
    showLawEnforcement?: boolean;
    showSar?: boolean;
    showTug?: boolean;
    showPleasure?: boolean;
    showHsc?: boolean;
    showPilot?: boolean;
    showSpecial?: boolean;
    showSatGPS?: boolean;
    showSatWeather?: boolean;
    showSatComms?: boolean;
    showSatSurveillance?: boolean;
    showSatOther?: boolean;
    showH3Coverage?: boolean;
    [key: string]: boolean | string | number | string[] | undefined;
  };
  onFilterChange: (key: string, value: boolean | string | number | string[]) => void;
}

export const LayerFilters: React.FC<LayerFiltersProps> = ({ filters, onFilterChange }) => {
  const [airExpanded, setAirExpanded] = useState(false);
  const [seaExpanded, setSeaExpanded] = useState(false);
  const [satExpanded, setSatExpanded] = useState(false);

  return (
    <div className="flex flex-col overflow-hidden relative">
      <div className="flex flex-col gap-2">
        {/* Aircraft Filter Group */}
        <div className="flex flex-col gap-1">
          <div className={`group flex items-center justify-between rounded border transition-all ${filters.showAir ? 'border-air-accent/30 bg-air-accent/10 shadow-[0_0_8px_rgba(16,185,129,0.2)]' : 'border-white/5 bg-white/5 hover:bg-white/10'}`}>
            <button
              className="flex flex-1 items-center justify-between p-2 cursor-pointer text-left focus-visible:ring-1 focus-visible:ring-hud-green outline-none w-full"
              onClick={() => setAirExpanded(!airExpanded)}
              aria-expanded={airExpanded}
              aria-label="Toggle Aircraft Filter Group"
            >
              <div className="flex items-center gap-2">
                <Plane size={14} className={filters.showAir ? 'text-air-accent' : 'text-white/20'} />
                <span className={`text-[10px] font-bold tracking-widest ${filters.showAir ? 'text-white' : 'text-white/40'}`}>AIR</span>
              </div>
              <div className="w-4 flex justify-center transition-transform duration-200 shrink-0" style={{ transform: airExpanded ? 'rotate(90deg)' : 'none' }}>
                <ChevronRight size={14} className="text-white/40" />
              </div>
            </button>

            <button
              className="border-l border-white/10 p-2 flex items-center focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
              onClick={(e) => {
                e.stopPropagation();
                onFilterChange('showAir', !filters.showAir);
              }}
              aria-label="Toggle all Air filters"
              aria-pressed={filters.showAir}
            >
              <div className={`h-3 w-6 shrink-0 rounded-full transition-colors duration-200 ease-in-out relative ${filters.showAir ? 'bg-air-accent' : 'bg-white/10 hover:bg-white/20'}`}>
                <div className={`absolute top-0.5 h-2 w-2 transform rounded-full bg-black transition duration-200 ease-in-out ${filters.showAir ? 'left-3.5' : 'left-0.5'}`} />
              </div>
            </button>
          </div>

          {/* Sub-filters for Air */}
          {filters.showAir && airExpanded && (
            <div className="grid grid-cols-2 gap-1.5 px-0 mt-1">
              {/* Helicopter Sub-filter */}
              <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showHelicopter !== false ? 'border-air-accent/50 bg-air-accent/10 shadow-[0_0_8px_rgba(16,185,129,0.2)]' : 'border-white/5 bg-white/5'}`}>
                <div className="flex items-center gap-1.5 text-air-accent">
                  <Helicopter size={10} className={filters.showHelicopter !== false ? 'opacity-100' : 'opacity-20'} />
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
              <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showMilitary !== false ? 'border-amber-500/50 bg-amber-500/10 shadow-[0_0_8px_rgba(245,158,11,0.2)]' : 'border-white/5 bg-white/5'}`}>
                <div className="flex items-center gap-1.5 text-amber-500">
                  <Shield size={10} className={filters.showMilitary !== false ? 'opacity-100' : 'opacity-20'} />
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
              <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showGovernment !== false ? 'border-blue-400/50 bg-blue-400/10 shadow-[0_0_8px_rgba(96,165,250,0.2)]' : 'border-white/5 bg-white/5'}`}>
                <div className="flex items-center gap-1.5 text-blue-400">
                  <Landmark size={10} className={filters.showGovernment !== false ? 'opacity-100' : 'opacity-20'} />
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
              <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showCommercial !== false ? 'border-sky-400/50 bg-sky-400/10 shadow-[0_0_8px_rgba(56,189,248,0.2)]' : 'border-white/5 bg-white/5'}`}>
                <div className="flex items-center gap-1.5 text-sky-400">
                  <Building2 size={10} className={filters.showCommercial !== false ? 'opacity-100' : 'opacity-20'} />
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
              <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showPrivate !== false ? 'border-hud-green/30 bg-hud-green/10 shadow-[0_0_8px_rgba(16,185,129,0.2)]' : 'border-white/5 bg-white/5'}`}>
                <div className="flex items-center gap-1.5 text-hud-green">
                  <Plane size={10} className={filters.showPrivate !== false ? 'opacity-100' : 'opacity-20'} />
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

              {/* Drone Sub-filter */}
              <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showDrone !== false ? 'border-rose-400/50 bg-rose-400/10 shadow-[0_0_8px_rgba(251,113,133,0.2)]' : 'border-white/5 bg-white/5'}`}>
                <div className="flex items-center gap-1.5 text-rose-400">
                  <Cpu size={10} className={filters.showDrone !== false ? 'opacity-100' : 'opacity-20'} />
                  <span className={`text-[9px] font-bold tracking-wide ${filters.showDrone !== false ? 'text-rose-400/80' : 'text-white/30'}`}>DRONE</span>
                </div>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={filters.showDrone !== false}
                  onChange={(e) => onFilterChange('showDrone', e.target.checked)}
                />
                <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showDrone !== false ? 'bg-rose-400/80' : 'bg-white/10'}`}>
                  <div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showDrone !== false ? 'left-2.5' : 'left-0.5'}`} />
                </div>
              </label>
            </div>
          )}
        </div>

        {/* Vessel Filter */}
        <div className="flex flex-col gap-1">
          <div className={`group flex items-center justify-between rounded border transition-all ${filters.showSea ? 'border-sea-accent/30 bg-sea-accent/10 shadow-[0_0_8px_rgba(34,211,238,0.2)]' : 'border-white/5 bg-white/5 hover:bg-white/10'}`}>
            <button
              className="flex flex-1 items-center justify-between p-2 cursor-pointer text-left focus-visible:ring-1 focus-visible:ring-hud-green outline-none w-full"
              onClick={() => setSeaExpanded(!seaExpanded)}
              aria-expanded={seaExpanded}
              aria-label="Toggle Vessel Filter Group"
            >
              <div className="flex items-center gap-2">
                <Ship size={14} className={filters.showSea ? 'text-sea-accent' : 'text-white/20'} />
                <span className={`text-[10px] font-bold tracking-widest ${filters.showSea ? 'text-white' : 'text-white/40'}`}>SEA</span>
              </div>
              <div className="w-4 flex justify-center transition-transform duration-200 shrink-0" style={{ transform: seaExpanded ? 'rotate(90deg)' : 'none' }}>
                <ChevronRight size={14} className="text-white/40" />
              </div>
            </button>

            <button
              className="border-l border-white/10 p-2 flex items-center focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
              onClick={(e) => {
                e.stopPropagation();
                onFilterChange('showSea', !filters.showSea);
              }}
              aria-label="Toggle all Sea filters"
              aria-pressed={filters.showSea}
            >
              <div className={`h-3 w-6 shrink-0 rounded-full transition-colors duration-200 ease-in-out relative ${filters.showSea ? 'bg-sea-accent' : 'bg-white/10 hover:bg-white/20'}`}>
                <div className={`absolute top-0.5 h-2 w-2 transform rounded-full bg-black transition duration-200 ease-in-out ${filters.showSea ? 'left-3.5' : 'left-0.5'}`} />
              </div>
            </button>
          </div>

          {/* Sub-filters for Sea */}
          {filters.showSea && seaExpanded && (
            <div className="grid grid-cols-2 gap-1.5 px-0 mt-1">
              {/* Cargo */}
              <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showCargo !== false ? 'border-sea-accent/50 bg-sea-accent/10 shadow-[0_0_8px_rgba(34,211,238,0.2)]' : 'border-white/5 bg-white/5'}`}>
                <div className="flex items-center gap-1.5 text-sea-accent">
                  <Package size={10} className={filters.showCargo !== false ? 'opacity-100' : 'opacity-20'} />
                  <span className={`text-[9px] font-bold tracking-wide ${filters.showCargo !== false ? 'text-sea-accent/80' : 'text-white/30'}`}>CARGO</span>
                </div>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={filters.showCargo !== false}
                  onChange={(e) => onFilterChange('showCargo', e.target.checked)}
                />
                <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showCargo !== false ? 'bg-sea-accent/80' : 'bg-white/10'}`}>
                  <div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showCargo !== false ? 'left-2.5' : 'left-0.5'}`} />
                </div>
              </label>

              {/* Tanker */}
              <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showTanker !== false ? 'border-amber-500/50 bg-amber-500/10 shadow-[0_0_8px_rgba(245,158,11,0.2)]' : 'border-white/5 bg-white/5'}`}>
                <div className="flex items-center gap-1.5 text-amber-500">
                  <Droplets size={10} className={filters.showTanker !== false ? 'opacity-100' : 'opacity-20'} />
                  <span className={`text-[9px] font-bold tracking-wide ${filters.showTanker !== false ? 'text-amber-500/80' : 'text-white/30'}`}>TANKER</span>
                </div>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={filters.showTanker !== false}
                  onChange={(e) => onFilterChange('showTanker', e.target.checked)}
                />
                <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showTanker !== false ? 'bg-amber-500/80' : 'bg-white/10'}`}>
                  <div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showTanker !== false ? 'left-2.5' : 'left-0.5'}`} />
                </div>
              </label>

              {/* Passenger */}
              <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showPassenger !== false ? 'border-sky-400/50 bg-sky-400/10 shadow-[0_0_8px_rgba(56,189,248,0.2)]' : 'border-white/5 bg-white/5'}`}>
                <div className="flex items-center gap-1.5 text-sky-400">
                  <Users size={10} className={filters.showPassenger !== false ? 'opacity-100' : 'opacity-20'} />
                  <span className={`text-[9px] font-bold tracking-wide ${filters.showPassenger !== false ? 'text-sky-400/80' : 'text-white/30'}`}>PASSENGER</span>
                </div>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={filters.showPassenger !== false}
                  onChange={(e) => onFilterChange('showPassenger', e.target.checked)}
                />
                <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showPassenger !== false ? 'bg-sky-400/80' : 'bg-white/10'}`}>
                  <div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showPassenger !== false ? 'left-2.5' : 'left-0.5'}`} />
                </div>
              </label>

              {/* Fishing */}
              <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showFishing !== false ? 'border-hud-green/30 bg-hud-green/10 shadow-[0_0_8px_rgba(16,185,129,0.2)]' : 'border-white/5 bg-white/5'}`}>
                <div className="flex items-center gap-1.5 text-hud-green">
                  <Waves size={10} className={filters.showFishing !== false ? 'opacity-100' : 'opacity-20'} />
                  <span className={`text-[9px] font-bold tracking-wide ${filters.showFishing !== false ? 'text-hud-green/80' : 'text-white/30'}`}>FISHING</span>
                </div>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={filters.showFishing !== false}
                  onChange={(e) => onFilterChange('showFishing', e.target.checked)}
                />
                <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showFishing !== false ? 'bg-hud-green/80' : 'bg-white/10'}`}>
                  <div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showFishing !== false ? 'left-2.5' : 'left-0.5'}`} />
                </div>
              </label>

              {/* MILITARY */}
              <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showSeaMilitary !== false ? 'border-amber-500/50 bg-amber-500/10 shadow-[0_0_8px_rgba(245,158,11,0.2)]' : 'border-white/5 bg-white/5'}`}>
                <div className="flex items-center gap-1.5 text-amber-500">
                  <Anchor size={10} className={filters.showSeaMilitary !== false ? 'opacity-100' : 'opacity-20'} />
                  <span className={`text-[9px] font-bold tracking-wide ${filters.showSeaMilitary !== false ? 'text-amber-500/80' : 'text-white/30'}`}>MIL</span>
                </div>
                <input type="checkbox" className="sr-only" checked={filters.showSeaMilitary !== false} onChange={(e) => onFilterChange('showSeaMilitary', e.target.checked)} />
                <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showSeaMilitary !== false ? 'bg-amber-500/80' : 'bg-white/10'}`}><div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showSeaMilitary !== false ? 'left-2.5' : 'left-0.5'}`} /></div>
              </label>

              {/* LAW ENF */}
              <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showLawEnforcement !== false ? 'border-sky-500/50 bg-sky-500/10 shadow-[0_0_8px_rgba(14,165,233,0.2)]' : 'border-white/5 bg-white/5'}`}>
                <div className="flex items-center gap-1.5 text-sky-500">
                  <Shield size={10} className={filters.showLawEnforcement !== false ? 'opacity-100' : 'opacity-20'} />
                  <span className={`text-[9px] font-bold tracking-wide ${filters.showLawEnforcement !== false ? 'text-sky-500/80' : 'text-white/30'}`}>LAW ENF</span>
                </div>
                <input type="checkbox" className="sr-only" checked={filters.showLawEnforcement !== false} onChange={(e) => onFilterChange('showLawEnforcement', e.target.checked)} />
                <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showLawEnforcement !== false ? 'bg-sky-500/80' : 'bg-white/10'}`}><div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showLawEnforcement !== false ? 'left-2.5' : 'left-0.5'}`} /></div>
              </label>

              {/* SAR */}
              <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showSar !== false ? 'border-amber-500/50 bg-amber-500/10 shadow-[0_0_8px_rgba(245,158,11,0.2)]' : 'border-white/5 bg-white/5'}`}>
                <div className="flex items-center gap-1.5 text-amber-500">
                  <LifeBuoy size={10} className={filters.showSar !== false ? 'opacity-100' : 'opacity-20'} />
                  <span className={`text-[9px] font-bold tracking-wide ${filters.showSar !== false ? 'text-amber-500/80' : 'text-white/30'}`}>SAR</span>
                </div>
                <input type="checkbox" className="sr-only" checked={filters.showSar !== false} onChange={(e) => onFilterChange('showSar', e.target.checked)} />
                <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showSar !== false ? 'bg-amber-500/80' : 'bg-white/10'}`}><div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showSar !== false ? 'left-2.5' : 'left-0.5'}`} /></div>
              </label>

              {/* TUG */}
              <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showTug !== false ? 'border-gray-400/50 bg-gray-400/10 shadow-[0_0_8px_rgba(156,163,175,0.2)]' : 'border-white/5 bg-white/5'}`}>
                <div className="flex items-center gap-1.5 text-gray-400">
                  <Activity size={10} className={filters.showTug !== false ? 'opacity-100' : 'opacity-20'} />
                  <span className={`text-[9px] font-bold tracking-wide ${filters.showTug !== false ? 'text-gray-400/80' : 'text-white/30'}`}>TUG</span>
                </div>
                <input type="checkbox" className="sr-only" checked={filters.showTug !== false} onChange={(e) => onFilterChange('showTug', e.target.checked)} />
                <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showTug !== false ? 'bg-gray-400/80' : 'bg-white/10'}`}><div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showTug !== false ? 'left-2.5' : 'left-0.5'}`} /></div>
              </label>

              {/* PLEASURE */}
              <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showPleasure !== false ? 'border-pink-300/50 bg-pink-300/10 shadow-[0_0_8px_rgba(249,168,212,0.2)]' : 'border-white/5 bg-white/5'}`}>
                <div className="flex items-center gap-1.5 text-pink-300">
                  <Sailboat size={10} className={filters.showPleasure !== false ? 'opacity-100' : 'opacity-20'} />
                  <span className={`text-[9px] font-bold tracking-wide ${filters.showPleasure !== false ? 'text-pink-300/80' : 'text-white/30'}`}>PLEASURE</span>
                </div>
                <input type="checkbox" className="sr-only" checked={filters.showPleasure !== false} onChange={(e) => onFilterChange('showPleasure', e.target.checked)} />
                <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showPleasure !== false ? 'bg-pink-300/80' : 'bg-white/10'}`}><div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showPleasure !== false ? 'left-2.5' : 'left-0.5'}`} /></div>
              </label>

              {/* HSC */}
              <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showHsc !== false ? 'border-emerald-300/50 bg-emerald-300/10 shadow-[0_0_8px_rgba(110,231,183,0.2)]' : 'border-white/5 bg-white/5'}`}>
                <div className="flex items-center gap-1.5 text-emerald-300">
                  <Zap size={10} className={filters.showHsc !== false ? 'opacity-100' : 'opacity-20'} />
                  <span className={`text-[9px] font-bold tracking-wide ${filters.showHsc !== false ? 'text-emerald-300/80' : 'text-white/30'}`}>HSC</span>
                </div>
                <input type="checkbox" className="sr-only" checked={filters.showHsc !== false} onChange={(e) => onFilterChange('showHsc', e.target.checked)} />
                <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showHsc !== false ? 'bg-emerald-300/80' : 'bg-white/10'}`}><div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showHsc !== false ? 'left-2.5' : 'left-0.5'}`} /></div>
              </label>

              {/* PILOT */}
              <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showPilot !== false ? 'border-teal-400/50 bg-teal-400/10 shadow-[0_0_8px_rgba(45,212,191,0.2)]' : 'border-white/5 bg-white/5'}`}>
                <div className="flex items-center gap-1.5 text-teal-400">
                  <Compass size={10} className={filters.showPilot !== false ? 'opacity-100' : 'opacity-20'} />
                  <span className={`text-[9px] font-bold tracking-wide ${filters.showPilot !== false ? 'text-teal-400/80' : 'text-white/30'}`}>PILOT</span>
                </div>
                <input type="checkbox" className="sr-only" checked={filters.showPilot !== false} onChange={(e) => onFilterChange('showPilot', e.target.checked)} />
                <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showPilot !== false ? 'bg-teal-400/80' : 'bg-white/10'}`}><div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showPilot !== false ? 'left-2.5' : 'left-0.5'}`} /></div>
              </label>

              {/* SPECIAL */}
              <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showSpecial !== false ? 'border-zinc-400/50 bg-zinc-400/10 shadow-[0_0_8px_rgba(161,161,170,0.2)]' : 'border-white/5 bg-white/5'}`}>
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <Settings size={10} className={filters.showSpecial !== false ? 'opacity-100' : 'opacity-20'} />
                  <span className={`text-[9px] font-bold tracking-wide ${filters.showSpecial !== false ? 'text-zinc-400/80' : 'text-white/30'}`}>SPECIAL</span>
                </div>
                <input type="checkbox" className="sr-only" checked={filters.showSpecial !== false} onChange={(e) => onFilterChange('showSpecial', e.target.checked)} />
                <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showSpecial !== false ? 'bg-zinc-400/80' : 'bg-white/10'}`}><div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showSpecial !== false ? 'left-2.5' : 'left-0.5'}`} /></div>
              </label>
            </div>
          )}
        </div>        {/* ORBITAL / SATELLITES */}
        <div className={`group flex items-center justify-between rounded border transition-all ${filters.showSatellites ? 'border-purple-400/30 bg-purple-400/10 shadow-[0_0_8px_rgba(168,85,247,0.2)]' : 'border-white/5 bg-white/5 hover:bg-white/10'}`}>
          <button
            className="flex flex-1 items-center justify-between p-2 cursor-pointer text-left focus-visible:ring-1 focus-visible:ring-hud-green outline-none w-full"
            onClick={() => setSatExpanded(!satExpanded)}
            aria-expanded={satExpanded}
            aria-label="Toggle Orbital Filter Group"
          >
            <div className="flex items-center gap-2">
              <Satellite size={14} className={filters.showSatellites ? 'text-purple-400' : 'text-white/20'} />
              <span className={`text-[10px] font-bold tracking-widest ${filters.showSatellites ? 'text-white' : 'text-white/40'}`}>ORBITAL</span>
            </div>
            <div className="w-4 flex justify-center transition-transform duration-200 shrink-0" style={{ transform: satExpanded ? 'rotate(90deg)' : 'none' }}>
              <ChevronRight size={14} className="text-white/40" />
            </div>
          </button>
          <button
            className="border-l border-white/10 p-2 flex items-center focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
            onClick={(e) => {
              e.stopPropagation();
              onFilterChange('showSatellites', !filters.showSatellites);
            }}
            aria-label="Toggle all Orbital filters"
            aria-pressed={filters.showSatellites}
          >
            <input type="checkbox" className="sr-only" checked={filters.showSatellites} onChange={(e) => onFilterChange('showSatellites', e.target.checked)} tabIndex={-1} />
            <div className={`h-3 w-6 cursor-pointer rounded-full transition-colors relative ${filters.showSatellites ? 'bg-purple-400' : 'bg-white/10 hover:bg-white/20'}`}>
              <div className={`absolute top-0.5 h-2 w-2 rounded-full bg-black transition-all ${filters.showSatellites ? 'left-3.5' : 'left-0.5'}`} />
            </div>
          </button>
        </div>
        {/* Sub-filters for Satellites */}
        {satExpanded && (
          <div className="flex flex-col gap-1.5 px-0 mt-1 animate-in slide-in-from-top-2 fade-in duration-200">
            <div className="flex gap-1.5">
              <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showSatGPS !== false ? 'border-sky-400/50 bg-sky-400/10 shadow-[0_0_8px_rgba(56,189,248,0.2)]' : 'border-white/5 bg-white/5'}`}>
                <div className="flex items-center gap-1.5 text-sky-400">
                  <LocateFixed size={10} className={filters.showSatGPS !== false ? 'opacity-100' : 'opacity-20'} />
                  <span className={`text-[9px] font-bold tracking-wide ${filters.showSatGPS !== false ? 'text-sky-400/80' : 'text-white/30'}`}>GPS</span>
                </div>
                <input type="checkbox" className="sr-only" checked={filters.showSatGPS !== false} onChange={(e) => onFilterChange('showSatGPS', e.target.checked)} />
                <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showSatGPS !== false ? 'bg-sky-400/80' : 'bg-white/10'}`}><div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showSatGPS !== false ? 'left-2.5' : 'left-0.5'}`} /></div>
              </label>

              <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showSatWeather !== false ? 'border-amber-400/50 bg-amber-400/10 shadow-[0_0_8px_rgba(251,191,36,0.2)]' : 'border-white/5 bg-white/5'}`}>
                <div className="flex items-center gap-1.5 text-amber-400">
                  <CloudRain size={10} className={filters.showSatWeather !== false ? 'opacity-100' : 'opacity-20'} />
                  <span className={`text-[9px] font-bold tracking-wide ${filters.showSatWeather !== false ? 'text-amber-400/80' : 'text-white/30'}`}>WEATHER</span>
                </div>
                <input type="checkbox" className="sr-only" checked={filters.showSatWeather !== false} onChange={(e) => onFilterChange('showSatWeather', e.target.checked)} />
                <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showSatWeather !== false ? 'bg-amber-400/80' : 'bg-white/10'}`}><div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showSatWeather !== false ? 'left-2.5' : 'left-0.5'}`} /></div>
              </label>
            </div>
            <div className="flex gap-1.5">
              <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showSatComms !== false ? 'border-emerald-400/50 bg-emerald-400/10 shadow-[0_0_8px_rgba(52,211,153,0.2)]' : 'border-white/5 bg-white/5'}`}>
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <Radio size={10} className={filters.showSatComms !== false ? 'opacity-100' : 'opacity-20'} />
                  <span className={`text-[9px] font-bold tracking-wide ${filters.showSatComms !== false ? 'text-emerald-400/80' : 'text-white/30'}`}>COMMS</span>
                </div>
                <input type="checkbox" className="sr-only" checked={filters.showSatComms !== false} onChange={(e) => onFilterChange('showSatComms', e.target.checked)} />
                <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showSatComms !== false ? 'bg-emerald-400/80' : 'bg-white/10'}`}><div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showSatComms !== false ? 'left-2.5' : 'left-0.5'}`} /></div>
              </label>

              <label className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showSatSurveillance !== false ? 'border-rose-400/50 bg-rose-400/10 shadow-[0_0_8px_rgba(251,113,133,0.2)]' : 'border-white/5 bg-white/5'}`}>
                <div className="flex items-center gap-1.5 text-rose-400">
                  <Eye size={10} className={filters.showSatSurveillance !== false ? 'opacity-100' : 'opacity-20'} />
                  <span className={`text-[9px] font-bold tracking-wide ${filters.showSatSurveillance !== false ? 'text-rose-400/80' : 'text-white/30'}`}>INTEL</span>
                </div>
                <input type="checkbox" className="sr-only" checked={filters.showSatSurveillance !== false} onChange={(e) => onFilterChange('showSatSurveillance', e.target.checked)} />
                <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showSatSurveillance !== false ? 'bg-rose-400/80' : 'bg-white/10'}`}><div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showSatSurveillance !== false ? 'left-2.5' : 'left-0.5'}`} /></div>
              </label>
            </div>

            <label className={`group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showSatOther !== false ? 'border-slate-400/50 bg-slate-400/10 shadow-[0_0_8px_rgba(148,163,184,0.2)]' : 'border-white/5 bg-white/5'}`}>
              <div className="flex items-center gap-1.5 text-slate-400">
                <Box size={10} className={filters.showSatOther !== false ? 'opacity-100' : 'opacity-20'} />
                <span className={`text-[9px] font-bold tracking-wide ${filters.showSatOther !== false ? 'text-slate-400/80' : 'text-white/30'}`}>OTHER</span>
              </div>
              <input type="checkbox" className="sr-only" checked={filters.showSatOther !== false} onChange={(e) => onFilterChange('showSatOther', e.target.checked)} />
              <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showSatOther !== false ? 'bg-slate-400/80' : 'bg-white/10'}`}><div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showSatOther !== false ? 'left-2.5' : 'left-0.5'}`} /></div>
            </label>
          </div>
        )}
      </div>
    </div>
  );
};
