import React from 'react';
import { Crosshair } from 'lucide-react';

interface AltitudeLegendProps {
    visible: boolean;
}

export const AltitudeLegend: React.FC<AltitudeLegendProps> = ({ visible }) => {
    if (!visible) return null;

    // Gradient stops matching ALTITUDE_STOPS in TacticalMap.tsx
    // Green -> Lime -> Yellow -> Gold -> Orange -> Red -> Crimson -> Magenta
    const gradient = `linear-gradient(to top, 
        rgb(0, 255, 100) 0%, 
        rgb(50, 255, 50) 10%, 
        rgb(150, 255, 0) 20%, 
        rgb(255, 255, 0) 30%, 
        rgb(255, 200, 0) 40%, 
        rgb(255, 150, 0) 52%, 
        rgb(255, 100, 0) 64%, 
        rgb(255, 50, 50) 76%, 
        rgb(255, 0, 100) 88%, 
        rgb(255, 0, 255) 100%
    )`;

    return (
        <div className="absolute left-[410px] top-[82px] z-10 w-[110px] pointer-events-none select-none flex flex-col widget-panel overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
            {/* Header */}
            <div className="px-3 py-2 bg-white/5 border-b border-white/10 flex items-center gap-2">
                <Crosshair size={12} className="text-hud-green" />
                <span className="text-[9px] font-bold tracking-[.3em] text-white/50 uppercase">
                    Altitude
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
                    <span className="text-fuchsia-400">43,000 ft</span>
                    <span className="text-white/60">30,000 ft</span>
                    <span className="text-white/60">20,000 ft</span>
                    <span className="text-white/60">10,000 ft</span>
                    <span className="text-white/60">5,000 ft</span>
                    <span className="text-green-400">0 ft</span>
                </div>
            </div>
        </div>
    );
};
