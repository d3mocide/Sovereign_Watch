import React from 'react';
import { Anchor } from 'lucide-react';

interface SpeedLegendProps {
    visible: boolean;
}

export const SpeedLegend: React.FC<SpeedLegendProps> = ({ visible }) => {
    if (!visible) return null;

    // Gradient stops matching SPEED_STOPS_KTS in TacticalMap.tsx
    // Dark Blue -> Medium Blue -> Bright Blue -> Light Blue -> Cyan/White
    const gradient = `linear-gradient(to top, 
        rgb(0, 50, 150) 0%, 
        rgb(0, 100, 200) 10%, 
        rgb(0, 150, 255) 32%, 
        rgb(0, 200, 255) 60%, 
        rgb(200, 255, 255) 100%
    )`;

    return (
        <div className="absolute left-[410px] top-[325px] z-10 w-[110px] pointer-events-none select-none flex flex-col widget-panel p-0 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
            {/* Header */}
            <div className="px-3 py-2 bg-white/5 border-b border-white/10 flex items-center gap-2">
                <Anchor size={12} className="text-cyan-400" />
                <span className="text-[9px] font-bold tracking-[.3em] text-white/50 uppercase">
                    Maritime
                </span>
            </div>

            <div className="p-3 flex gap-2 h-48 items-start">
                {/* Gradient Bar */}
                <div 
                    className="w-2 h-full rounded-full shadow-inner border border-white/10 shrink-0"
                    style={{ background: gradient, backgroundRepeat: 'no-repeat' }}
                />

                {/* Ticks & Labels */}
                <div className="flex flex-col justify-between h-full py-[1px] text-[9px] font-mono font-bold text-white/70">
                    <span className="text-cyan-200">25+ kts</span>
                    <span className="text-white/60">15 kts</span>
                    <span className="text-white/60">8 kts</span>
                    <span className="text-white/60">2 kts</span>
                    <span className="text-blue-400">0 kts</span>
                </div>
            </div>
        </div>
    );
};
