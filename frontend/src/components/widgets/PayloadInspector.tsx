import React from 'react';
import { CoTEntity } from '../../types';
import { Terminal, Copy, X } from 'lucide-react';

interface PayloadInspectorProps {
    entity: CoTEntity;
    onClose: () => void;
}

export const PayloadInspector: React.FC<PayloadInspectorProps> = ({ entity, onClose }) => {
    // Determine colors based on type
    const isShip = entity.type.includes('S');
    const accentColor = isShip ? 'text-sea-accent' : 'text-air-accent';
    const accentBg = isShip ? 'bg-gradient-to-br from-sea-accent/20 to-sea-accent/5' : 'bg-gradient-to-br from-air-accent/20 to-air-accent/5';
    const accentBorder = isShip ? 'border-sea-accent/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]' : 'border-air-accent/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]';

    const handleCopy = () => {
        if (entity.raw) {
            navigator.clipboard.writeText(entity.raw);
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
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white transition-colors">
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar font-mono text-[10px] bg-black/80 backdrop-blur-md border border-t-0 border-white/10 rounded-b-sm">
                {/* Hex View */}
                <div className="mb-4">
                    <div className="text-white/30 mb-1 font-bold">HEX_DUMP</div>
                    <div className="p-2 bg-black/50 border border-white/5 rounded text-hud-green/80 break-all select-all leading-relaxed relative group">
                        {entity.raw || "NO_RAW_DATA_AVAILABLE"}
                    </div>
                </div>

                {/* JSON Interpretation */}
                <div>
                     <div className="text-white/30 mb-1 font-bold">DECODED_JSON</div>
                     <pre className="p-2 bg-black/50 border border-white/5 rounded text-cyan-400/80 overflow-x-auto select-all">
                        {JSON.stringify(entity, (key, value) => {
                            if (key === 'raw' || key === 'trail') return undefined; // Hide raw/trail in JSON view to save space
                            return value;
                        }, 2)}
                     </pre>
                </div>
            </div>
        </div>
    );
};
