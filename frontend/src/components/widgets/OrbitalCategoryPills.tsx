import React from 'react';
import { Satellite, Navigation, Cloud, Wifi, Eye, Globe } from 'lucide-react';

interface OrbitalCategoryPillsProps {
  selected: string;
  onChange: (category: string) => void;
}

const CATEGORIES = [
  { key: 'ALL', label: 'ALL', icon: Satellite, color: 'purple' },
  { key: 'GPS', label: 'GPS', icon: Navigation, color: 'sky' },
  { key: 'WEATHER', label: 'WEATHER', icon: Cloud, color: 'amber' },
  { key: 'COMMS', label: 'COMMS', icon: Wifi, color: 'emerald' },
  { key: 'INTEL', label: 'INTEL', icon: Eye, color: 'rose' },
  { key: 'LEO', label: 'LEO', icon: Globe, color: 'violet' },
  { key: 'GEO', label: 'GEO', icon: Globe, color: 'cyan' },
] as const;

export const OrbitalCategoryPills: React.FC<OrbitalCategoryPillsProps> = ({ selected, onChange }) => {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[8px] font-bold tracking-[0.2em] text-white/30 uppercase pl-1">Category</span>
      <div className="flex flex-wrap gap-1 rounded-sm border border-tactical-border bg-black/40 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] overflow-hidden p-2">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = selected === cat.key;

          let activeClasses = '';
          if (isActive) {
            switch (cat.color) {
              case 'purple': activeClasses = 'bg-purple-400/20 text-purple-300 border border-purple-400/30 shadow-[0_0_6px_rgba(168,85,247,0.2)]'; break;
              case 'sky': activeClasses = 'bg-sky-400/20 text-sky-300 border border-sky-400/30 shadow-[0_0_6px_rgba(56,189,248,0.2)]'; break;
              case 'amber': activeClasses = 'bg-amber-400/20 text-amber-300 border border-amber-400/30 shadow-[0_0_6px_rgba(251,191,36,0.2)]'; break;
              case 'emerald': activeClasses = 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 shadow-[0_0_6px_rgba(52,211,153,0.2)]'; break;
              case 'rose': activeClasses = 'bg-rose-400/20 text-rose-300 border border-rose-400/30 shadow-[0_0_6px_rgba(251,113,133,0.2)]'; break;
              case 'violet': activeClasses = 'bg-violet-400/20 text-violet-300 border border-violet-400/30 shadow-[0_0_6px_rgba(167,139,250,0.2)]'; break;
              case 'cyan': activeClasses = 'bg-cyan-400/20 text-cyan-300 border border-cyan-400/30 shadow-[0_0_6px_rgba(34,211,238,0.2)]'; break;
              default: activeClasses = 'bg-purple-400/20 text-purple-300 border border-purple-400/30 shadow-[0_0_6px_rgba(168,85,247,0.2)]';
            }
          }

          return (
            <button
              key={cat.key}
              onClick={() => onChange(cat.key)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all duration-300 ${isActive
                  ? activeClasses
                  : 'text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent'
                }`}
            >
              <Icon size={10} strokeWidth={2.5} />
              <span className="text-[9px] font-black tracking-widest">{cat.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
