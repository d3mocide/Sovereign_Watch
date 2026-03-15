import { Radio } from 'lucide-react';

interface RFLegendProps {
    visible: boolean;
}

export const RFLegend: React.FC<RFLegendProps> = ({ visible }) => {
    if (!visible) return null;

    const sections = [
        { label: 'NOAA NWR', color: 'rgb(14, 165, 233)' },     // sky-500
        { label: 'Safety', color: 'rgb(245, 158, 11)' }, // amber-500
        { label: 'Digital', color: 'rgb(139, 92, 246)' },   // violet-500
        { label: 'Standard', color: 'rgb(16, 185, 129)' },   // emerald-500
        { label: 'Off-Air', color: 'rgb(100, 116, 139)' },      // slate-500
    ];

    return (
        <div className="absolute left-[410px] top-[568px] z-10 w-[110px] pointer-events-none select-none flex flex-col widget-panel overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
            {/* Header */}
            <div className="px-3 py-2 bg-white/5 border-b border-white/10 flex items-center gap-2">
                <Radio size={12} className="text-emerald-400" />
                <span className="text-[9px] font-bold tracking-[.3em] text-white/50 uppercase">
                    RF
                </span>
            </div>

            <div className="p-3 flex flex-col gap-3">
                {/* Service Types */}
                <div className="flex flex-col gap-2">
                    <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider mb-1">Service Type</span>
                    {sections.map((s) => (
                        <div key={s.label} className="flex items-center gap-2">
                            <div 
                                className="w-2 h-2 rounded-full border border-black/40 ring-1 ring-white/10"
                                style={{ backgroundColor: s.color }}
                            />
                            <span className="text-[9px] font-mono font-bold text-white/70">{s.label}</span>
                        </div>
                    ))}
                </div>

                {/* Network Status / Outlines */}
                <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
                    <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider mb-1">Alert Status</span>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 border-[1.5px] border-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]" />
                        <span className="text-[9px] font-mono font-bold text-white/70">EMCOMM Flag</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
