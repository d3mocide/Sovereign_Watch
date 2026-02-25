import React, { useState, useEffect } from 'react';
import {
    Globe,
    Radio,
    Server,
    PlayCircle,
    History,
    MoveVertical,
    ShieldAlert,
    ShieldCheck
} from 'lucide-react';

import { SystemHealth } from '../../hooks/useSystemHealth';

interface TopBarProps {
    alertsCount: number;
    hasNewAlert?: boolean;
    location?: { lat: number; lon: number } | null;
    health?: SystemHealth;
    showVelocityVectors?: boolean;
    onToggleVelocityVectors?: () => void;
    showHistoryTails?: boolean;
    onToggleHistoryTails?: () => void;
    showSatellites?: boolean;
    onToggleSatellites?: () => void;
    isReplayMode?: boolean;
    onToggleReplay?: () => void;
    viewMode?: 'TACTICAL' | 'RADIO';
    onViewChange?: (mode: 'TACTICAL' | 'RADIO') => void;
}

export const TopBar: React.FC<TopBarProps> = ({
    alertsCount, location, health,
    showVelocityVectors, onToggleVelocityVectors,
    showHistoryTails, onToggleHistoryTails,
    showSatellites, onToggleSatellites,
    isReplayMode, onToggleReplay,
    viewMode = 'TACTICAL', onViewChange
}) => {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const formatTime = (date: Date) => {
        const timeStr = date.toISOString().split('T')[1].split('.')[0];
        const [hh, mm, ss] = timeStr.split(':');
        return { hh, mm, ss };
    };

    const { hh, mm, ss } = formatTime(time);

    // Calculate integrity bars based on latency
    // < 50ms: 6 bars
    // < 100ms: 5 bars
    // < 200ms: 4 bars
    // < 500ms: 3 bars
    // Offline: 0 bars (or red)
    const getIntegrityBars = () => {
        if (!health || health.status === 'offline') return 0;
        if (health.latency < 50) return 6;
        if (health.latency < 100) return 5;
        if (health.latency < 200) return 4;
        if (health.latency < 500) return 3;
        return 1;
    };
    const activeBars = getIntegrityBars();

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
            {/* Center Area - View Mode Toggle / Telemetry cluster */}
            <div className="ml-12 mr-auto hidden items-center gap-6 xl:flex">
                <div className="flex items-center gap-2 px-3 py-1">
                    <button
                        onClick={() => onViewChange?.('TACTICAL')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[9px] font-black tracking-widest transition-all duration-300 ${viewMode === 'TACTICAL'
                            ? 'bg-hud-green text-black shadow-[0_0_15px_rgba(0,255,65,0.3)]'
                            : 'text-white/30 hover:text-white/60'
                            }`}
                    >
                        <Globe size={12} strokeWidth={3} />
                        <span className={viewMode === 'TACTICAL' ? 'block' : 'hidden'}>TACTICAL</span>
                    </button>
                    <button
                        onClick={() => onViewChange?.('RADIO')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[9px] font-black tracking-widest transition-all duration-300 ${viewMode === 'RADIO'
                            ? 'bg-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.3)]'
                            : 'text-white/30 hover:text-white/60'
                            }`}
                    >
                        <Radio size={12} strokeWidth={3} />
                        <span className={viewMode === 'RADIO' ? 'block' : 'hidden'}>RADIO</span>
                    </button>
                </div>
            </div>

            {/* Right Side - Status and Time */}
            <div className="ml-auto flex items-center gap-6">
                {/* Latency Block */}
                <div className="flex flex-col items-center mr-0">
                    <div className="flex items-center gap-2">
                        <span className="text-[7px] text-white/30 uppercase tracking-tighter">Latency</span>
                        <span className="text-[9px] text-hud-green/60 tabular-nums font-mono">
                            {health ? `${health.latency}ms` : '---'}
                        </span>
                    </div>
                    <div className="flex gap-0.5 mt-0.5">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div
                                key={i}
                                className={`h-1 w-2.5 rounded-[0.5px] transition-all duration-300 ${i <= activeBars
                                    ? (health?.status === 'offline' ? 'bg-alert-red' : 'bg-hud-green shadow-[0_0_3px_rgba(0,255,65,0.4)]')
                                    : 'bg-white/5'
                                    }`}
                            />
                        ))}
                    </div>
                </div>

                <div className="h-4 w-[1px] bg-white/10" />

                {/* Status Icons Bar */}
                <div className="flex items-center gap-4 px-0 py-1.5">
                    {/* Core Status */}
                    <div className="flex items-center gap-1.5" title="Core System: ONLINE">
                        <Server size={14} className="text-hud-green" />
                        <div className="h-1.5 w-1.5 rounded-full bg-hud-green shadow-[0_0_5px_#00ff41] animate-pulse" />
                    </div>

                    {/* Replay Mode Toggle */}
                    {onToggleReplay && (
                        <button
                            onClick={onToggleReplay}
                            className={`transition-all hover:scale-110 active:scale-90 ${isReplayMode ? 'text-amber-500' : 'text-white/20'}`}
                            title={`Simulation Replay: ${isReplayMode ? 'RUNNING' : 'STANDBY'}`}
                        >
                            <PlayCircle size={15} className={isReplayMode ? 'animate-spin-slow' : ''} />
                        </button>
                    )}

                    {/* History Trail Toggle */}
                    {onToggleHistoryTails && (
                        <button
                            onClick={onToggleHistoryTails}
                            className={`transition-all hover:scale-110 active:scale-90 ${showHistoryTails ? 'text-hud-green' : 'text-white/20'}`}
                            title={`History Trails: ${showHistoryTails ? 'ACTIVE' : 'STANDBY'}`}
                        >
                            <History size={15} />
                        </button>
                    )}

                    {/* Velocity Vector Toggle */}
                    {onToggleVelocityVectors && (
                        <button
                            onClick={onToggleVelocityVectors}
                            className={`transition-all hover:scale-110 active:scale-90 ${showVelocityVectors ? 'text-hud-green' : 'text-white/20'}`}
                            title={`Velocity Projections: ${showVelocityVectors ? 'ACTIVE' : 'STANDBY'}`}
                        >
                            <MoveVertical size={15} />
                        </button>
                    )}
                </div>

                {/* Alerts Pill */}
                <div className="flex items-center px-2">
                    <button
                        className={`group relative flex items-center gap-2 rounded-full px-3 py-1.5 transition-all duration-300 ${alertsCount > 0
                            ? 'bg-alert-red/10 shadow-[0_0_15px_rgba(255,0,0,0.2)] ring-1 ring-alert-red/50 hover:bg-alert-red/20'
                            : 'bg-white/5 ring-1 ring-white/10 hover:bg-white/10'
                            }`}
                        title={alertsCount > 0 ? `${alertsCount} Active Alerts` : "No Active Alerts"}
                    >
                        {alertsCount > 0 ? (
                            <ShieldAlert size={14} className="text-alert-red animate-pulse drop-shadow-[0_0_5px_rgba(255,0,0,0.5)]" />
                        ) : (
                            <ShieldCheck size={14} className="text-white/30" />
                        )}
                        <span className={`font-mono text-[10px] font-bold tracking-widest ${alertsCount > 0 ? "text-alert-red drop-shadow-[0_0_5px_rgba(255,0,0,0.5)]" : "text-white/30"
                            }`}>
                            ALERTS [{alertsCount.toString().padStart(2, '0')}]
                        </span>

                        {/* Ping indicator for active alerts */}
                        {alertsCount > 0 && (
                            <div className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-alert-red opacity-75"></span>
                                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-alert-red"></span>
                            </div>
                        )}
                    </button>
                </div>

                {/* Tactical Clock */}
                <div className="flex flex-col items-end border-l border-white/5 pl-3 justify-center">
                    <div className="flex items-center gap-1">
                        <div className="bg-hud-green/10 px-1.5 py-0.5 rounded-[2px] border border-hud-green/20">
                            <span className="text-lg font-bold tabular-nums tracking-widest text-hud-green drop-shadow-[0_0_5px_rgba(0,255,65,0.3)]">
                                {hh}
                            </span>
                        </div>
                        <span className={`text-hud-green/50 font-bold ${time.getSeconds() % 2 === 0 ? 'opacity-100' : 'opacity-30'} transition-opacity`}>:</span>
                        <div className="bg-hud-green/10 px-1.5 py-0.5 rounded-[2px] border border-hud-green/20">
                            <span className="text-lg font-bold tabular-nums tracking-widest text-hud-green drop-shadow-[0_0_5px_rgba(0,255,65,0.3)]">
                                {mm}
                            </span>
                        </div>
                        <span className={`text-hud-green/50 font-bold ${time.getSeconds() % 2 === 0 ? 'opacity-100' : 'opacity-30'} transition-opacity`}>:</span>
                        <div className="bg-hud-green/10 px-1.5 py-0.5 rounded-[2px] border border-hud-green/20">
                            <span className="text-lg font-bold tabular-nums tracking-widest text-hud-green drop-shadow-[0_0_5px_rgba(0,255,65,0.3)]">
                                {ss}
                            </span>
                        </div>
                        <div className="ml-2 bg-hud-green/20 text-hud-green border border-hud-green/30 px-1.5 py-0.5 rounded-[2px] flex items-center justify-center">
                            <span className="text-[10px] font-black tracking-widest">ZULU</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
