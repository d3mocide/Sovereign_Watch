import React, { useState, useRef, useEffect } from 'react';
import { BrainCircuit, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useAIConfig } from '../../hooks/useAIConfig';

export const AIEngineWidget: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const { config: aiConfig, isSaving, selectModel } = useAIConfig();
    const widgetRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const activeModelLabel = aiConfig?.available_models.find(m => m.id === aiConfig.active_model)?.label ?? aiConfig?.active_model ?? "AI ENGINE";

    return (
        <div className="flex items-center px-1 relative" ref={widgetRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`group relative flex items-center gap-2 rounded-full px-3 py-1 transition-all duration-300 backdrop-blur-md shadow-lg ${isOpen ? 'bg-violet-500/20 ring-1 ring-violet-500/50' : 'bg-black/30 ring-1 ring-white/10 hover:bg-black/50 hover:ring-white/20'}`}
                title="Select AI Engine"
            >
                <BrainCircuit size={15} className={`transition-colors ${isOpen ? 'text-violet-400 drop-shadow-[0_0_8px_rgba(167,139,250,0.8)]' : 'text-violet-400/70 group-hover:text-violet-400'}`} />
                <span className={`font-mono text-[10px] font-bold tracking-widest truncate max-w-[50px] transition-colors ${isOpen ? 'text-violet-300 drop-shadow-[0_0_5px_rgba(167,139,250,0.5)]' : 'text-white/60 group-hover:text-white/80'}`}>
                    {activeModelLabel.toUpperCase()}
                </span>
                {isOpen ? <ChevronUp size={12} className="text-violet-400" /> : <ChevronDown size={12} className="text-white/40" />}
            </button>

            {isOpen && (
                <div className="absolute top-[calc(100%+20px)] left-1/2 -translate-x-1/2 z-[100] w-[280px] animate-in slide-in-from-top-2 fade-in duration-200">
                    <div className="bg-black/90 backdrop-blur-xl border border-violet-500/30 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[400px]">
                        {/* Header */}
                        <div className="flex items-center justify-between px-3 py-2 border-b border-violet-500/20 bg-violet-500/10">
                            <div className="flex items-center gap-2">
                                <BrainCircuit size={14} className="text-violet-400 drop-shadow-[0_0_5px_rgba(167,139,250,0.8)]" />
                                <h3 className="text-[10px] font-black tracking-widest text-violet-300 drop-shadow-[0_0_5px_rgba(167,139,250,0.5)] uppercase">
                                    AI Engine Selection
                                </h3>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-2 space-y-1.5 overflow-y-auto scrollbar-thin scrollbar-thumb-violet-500/30 scrollbar-track-transparent">
                            {!aiConfig ? (
                                <div className="flex items-center justify-center gap-2 px-1 py-4 text-xs text-violet-300/50 font-mono">
                                    <Loader2 size={14} className="animate-spin" />
                                    <span>Establishing Link...</span>
                                </div>
                            ) : (
                                aiConfig.available_models.map(model => {
                                    const isActive = model.id === aiConfig.active_model;
                                    return (
                                        <button
                                            key={model.id}
                                            disabled={isSaving}
                                            onClick={() => {
                                                selectModel(model.id);
                                                setIsOpen(false);
                                            }}
                                            className={`w-full flex items-center justify-between p-2 rounded-md border transition-all text-left group ${isActive
                                                ? 'bg-violet-500/20 border-violet-400/50 shadow-[0_0_10px_rgba(139,92,246,0.2)]'
                                                : 'bg-black/40 border-white/5 hover:bg-violet-500/10 hover:border-violet-500/30'
                                                }`}
                                        >
                                            <div className="flex flex-col gap-0.5 min-w-0">
                                                <span className={`text-[10px] font-bold tracking-wider truncate ${isActive ? 'text-violet-300 drop-shadow-[0_0_5px_rgba(167,139,250,0.5)]' : 'text-white/70 group-hover:text-white/90'}`}>
                                                    {model.label}
                                                </span>
                                                <span className={`text-[8px] font-mono ${model.local ? 'text-emerald-400/80 drop-shadow-[0_0_3px_rgba(52,211,153,0.5)]' : 'text-white/40 group-hover:text-white/60'}`}>
                                                    {model.local ? 'LOCAL · ' : ''}{model.provider.toUpperCase()}
                                                </span>
                                            </div>
                                            <div className={`shrink-0 h-2 w-2 rounded-full ml-2 transition-colors duration-300 ${isActive ? 'bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.9)] scale-110' : 'bg-white/10 group-hover:bg-white/30'
                                                }`} />
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
