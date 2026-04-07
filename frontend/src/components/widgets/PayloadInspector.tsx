import React, { useState, useEffect, useRef } from 'react';
import { CoTEntity } from '../../types';
import { Terminal, Copy, Check, X } from 'lucide-react';
import { syntaxHighlightJson } from '../../utils/syntaxHighlight';

interface PayloadInspectorProps {
    entity: CoTEntity;
    onClose: () => void;
}

export const PayloadInspector: React.FC<PayloadInspectorProps> = ({ entity, onClose }) => {
    const [copied, setCopied] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    // Determine colors based on type
    const isShip = entity.type.includes('S');
    const accentColor = isShip ? 'text-sea-accent' : 'text-air-accent';
    const accentBg = isShip ? 'bg-gradient-to-br from-sea-accent/20 to-sea-accent/5' : 'bg-gradient-to-br from-air-accent/20 to-air-accent/5';
    const accentBorder = isShip ? 'border-sea-accent/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]' : 'border-air-accent/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]';

    const handleCopy = () => {
        if (entity.raw) {
            navigator.clipboard.writeText(entity.raw);
            setCopied(true);
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            timeoutRef.current = setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className={`flex flex-col h-full animate-in slide-in-from-right duration-300`}>
            {/* Header */}
            <div className={`flex justify-between items-center p-3 border-b-0 ${accentBorder} ${accentBg} backdrop-blur-md rounded-t-sm`}>
                <div className="flex items-center gap-2">
                    <Terminal size={14} className={accentColor} />
                    <h3 className="text-xs font-bold tracking-widest text-white/80">RAW_PAYLOAD</h3>
                </div>
                <div className="flex items-center gap-2">
                    {entity.raw && (
                        <button
                            onClick={handleCopy}
                            aria-label={copied ? "Copied to clipboard" : "Copy raw payload to clipboard"}
                            title={copied ? "Copied!" : "Copy payload"}
                            className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white transition-colors focus-visible:ring-1 focus-visible:ring-air-accent outline-none"
                        >
                            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        aria-label="Close payload inspector"
                        title="Close inspector"
                        className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white transition-colors focus-visible:ring-1 focus-visible:ring-air-accent outline-none"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar font-mono text-[10px] bg-black/90 backdrop-blur-md border border-t-0 border-white/10 rounded-b-sm">
                {/* Raw JSON Source */}
                <div className="mb-4 relative">
                    <div className="text-white/40 mb-1 font-bold flex items-center gap-2">
                        <span>SOURCE_PAYLOAD</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    </div>
                    {entity.raw ? (
                        <pre
                            className="p-3 bg-black/60 border border-white/5 rounded text-white overflow-x-auto select-all"
                            dangerouslySetInnerHTML={{ __html: syntaxHighlightJson(entity.raw) }}
                        />
                    ) : (
                        <div className="p-3 bg-black/60 border border-white/5 rounded text-white/30 animate-pulse">
                            AWAITING_SOURCE_DATA...
                        </div>
                    )}
                </div>

                {/* State Interpretation */}
                <div className="relative">
                     <div className="text-white/40 mb-1 font-bold flex items-center gap-2">
                        <span>INTERNAL_STATE</span>
                     </div>
                     <pre
                         className="p-3 bg-black/60 border border-white/5 rounded text-white overflow-x-auto select-all opacity-80"
                         dangerouslySetInnerHTML={{
                             __html: syntaxHighlightJson(JSON.stringify(entity, (key, value) => {
                                 if (key === 'raw' || key === 'trail' || key === 'smoothedTrail') return undefined;
                                 return value;
                             }, 2))
                         }}
                     />
                </div>
            </div>
        </div>
    );
};
