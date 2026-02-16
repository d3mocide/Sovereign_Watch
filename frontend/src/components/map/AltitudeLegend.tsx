import React from 'react';

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
        <div className="absolute left-[405px] bottom-10 z-10 pointer-events-none select-none flex flex-col gap-1 items-start bg-black/40 backdrop-blur-sm p-2 rounded border border-white/10 animate-in fade-in slide-in-from-left-4 duration-500">
            <span className="text-[9px] font-bold tracking-[0.2em] text-white/50 uppercase ml-0.5 mb-1">ALTITUDE</span>
            <div className="flex gap-2 h-48">
                {/* Gradient Bar */}
                <div 
                    className="w-2 h-full rounded-full shadow-inner border border-white/10"
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
