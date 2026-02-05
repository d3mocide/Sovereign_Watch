import React, { useState, useEffect } from 'react';

interface TopBarProps {
    alertsCount: number;
    hasNewAlert?: boolean;
    location?: { lat: number; lon: number } | null;
}

export const TopBar: React.FC<TopBarProps> = ({ alertsCount, hasNewAlert, location }) => {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const formatTime = (date: Date) => {
        return date.toISOString().split('T')[1].split('.')[0] + 'Z';
    };

    return (
        <div className="flex h-14 items-center px-6">
            {/* Logo and Domain */}
            <div className="flex items-center gap-4">
                <div className="relative">
                    <div className="h-8 w-1.5 bg-hud-green shadow-[0_0_12px_#00ff41]" />
                    <div className="absolute left-0 top-0 h-8 w-1.5 animate-pulse bg-hud-green opacity-50 blur-sm" />
                </div>
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-3">
                        <span className="text-xl font-black tracking-[0.3em] text-hud-green drop-shadow-[0_0_8px_rgba(0,255,65,0.4)]">
                            SOVEREIGN WATCH
                        </span>
                        <span className="text-xs font-bold text-hud-green/50 opacity-80 select-none">//</span>
                        <span className="text-sm font-bold tracking-widest text-white/90">
                            NODE-01
                        </span>
                    </div>
                    <div className="flex items-center gap-2 overflow-hidden">
                        <span className="text-[9px] font-medium tracking-[0.2em] text-hud-green/40 uppercase">
                            Collection_Domain:
                        </span>
                        <span className="text-[9px] font-bold tracking-[0.15em] text-hud-green/60">
                            OREGON.PORTLAND.01
                        </span>
                        <div className="ml-2 h-[1px] w-24 bg-hud-green/10" />
                    </div>
                </div>
            </div>

            {/* Center Area - System Stream (Filler for Aesthetic) */}
            <div className="mx-12 hidden flex-1 items-center justify-center gap-8 xl:flex">
                <div className="flex flex-col items-center">
                    <span className="text-[8px] text-white/20 uppercase tracking-tighter">Lat / Lon Focus</span>
                    <span className="text-[10px] text-hud-green/40 font-bold tabular-nums">
                        {location ? `${location.lat.toFixed(4)}°N / ${location.lon.toFixed(4)}°W` : 'NO_SIGNAL'}
                    </span>
                </div>
                <div className="h-4 w-[1px] bg-white/5" />
                <div className="flex flex-col items-center">
                    <span className="text-[8px] text-white/20 uppercase tracking-tighter">Network Integrity</span>
                    <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className={`h-1.5 w-3 ${i < 5 ? 'bg-hud-green/30' : 'bg-hud-green/10 animate-pulse'}`} />
                        ))}
                    </div>
                </div>
            </div>

            {/* Right Side - Status and Time */}
            <div className="ml-auto flex items-center gap-10">
                {/* Status Dots */}
                <div className="flex gap-6">
                    <div className="group flex flex-col items-end gap-1">
                        <span className="text-[8px] text-white/30 uppercase tracking-[0.2em] group-hover:text-hud-green/50 transition-colors">Core_Sys</span>
                        <div className="flex items-center gap-2">
                             <span className="h-1.5 w-1.5 rounded-full bg-hud-green shadow-[0_0_5px_#00ff41] animate-pulse" />
                             <span className="text-[10px] font-bold text-hud-green tracking-widest">ONLINE</span>
                        </div>
                    </div>
                    <div className="group flex flex-col items-end gap-1">
                        <span className="text-[8px] text-white/30 uppercase tracking-[0.2em] group-hover:text-hud-green/50 transition-colors">Net_Link</span>
                        <div className="flex items-center gap-2">
                             <span className="h-1.5 w-1.5 rounded-full bg-hud-green shadow-[0_0_5px_#00ff41]" />
                             <span className="text-[10px] font-bold text-hud-green tracking-widest">ENCRYPTED</span>
                        </div>
                    </div>
                </div>

                {/* Alerts Indicator */}
                <div className={`relative flex h-10 items-center px-4 border-l border-white/5 ${alertsCount > 0 ? 'bg-alert-red/5' : ''}`}>
                    <div className="flex flex-col items-end">
                        <span className="text-[8px] text-white/30 uppercase tracking-[0.2em]">Active_Alerts</span>
                        <span className={`text-sm font-bold tracking-widest ${alertsCount > 0 ? "text-alert-red drop-shadow-[0_0_10px_rgba(255,0,0,0.5)] animate-pulse" : "text-white/20"}`}>
                            {alertsCount.toString().padStart(2, '0')}
                        </span>
                    </div>
                    {alertsCount > 0 && (
                        <div className="absolute -top-1 -right-1 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-alert-red opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-alert-red"></span>
                        </div>
                    )}
                </div>

                {/* Tactical Clock */}
                <div className="flex flex-col items-end border-l border-white/5 pl-8">
                    <span className="text-[8px] text-white/30 uppercase tracking-[0.3em]">Temporal_Reference</span>
                    <span className="text-lg font-bold tabular-nums tracking-widest text-white/90 drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]">
                        {formatTime(time)}
                    </span>
                </div>
            </div>
        </div>
    );
};
