import React, { useState, useEffect } from 'react';
import { Navigation, Cloud, Wifi, Eye, Globe, ChevronDown, ChevronRight } from 'lucide-react';

interface OrbitalCategoryPillsProps {
  filters: import('../../types').MapFilters | undefined;
  onFilterChange: (key: string, value: boolean) => void;
  trackCount: number;
}

const CATEGORIES = [
  { key: 'showSatGPS', label: 'GPS', statsKey: 'gps', icon: Navigation, color: 'sky' },
  { key: 'showSatWeather', label: 'WEATHER', statsKey: 'weather', icon: Cloud, color: 'amber' },
  { key: 'showSatComms', label: 'COMMS', statsKey: 'comms', icon: Wifi, color: 'emerald' },
  { key: 'showSatSurveillance', label: 'INTEL', statsKey: 'intel', icon: Eye, color: 'rose' },
  { key: 'showSatOther', label: 'OTHER', statsKey: 'other', icon: Globe, color: 'slate' },
] as const;

interface OrbitalStats {
  gps: number; weather: number; comms: number; intel: number; other: number; total: number;
}

// constellation-stats response: { [category]: { [constellation]: count } }
type ConstellationStats = Record<string, Record<string, number>>;

export const OrbitalCategoryPills: React.FC<OrbitalCategoryPillsProps> = ({ filters, onFilterChange, trackCount }) => {
  const [stats, setStats] = useState<OrbitalStats | null>(null);
  const [constellationStats, setConstellationStats] = useState<ConstellationStats>({});
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({
    showSatGPS: true,
    showSatWeather: true,
    showSatComms: true,
    showSatSurveillance: true,
    showSatOther: true,
  });

  const toggleCollapse = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    setCollapsedCats(prev => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    fetch('/api/orbital/stats')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setStats(data); })
      .catch(() => { });

    fetch('/api/orbital/constellation-stats')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setConstellationStats(data); })
      .catch(() => { });
  }, []);

  return (
    <div className="flex flex-col overflow-hidden widget-panel">
      <div className="flex items-center justify-between bg-white/5 border-b border-white/10 px-3 py-2">
        <span className="text-[10px] font-bold tracking-[0.2em] text-purple-400/70 uppercase">ORBITAL OBJECTS</span>
        <span className="text-sm font-mono font-bold tracking-wider text-purple-400">{trackCount.toLocaleString()}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 p-2">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = filters[cat.key] !== false;
          const count = stats ? stats[cat.statsKey] : null;
          const constellations = constellationStats[cat.statsKey];

          let activeClasses = '';
          if (isActive) {
            switch (cat.color) {
              case 'sky': activeClasses = 'bg-sky-400/20 text-sky-300 border border-sky-400/30 shadow-[0_0_6px_rgba(56,189,248,0.2)]'; break;
              case 'amber': activeClasses = 'bg-amber-400/20 text-amber-300 border border-amber-400/30 shadow-[0_0_6px_rgba(251,191,36,0.2)]'; break;
              case 'emerald': activeClasses = 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 shadow-[0_0_6px_rgba(52,211,153,0.2)]'; break;
              case 'rose': activeClasses = 'bg-rose-400/20 text-rose-300 border border-rose-400/30 shadow-[0_0_6px_rgba(251,113,133,0.2)]'; break;
              case 'slate': activeClasses = 'bg-slate-400/20 text-slate-300 border border-slate-400/30 shadow-[0_0_6px_rgba(148,163,184,0.2)]'; break;
              default: activeClasses = 'bg-white/20 text-white border border-white/30';
            }
          }

          return (
            <div key={cat.key} className="flex flex-col flex-1 min-w-[30%] gap-0.5">
              <button
                onClick={() => onFilterChange(cat.key, !isActive)}
                className={`flex w-full items-center justify-between gap-1 px-2 py-2 rounded transition-all duration-300 ${isActive ? activeClasses : 'text-white/30 hover:text-white/60 border border-white/5 bg-white/5'
                  }`}
              >
                <div className="flex items-center gap-2">
                  <Icon size={12} strokeWidth={2.5} />
                  <span className="text-[10px] font-black tracking-widest">{cat.label}</span>
                </div>
                {constellations && Object.keys(constellations).length > 0 && (
                  <div 
                    onClick={(e: React.MouseEvent) => toggleCollapse(e, cat.key)}
                    className="p-0.5 rounded-full hover:bg-white/10 transition-colors"
                  >
                    {collapsedCats[cat.key] ? (
                      <ChevronRight size={12} className={isActive ? "text-white/60" : "text-white/30"} />
                    ) : (
                      <ChevronDown size={12} className={isActive ? "text-white/60" : "text-white/30"} />
                    )}
                  </div>
                )}
              </button>
              {isActive && constellations && Object.keys(constellations).length > 0 && !collapsedCats[cat.key] && (
                <div className="flex flex-col gap-1 mt-1.5 pl-2.5 border-l-2 border-white/5">
                  {Object.entries(constellations as Record<string, number>).map(([name, n]) => {
                    const isConstellationActive = filters[`showConstellation_${name}`] !== false;
                    return (
                      <button 
                        key={name}
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          onFilterChange(`showConstellation_${name}`, !isConstellationActive);
                        }}
                        className={`flex w-full items-center justify-between px-1.5 py-1 rounded transition-colors group ${
                          isConstellationActive ? 'hover:bg-white/10' : 'opacity-50 hover:opacity-80'
                        }`}
                      >
                        <span className={`text-[9px] font-medium tracking-wider truncate transition-colors ${
                          isConstellationActive ? 'text-white/70 group-hover:text-white' : 'text-white/30 line-through'
                        }`}>{name}</span>
                        <span className={`text-[9px] font-mono tabular-nums transition-colors ${
                          isConstellationActive ? 'text-white/50 group-hover:text-white/80' : 'text-white/20'
                        }`}>{n.toLocaleString()}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
