import React, { useEffect, useState } from 'react';
import { Activity, CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';

interface StreamStatus {
    id: string;
    name: string;
    status: 'Active' | 'Missing Key' | 'Disabled';
}

interface SystemHealthWidgetProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SystemHealthWidget: React.FC<SystemHealthWidgetProps> = ({
    isOpen,
    onClose,
}) => {
    const [streams, setStreams] = useState<StreamStatus[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isOpen) return;

        let mounted = true;
        setLoading(true);

        fetch('/api/config/streams')
            .then(res => res.json())
            .then((data: StreamStatus[]) => {
                if (mounted) {
                    setStreams(data);
                    setLoading(false);
                }
            })
            .catch(err => {
                console.error("Failed to fetch stream health:", err);
                if (mounted) setLoading(false);
            });

        return () => {
            mounted = false;
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'Active':
                return <CheckCircle2 size={12} className="text-hud-green drop-shadow-[0_0_5px_rgba(0,255,65,0.8)]" />;
            case 'Missing Key':
                return <AlertTriangle size={12} className="text-amber-500 drop-shadow-[0_0_5px_rgba(245,158,11,0.8)]" />;
            case 'Disabled':
            default:
                return <XCircle size={12} className="text-white/30" />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Active':
                return 'text-hud-green drop-shadow-[0_0_2px_rgba(0,255,65,0.5)]';
            case 'Missing Key':
                return 'text-amber-500 drop-shadow-[0_0_2px_rgba(245,158,11,0.5)]';
            case 'Disabled':
            default:
                return 'text-white/40';
        }
    };

    return (
        <div
            className="absolute top-[calc(100%+20px)] left-1/2 -translate-x-1/2 z-[100] w-[260px] animate-in slide-in-from-top-2 fade-in duration-200"
            onClick={(e) => e.stopPropagation()} // Prevent bubbling up to the toggle button
            role="dialog"
            aria-label="System Health Checker"
        >
            <div className="bg-black/90 backdrop-blur-xl border border-hud-green/30 rounded-lg shadow-[0_0_15px_rgba(0,255,65,0.15)] overflow-hidden flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-hud-green/20 bg-hud-green/10">
                    <div className="flex items-center gap-2">
                        <Activity size={14} className="text-hud-green drop-shadow-[0_0_8px_rgba(0,255,65,0.8)] animate-pulse" />
                        <h3 className="text-[10px] font-black tracking-widest text-hud-green drop-shadow-[0_0_5px_rgba(0,255,65,0.5)] uppercase">
                            SYSTEM HEALTH
                        </h3>
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                        className="p-1 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
                    >
                        <X size={12} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex flex-col gap-1 p-2" aria-live="polite" aria-busy={loading}>
                    {loading ? (
                        <div className="flex items-center justify-center p-4">
                            <div className="h-4 w-4 rounded-full border-2 border-hud-green/20 border-t-hud-green animate-spin" />
                            <span className="ml-2 text-[10px] text-white/40 tracking-widest font-mono">DIAGNOSING...</span>
                        </div>
                    ) : streams.length === 0 ? (
                        <div className="flex items-center justify-center p-4 text-[10px] text-white/40 font-mono tracking-wider">
                            NO DATA AVAILABLE
                        </div>
                    ) : (
                        streams.map((stream) => (
                            <div key={stream.id} className="flex items-center justify-between px-2 py-1.5 rounded bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                                <div className="flex items-center gap-2">
                                    {getStatusIcon(stream.status)}
                                    <span className="text-[10px] font-bold tracking-wider text-white/80 font-mono uppercase">
                                        {stream.name}
                                    </span>
                                </div>
                                <span className={`text-[9px] font-bold tracking-widest font-mono uppercase ${getStatusColor(stream.status)}`}>
                                    {stream.status}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
