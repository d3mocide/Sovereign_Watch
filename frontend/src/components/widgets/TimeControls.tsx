import React from 'react';
import { Play, Pause, X } from 'lucide-react';

interface TimeControlsProps {
    isOpen: boolean;
    isPlaying: boolean;
    currentTime: number; // Unix timestamp ms
    startTime: number;
    endTime: number;
    playbackSpeed: number;
    historyDuration: number; // hours
    loadedPointCount?: number;
    loadedTrackCount?: number;
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
    loadedPointCount = 0,
    loadedTrackCount = 0,
    onTogglePlay,
    onSeek,
    onSpeedChange,
    onDurationChange,
    onClose,
}) => {
    if (!isOpen) return null;

    const progress = Math.max(0, Math.min(1, (currentTime - startTime) / (endTime - startTime)));
    const formatTime = (ts: number) => new Date(ts).toLocaleTimeString();
    const isSampled = loadedPointCount >= 10000;

    return (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 w-[640px] animate-in slide-in-from-top duration-300">
            <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-lg shadow-[0_4px_30px_rgba(0,0,0,0.5)] overflow-hidden">
                
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

                {/* Controls Row */}
                <div className="flex items-center justify-between px-4 py-2.5">
                    
                    {/* Left: Play/Pause + Speed */}
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={onTogglePlay}
                            aria-label={isPlaying ? "Pause playback" : "Play playback"}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-hud-green/10 hover:bg-hud-green/30 text-hud-green border border-hud-green/50 transition-all active:scale-95 shadow-[0_0_10px_rgba(0,255,65,0.2)] hover:shadow-[0_0_15px_rgba(0,255,65,0.4)] focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
                        >
                            {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                        </button>
                        
                        <div className="flex bg-black/40 rounded border border-white/10 p-0.5">
                            {[1, 5, 10, 30].map(speed => (
                                <button
                                    key={speed}
                                    onClick={() => onSpeedChange(speed)}
                                    aria-label={`Set playback speed to ${speed}x`}
                                    aria-pressed={playbackSpeed === speed}
                                    className={`px-2 py-0.5 text-[9px] font-bold rounded min-w-[28px] transition-colors focus-visible:ring-1 focus-visible:ring-hud-green outline-none ${
                                        playbackSpeed === speed 
                                        ? 'bg-hud-green/20 text-hud-green shadow-[0_0_5px_rgba(0,255,65,0.3)] border border-hud-green/30' 
                                        : 'text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent'
                                    }`}
                                >
                                    {speed}x
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Center: Duration Selector */}
                    <div className="flex items-center gap-2">
                        <span className="text-[9px] text-white/40 font-bold tracking-wider">LOOKBACK:</span>
                        <div className="flex bg-black/40 rounded border border-white/10 p-0.5">
                            {[1, 6, 12, 24].map(hours => (
                                <button
                                    key={hours}
                                    onClick={() => onDurationChange(hours)}
                                    aria-label={`Set lookback duration to ${hours} hours`}
                                    aria-pressed={historyDuration === hours}
                                    className={`px-2 py-0.5 text-[9px] font-bold rounded min-w-[28px] transition-colors focus-visible:ring-1 focus-visible:ring-hud-green outline-none ${
                                        historyDuration === hours
                                        ? 'bg-amber-500/20 text-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.3)] border border-amber-500/30' 
                                        : 'text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent'
                                    }`}
                                >
                                    {hours}h
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Right: Time Display + Close */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shadow-[0_0_5px_#f59e0b]" />
                            <span className="text-sm font-bold tabular-nums tracking-wider text-hud-green leading-none text-right min-w-[90px] drop-shadow-[0_0_8px_rgba(0,255,65,0.6)]">
                                {formatTime(currentTime)}
                            </span>
                        </div>
                        <button
                            onClick={onClose}
                            aria-label="Exit replay mode"
                            className="w-6 h-6 flex items-center justify-center rounded text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors border border-transparent hover:border-white/10 focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
                        >
                            <X size={12} />
                        </button>
                    </div>
                </div>

                {/* Density Strip */}
                {loadedPointCount > 0 && (
                    <div className="flex items-center justify-between px-4 pb-2">
                        <span className="text-[8px] text-white/25 font-mono tabular-nums">
                            {loadedTrackCount} tracks · {loadedPointCount.toLocaleString()} pts
                        </span>
                        {isSampled && (
                            <span className="text-[8px] text-amber-400/60 font-bold tracking-widest">
                                ⚠ SAMPLED
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
