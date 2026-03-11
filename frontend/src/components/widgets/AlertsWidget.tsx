import React from 'react';
import { ShieldAlert, X, AlertTriangle } from 'lucide-react';
import { IntelEvent } from '../../types';

interface AlertsWidgetProps {
    isOpen: boolean;
    alerts: IntelEvent[];
    onClose: () => void;
}

export const AlertsWidget: React.FC<AlertsWidgetProps> = ({
    isOpen,
    alerts,
    onClose
}) => {
    if (!isOpen) return null;

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    return (
        <div className="absolute top-[calc(100%+20px)] left-1/2 -translate-x-1/2 z-[100] w-[350px] animate-in slide-in-from-top-4 fade-in duration-200">
            <div className="bg-black/80 backdrop-blur-xl border border-alert-red/30 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[600px]">

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-alert-red/20 bg-alert-red/10">
                    <div className="flex items-center gap-2">
                        <ShieldAlert size={16} className="text-alert-red drop-shadow-[0_0_8px_rgba(255,0,0,0.8)]" />
                        <h3 className="text-xs font-black tracking-widest text-alert-red drop-shadow-[0_0_5px_rgba(255,0,0,0.5)]">
                            ACTIVE ALERTS
                        </h3>
                        <div className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-alert-red/20 text-alert-red border border-alert-red/30">
                            {alerts.length}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors focus-visible:ring-1 focus-visible:ring-alert-red outline-none"
                    >
                        <X size={14} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-alert-red/20 scrollbar-track-transparent">
                    {alerts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-white/30 gap-3">
                            <ShieldAlert size={32} className="opacity-20" />
                            <p className="text-xs font-bold tracking-widest">NO ACTIVE ALERTS</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {alerts.map(alert => (
                                <div
                                    key={alert.id}
                                    className="p-3 rounded-md bg-alert-red/5 border border-alert-red/20 flex gap-3 group hover:bg-alert-red/10 transition-colors"
                                >
                                    <div className="mt-0.5">
                                        <AlertTriangle size={14} className="text-alert-red" />
                                    </div>
                                    <div className="flex-1 flex flex-col gap-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold tracking-wider text-alert-red uppercase">
                                                {alert.entityType || 'SYSTEM'} ALERT
                                            </span>
                                            <span className="text-[10px] font-mono text-white/40">
                                                {formatTime(alert.time)} Z
                                            </span>
                                        </div>
                                        <p className="text-xs text-white/80 leading-relaxed font-mono">
                                            {alert.message}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
