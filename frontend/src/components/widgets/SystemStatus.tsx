import React from 'react';
import { Database, ShieldCheck } from 'lucide-react';

interface SystemStatusProps {
  trackCounts: { air: number; sea: number };
}

export const SystemStatus: React.FC<SystemStatusProps> = ({ trackCounts }) => {
  const total = trackCounts.air + trackCounts.sea;
  const airPercent = total > 0 ? (trackCounts.air / total) * 100 : 0;
  const seaPercent = total > 0 ? (trackCounts.sea / total) * 100 : 0;

  return (
    <div className="flex flex-col rounded-sm border border-tactical-border bg-black/40 backdrop-blur-md shadow-inner overflow-hidden">
      <div className="p-3 space-y-3">
        {/* Compact Headers & Counts */}
        <div className="flex items-end justify-between">
           <div className="flex flex-col">
              <span className="text-[9px] text-white/40 font-bold tracking-widest uppercase">Total Objects</span>
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
