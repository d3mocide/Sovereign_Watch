import React, { useState, useEffect } from 'react';
import {
    Globe,
    Radio,
    Satellite,
    Server,
    PlayCircle,
    History,
    MoveVertical,
    ShieldAlert,
    ShieldCheck,
    Moon
} from 'lucide-react';

import { SystemHealth } from '../../hooks/useSystemHealth';
import { IntelEvent } from '../../types';
import { AlertsWidget } from '../widgets/AlertsWidget';
import { AIEngineWidget } from '../widgets/AIEngineWidget';

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
    showTerminator?: boolean;
    onToggleTerminator?: () => void;
    isReplayMode?: boolean;
    onToggleReplay?: () => void;
    viewMode?: 'TACTICAL' | 'RADIO' | 'ORBITAL';
    onViewChange?: (mode: 'TACTICAL' | 'RADIO' | 'ORBITAL') => void;
    onAlertsClick?: () => void;
    isAlertsOpen?: boolean;
    alerts?: IntelEvent[];
    onAlertsClose?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
    alertsCount, location, health,
    showVelocityVectors, onToggleVelocityVectors,
    showHistoryTails, onToggleHistoryTails,
    showSatellites, onToggleSatellites,
    showTerminator, onToggleTerminator,
    isReplayMode, onToggleReplay,
    viewMode = 'TACTICAL', onViewChange,
    onAlertsClick, isAlertsOpen, alerts, onAlertsClose
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
        <div className="flex h-[55px] items-center px-6 bg-black/40 backdrop-blur-md border-b border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.5)] z-50 relative">
            {/* Subtle top glow */}
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-hud-green/20 to-transparent pointer-events-none" />

            {/* Logo and Domain */}
            <div className="flex items-center gap-4 relative z-10">
                <div className="relative">
                    <div className="h-7 w-1.5 bg-hud-green shadow-[0_0_12px_#00ff41]" />
                    <div className="absolute left-0 top-0 h-7 w-1.5 animate-pulse bg-hud-green opacity-50 blur-sm" />
                </div>
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-3">
                        <span className="text-lg font-black tracking-[0.3em] text-hud-green drop-shadow-[0_0_10px_rgba(0,255,65,0.6)]">
                            SOVEREIGN WATCH
                        </span>
                        <span className="text-xs font-bold text-hud-green/50 opacity-80 select-none">//</span>
                        <span className="text-sm font-bold tracking-widest text-white/90 drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]">
                            NODE-01
                        </span>
                    </div>
                    <div className="flex items-center gap-2 overflow-hidden">
                        <span className="text-[9px] font-medium tracking-[0.2em] text-hud-green/40 uppercase">
                            Collection_Domain:
                        </span>
                        <span className="text-[9px] font-bold tracking-[0.15em] text-hud-green/60 uppercase">
                            {location
                                ? `${Math.abs(location.lat).toFixed(4)}°${location.lat >= 0 ? 'N' : 'S'} ${Math.abs(location.lon).toFixed(4)}°${location.lon >= 0 ? 'E' : 'W'}`
                                : 'LINK.OFFLINE'}
                        </span>
                        <div className="ml-2 h-[1px] w-24 bg-hud-green/20 shadow-[0_0_5px_rgba(0,255,65,0.3)]" />
                    </div>
                </div>
            </div>
            {/* Center Area - View Mode Toggle / Telemetry cluster */}
            <div className="ml-12 mr-auto hidden items-center gap-6 xl:flex relative z-10">
                <div className="flex items-center gap-2 px-2.5 py-1 bg-black/30 backdrop-blur-sm border border-white/5 rounded-full shadow-inner">
                    <button
                        onClick={() => onViewChange?.('TACTICAL')}
                        className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black tracking-widest transition-all duration-300 ${viewMode === 'TACTICAL'
                            ? 'bg-hud-green/20 text-hud-green border border-hud-green/50 shadow-[0_0_15px_rgba(0,255,65,0.3)] backdrop-blur-md'
                            : 'text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent'
                            }`}
                    >
                        <Globe size={14} strokeWidth={2.5} className={viewMode === 'TACTICAL' ? 'drop-shadow-[0_0_8px_rgba(0,255,65,0.8)]' : ''} />
                        <span className={viewMode === 'TACTICAL' ? 'block drop-shadow-[0_0_5px_rgba(0,255,65,0.5)]' : 'hidden'}>TACTICAL</span>
                    </button>
                    <button
                        onClick={() => onViewChange?.('ORBITAL')}
                        className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black tracking-widest transition-all duration-300 ${viewMode === 'ORBITAL'
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-400/50 shadow-[0_0_15px_rgba(168,85,247,0.3)] backdrop-blur-md'
                            : 'text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent'
                            }`}
                    >
                        <Satellite size={14} strokeWidth={2.5} className={viewMode === 'ORBITAL' ? 'drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]' : ''} />
                        <span className={viewMode === 'ORBITAL' ? 'block drop-shadow-[0_0_5px_rgba(168,85,247,0.5)]' : 'hidden'}>ORBITAL</span>
                    </button>
                    <button
                        onClick={() => onViewChange?.('RADIO')}
                        className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black tracking-widest transition-all duration-300 ${viewMode === 'RADIO'
                            ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/50 shadow-[0_0_15px_rgba(79,70,229,0.4)] backdrop-blur-md'
                            : 'text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent'
                            }`}
                    >
                        <Radio size={14} strokeWidth={2.5} className={viewMode === 'RADIO' ? 'drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]' : ''} />
                        <span className={viewMode === 'RADIO' ? 'block drop-shadow-[0_0_5px_rgba(99,102,241,0.5)]' : 'hidden'}>RADIO</span>
                    </button>
                </div>
            </div>

            {/* Right Side - Status and Time */}
            <div className="ml-auto flex items-center gap-5 relative z-10">
                {/* Latency Block */}
                <div className="flex flex-col items-center mr-2">
                    <div className="flex items-center gap-2">
                        <span className="text-[7px] text-white/40 uppercase tracking-tighter">Latency</span>
                        <span className="text-[10px] text-hud-green/80 tabular-nums font-mono drop-shadow-[0_0_3px_rgba(0,255,65,0.3)]">
                            {health ? `${health.latency}ms` : '---'}
                        </span>
                    </div>
                    <div className="flex gap-[1.5px] mt-0.5">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div
                                key={i}
                                className={`h-1.5 w-3 rounded-sm transition-all duration-300 ${i <= activeBars
                                    ? (health?.status === 'offline' ? 'bg-alert-red drop-shadow-[0_0_3px_rgba(255,0,0,0.5)]' : 'bg-hud-green shadow-[0_0_5px_rgba(0,255,65,0.6)]')
                                    : 'bg-white/10'
                                    }`}
                            />
                        ))}
                    </div>
                </div>

                <div className="h-6 w-[1px] bg-white/10" />

                {/* Status Icons Bar */}
                <div className="flex items-center gap-2 px-2.5 py-1 bg-black/30 backdrop-blur-sm border border-white/5 rounded-lg shadow-inner">
                    {/* Core Status */}
                    <div className="flex items-center gap-2 mr-3 px-2 py-0.5 bg-hud-green/10 border border-hud-green/20 rounded-md shadow-[0_0_10px_rgba(0,255,65,0.1)]" title="Core System: ONLINE">
                        <Server size={14} className="text-hud-green drop-shadow-[0_0_5px_rgba(0,255,65,0.5)]" />
                        <div className="flex items-center gap-1">
                            <span className="text-[8px] font-bold text-hud-green tracking-wider uppercase drop-shadow-[0_0_2px_rgba(0,255,65,0.5)]">SYS</span>
                            <div className="h-1.5 w-1.5 rounded-full bg-hud-green shadow-[0_0_8px_#00ff41] animate-pulse" />
                        </div>
                    </div>

                    {/* Replay Mode Toggle */}
                    {onToggleReplay && (
                        <button
                            onClick={onToggleReplay}
                            className={`p-1 rounded-md transition-all duration-200 hover:scale-105 active:scale-95 ${isReplayMode ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.3)]' : 'text-white/30 hover:bg-white/10 hover:text-white/80 border border-transparent'}`}
                            title={`Simulation Replay: ${isReplayMode ? 'RUNNING' : 'STANDBY'}`}
                        >
                            <PlayCircle size={15} className={isReplayMode ? 'animate-spin-slow drop-shadow-[0_0_5px_rgba(245,158,11,0.5)]' : ''} />
                        </button>
                    )}

                    {/* Terminator Mode Toggle */}
                    {onToggleTerminator && (
                        <button
                            onClick={onToggleTerminator}
                            className={`p-1 rounded-md transition-all duration-200 hover:scale-105 active:scale-95 ${showTerminator ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.3)]' : 'text-white/30 hover:bg-white/10 hover:text-white/80 border border-transparent'}`}
                            title={`Terminator (Day/Night) Overlay: ${showTerminator ? 'ACTIVE' : 'STANDBY'}`}
                        >
                            <Moon size={15} className={showTerminator ? 'drop-shadow-[0_0_5px_rgba(99,102,241,0.6)]' : ''} />
                        </button>
                    )}

                    {/* History Trail Toggle */}
                    {onToggleHistoryTails && (
                        <button
                            onClick={onToggleHistoryTails}
                            className={`p-1 rounded-md transition-all duration-200 hover:scale-105 active:scale-95 ${showHistoryTails ? 'bg-hud-green/20 text-hud-green border border-hud-green/40 shadow-[0_0_8px_rgba(0,255,65,0.3)]' : 'text-white/30 hover:bg-white/10 hover:text-white/80 border border-transparent'}`}
                            title={`History Trails: ${showHistoryTails ? 'ACTIVE' : 'STANDBY'}`}
                        >
                            <History size={15} className={showHistoryTails ? 'drop-shadow-[0_0_5px_rgba(0,255,65,0.5)]' : ''} />
                        </button>
                    )}

                    {/* Velocity Vector Toggle */}
                    {onToggleVelocityVectors && (
                        <button
                            onClick={onToggleVelocityVectors}
                            className={`p-1 rounded-md transition-all duration-200 hover:scale-105 active:scale-95 ${showVelocityVectors ? 'bg-hud-green/20 text-hud-green border border-hud-green/40 shadow-[0_0_8px_rgba(0,255,65,0.3)]' : 'text-white/30 hover:bg-white/10 hover:text-white/80 border border-transparent'}`}
                            title={`Velocity Projections: ${showVelocityVectors ? 'ACTIVE' : 'STANDBY'}`}
                        >
                            <MoveVertical size={15} className={showVelocityVectors ? 'drop-shadow-[0_0_5px_rgba(0,255,65,0.5)]' : ''} />
                        </button>
                    )}
                </div>

                {/* AI Engine Widget */}
                <AIEngineWidget />

                {/* Alerts Pill */}
                <div className="flex items-center px-1 relative">
                    <button
                        onClick={onAlertsClick}
                        className={`group relative flex items-center gap-2 rounded-full px-3 py-1 transition-all duration-300 backdrop-blur-md shadow-lg ${alertsCount > 0
                            ? 'bg-alert-red/20 shadow-[0_0_15px_rgba(255,0,0,0.3)] ring-1 ring-alert-red/60 hover:bg-alert-red/30'
                            : 'bg-black/30 ring-1 ring-white/10 hover:bg-black/50 hover:ring-white/20 hover:cursor-pointer cursor-default'
                            }`}
                        title={alertsCount > 0 ? `${alertsCount} Active Alerts - Click to view` : "No Active Alerts - Click to view"}
                    >
                        {alertsCount > 0 ? (
                            <ShieldAlert size={15} className="text-alert-red animate-pulse drop-shadow-[0_0_8px_rgba(255,0,0,0.8)]" />
                        ) : (
                            <ShieldCheck size={15} className="text-white/40" />
                        )}
                        <span className={`font-mono text-[10px] font-bold tracking-widest ${alertsCount > 0 ? "text-alert-red drop-shadow-[0_0_5px_rgba(255,0,0,0.5)]" : "text-white/40 group-hover:text-white/60"
                            }`}>
                            ALERTS [{alertsCount.toString().padStart(2, '0')}]
                        </span>

                        {/* Ping indicator for active alerts */}
                        {alertsCount > 0 && (
                            <div className="absolute -top-1 -right-1 flex h-3 w-3">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-alert-red opacity-80"></span>
                                <span className="relative inline-flex h-3 w-3 rounded-full bg-alert-red shadow-[0_0_8px_rgba(255,0,0,1)]"></span>
                            </div>
                        )}
                    </button>
                    {isAlertsOpen && alerts && onAlertsClose && (
                        <AlertsWidget isOpen={isAlertsOpen} alerts={alerts} onClose={onAlertsClose} />
                    )}
                </div>

                {/* Tactical Clock */}
                <div className="flex flex-col items-end pl-1 justify-center">
                    <div className="flex items-center bg-black/50 border border-hud-green/30 rounded-lg pl-3 pr-1.5 py-1 shadow-[inset_0_2px_8px_rgba(0,0,0,0.8),0_0_10px_rgba(0,255,65,0.15)] backdrop-blur-xl">
                        <div className="flex items-center gap-0.5 text-lg font-bold tabular-nums tracking-widest text-hud-green drop-shadow-[0_0_8px_rgba(0,255,65,0.6)]">
                            <span>{hh}</span>
                            <span className={`${time.getSeconds() % 2 === 0 ? 'opacity-100 drop-shadow-[0_0_8px_rgba(0,255,65,0.8)]' : 'opacity-30'} transition-opacity delay-75`}>:</span>
                            <span>{mm}</span>
                            <span className={`${time.getSeconds() % 2 === 0 ? 'opacity-100 drop-shadow-[0_0_8px_rgba(0,255,65,0.8)]' : 'opacity-30'} transition-opacity delay-75`}>:</span>
                            <span className="text-hud-green/80">{ss}</span>
                        </div>
                        <div className="ml-4 bg-hud-green/20 border border-hud-green/40 text-hud-green pl-2 pr-2.5 py-0.5 rounded-sm flex items-center justify-center shadow-[0_0_5px_rgba(0,255,65,0.3)]">
                            <span className="text-[10px] font-black tracking-widest drop-shadow-[0_0_3px_rgba(0,255,65,0.5)]">ZULU</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
