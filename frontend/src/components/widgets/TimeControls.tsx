import React from 'react';
import { Play, Pause, FastForward, SkipBack, X, Radio } from 'lucide-react';

interface TimeControlsProps {
    isOpen: boolean;
    isPlaying: boolean;
    currentTime: number; // Unix timestamp ms
    startTime: number;
    endTime: number;
    playbackSpeed: number;
    historyDuration: number; // hours
    onTogglePlay: () => void;
    onSeek: (time: number) => void;
    onSpeedChange: (speed: number) => void;
    onDurationChange: (hours: number) => void;
    onClose: () => void; // Exit replay mode
}

export const TimeControls: React.FC<TimeControlsProps> = ({
    isOpen,
    isPlaying,
    currentTime,
    startTime,
    endTime,
    playbackSpeed,
    historyDuration,
    onTogglePlay,
    onSeek,
    onSpeedChange,
    onDurationChange,
    onClose
}) => {
    if (!isOpen) return null;

    const progress = Math.max(0, Math.min(1, (currentTime - startTime) / (endTime - startTime)));
    const formatTime = (ts: number) => new Date(ts).toLocaleTimeString();

    return (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 w-[500px] animate-in slide-in-from-top duration-300">
            <div className="bg-black/80 backdrop-blur-md border border-hud-green/30 rounded-lg shadow-[0_0_20px_rgba(0,255,65,0.1)] overflow-hidden">
                
                {/* Scrubber (Top Edge) */}
                <div 
                    className="relative h-4 w-full cursor-pointer group bg-white/5 hover:bg-white/10 transition-colors"
                    onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const p = (e.clientX - rect.left) / rect.width;
                        onSeek(startTime + p * (endTime - startTime));
                    }}
                >
                    {/* Progress Bar */}
                    <div 
                        className="absolute top-0 bottom-0 left-0 bg-hud-green/50 shadow-[0_0_10px_rgba(0,255,65,0.4)]" 
                        style={{ width: `${progress * 100}%` }}
                    />
                    
                    {/* Thumb */}
                    <div 
                        className="absolute top-1/2 w-4 h-4 bg-hud-green rounded-full shadow-[0_0_10px_#00ff41] pointer-events-none"
                        style={{ left: `${progress * 100}%`, transform: 'translate(-50%, -50%)' }}
                    />
                </div>

                {/* Compact Controls Row */}
                <div className="flex items-center justify-between px-3 py-2">
                    
                    {/* Left: Play/Pause + Speed */}
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={onTogglePlay}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-hud-green/10 hover:bg-hud-green/30 text-hud-green border border-hud-green/50 transition-all active:scale-95 shadow-[0_0_10px_rgba(0,255,65,0.2)] hover:shadow-[0_0_15px_rgba(0,255,65,0.4)]"
                        >
                            {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                        </button>
                        
                        <div className="flex bg-black/40 rounded border border-white/10 p-0.5">
                            {[1, 5, 10, 30].map(speed => (
                                <button
                                    key={speed}
                                    onClick={() => onSpeedChange(speed)}
                                    className={`px-1.5 py-0.5 text-[9px] font-bold rounded min-w-[24px] transition-colors ${
                                        playbackSpeed === speed 
                                        ? 'bg-hud-green/20 text-hud-green shadow-[0_0_5px_rgba(0,255,65,0.3)] border border-hud-green/30' 
                                        : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                                    }`}
                                >
                                    {speed}x
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Center: Duration Selector */}
                    <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-white/40 font-bold tracking-wider">LOOKBACK:</span>
                        <div className="flex bg-white/5 rounded border border-white/5 p-0.5">
                            {[1, 6, 12, 24].map(hours => (
                                <button
                                    key={hours}
                                    onClick={() => onDurationChange(hours)}
                                    className={`px-1.5 py-0.5 text-[9px] font-bold rounded min-w-[20px] transition-colors ${
                                        historyDuration === hours
                                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                                        : 'text-white/30 hover:text-white/70 hover:bg-white/5'
                                    }`}
                                >
                                    {hours}h
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Right: Time Display */}
                    <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shadow-[0_0_5px_#f59e0b]" />
                        <span className="text-sm font-mono font-bold text-white/90 leading-none tracking-wide text-right min-w-[80px] drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]">
                            {formatTime(currentTime)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};
