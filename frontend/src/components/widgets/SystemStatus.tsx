import React, { useState } from 'react';
import { BarChart3, Database, Cpu } from 'lucide-react';

interface SystemStatusProps {
  trackCounts: { air: number; sea: number };
}

export const SystemStatus: React.FC<SystemStatusProps> = ({ trackCounts }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'stats'>('overview');
  
  const total = trackCounts.air + trackCounts.sea;
  const airPercent = total > 0 ? (trackCounts.air / total) * 100 : 0;
  const seaPercent = total > 0 ? (trackCounts.sea / total) * 100 : 0;

  return (
    <div className="flex flex-col rounded-sm border border-tactical-border bg-black/40 backdrop-blur-md shadow-inner overflow-hidden">
      {/* Tab Header */}
      <div className="flex border-b border-tactical-border bg-white/5">
        <button 
          onClick={() => setActiveTab('overview')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-bold tracking-widest transition-all ${activeTab === 'overview' ? 'bg-hud-green/10 text-hud-green border-b border-hud-green' : 'text-white/40 hover:text-white/70'}`}
        >
          <Cpu size={12} />
          [ OVERVIEW ]
        </button>
        <button 
          onClick={() => setActiveTab('stats')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-bold tracking-widest transition-all ${activeTab === 'stats' ? 'bg-hud-green/10 text-hud-green border-b border-hud-green' : 'text-white/40 hover:text-white/70'}`}
        >
          <BarChart3 size={12} />
          [ ANALYTICS ]
        </button>
      </div>

      <div className="p-4">
        {activeTab === 'overview' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-mono-xs font-bold text-white/40 uppercase">Total Tracked Objects</span>
              <span className="text-mono-xl font-bold text-hud-green tabular-nums">{total}</span>
            </div>

            {/* Visual Breakdown Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[9px] font-bold tracking-tighter uppercase">
                <span className="text-air-cyan">Aviation ({trackCounts.air})</span>
                <span className="text-sea-green">Maritime ({trackCounts.sea})</span>
              </div>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/5 p-[1px]">
                 <div 
                   className="h-full bg-air-cyan transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(0,255,255,0.5)]" 
                   style={{ width: `${airPercent}%` }} 
                 />
                 <div 
                   className="h-full bg-sea-green transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(0,255,100,0.5)]" 
                   style={{ width: `${seaPercent}%` }} 
                 />
              </div>
            </div>

          </div>
        ) : (
          <div className="space-y-4">
             <div className="flex items-end justify-between gap-1 h-32 pt-4">
                {[4, 12, 18, 11, 25, 30, 22, 15, 12, 8].map((v, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                        <div 
                           className="w-full bg-white/10 group-hover:bg-hud-green/40 transition-all duration-300 rounded-t-sm" 
                           style={{ height: `${v * 2.5}px` }} 
                        />
                        <span className="text-[7px] text-white/20 font-mono">{i + 13}h</span>
                    </div>
                ))}
             </div>
             <p className="text-[9px] text-white/30 text-center italic">Historical data stream - 12hr window</p>
          </div>
        )}
      </div>

      {/* System Footer Info */}
      <div className="flex items-center gap-4 border-t border-tactical-border bg-white/5 px-3 py-1.5 grayscale opacity-50">
          <div className="flex items-center gap-1.5">
             <Database size={10} className="text-hud-green" />
             <span className="text-[8px]">DB: CONNECTED</span>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
             <span className="text-[8px]">Uptime: 04:12:08</span>
          </div>
      </div>
    </div>
  );
};
