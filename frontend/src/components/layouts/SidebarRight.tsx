import React from 'react';
import { CoTEntity } from '../../types';
import { Compass } from '../widgets/Compass';
import { Crosshair, Map as MapIcon, Shield, Info, Activity, Terminal } from 'lucide-react';

interface SidebarRightProps {
  entity: CoTEntity | null;
  onClose: () => void;
  onCenterMap?: (lat: number, lon: number) => void;
}

export const SidebarRight: React.FC<SidebarRightProps> = ({ 
  entity, 
  onClose,
  onCenterMap
}) => {
  if (!entity) return null;

  const isShip = entity.type.includes('S');
  const accentColor = isShip ? 'text-sea-green' : 'text-air-cyan';
  const accentBg = isShip ? 'bg-gradient-to-br from-sea-green/20 to-sea-green/5' : 'bg-gradient-to-br from-air-cyan/20 to-air-cyan/5';
  const accentBorder = isShip ? 'border-sea-green/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]' : 'border-air-cyan/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]';

  return (
    <div className="pointer-events-auto flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-500">
      {/* 1. Target Identity Header */}
      <div className={`p-4 border border-b-0 ${accentBorder} ${accentBg} backdrop-blur-md rounded-t-sm relative overflow-hidden`}>
        {/* Glass Reflection Shine */}

        
        <div className="relative z-10 flex justify-between items-start">
          <div className="flex flex-col">
             <div className="flex items-center gap-2 mb-1">
                <Shield size={14} className={accentColor} />
                <span className="text-[10px] font-bold tracking-[.3em] text-white/40">IDENTIFIED_TARGET</span>
             </div>
             <h2 className={`text-mono-xl font-bold tracking-tighter ${accentColor} drop-shadow-[0_0_8px_currentColor]`}>
               {entity.callsign}
             </h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-white/30 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Global IDs */}
        <div className="mt-3 flex gap-2 overflow-hidden">
            <div className="bg-black/60 px-2 py-1 rounded border border-white/5 flex flex-col min-w-0 shadow-inner">
                <span className="text-[8px] text-white/30 uppercase font-bold tracking-tight">TYPE_TAG</span>
                <span className="text-mono-xs truncate text-white/90">{entity.type}</span>
            </div>
            <div className="bg-black/60 px-2 py-1 rounded border border-white/5 flex flex-col flex-1 shadow-inner">
                <span className="text-[8px] text-white/30 uppercase font-bold tracking-tight">PLATFORM_UID</span>
                <span className="text-mono-xs truncate tabular-nums text-white/90">{entity.uid.split('-')[0]}</span>
            </div>
        </div>

        {/* Actions Bar */}
        <div className="mt-2 flex gap-2">
            <button 
                onClick={() => onCenterMap?.(entity.lat, entity.lon)}
                className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-b from-hud-green/30 to-hud-green/10 hover:from-hud-green/40 hover:to-hud-green/20 border border-hud-green/50 py-1.5 rounded text-[10px] font-bold tracking-widest text-hud-green transition-all active:scale-[0.98] shadow-[0_0_15px_rgba(0,255,65,0.1)]"
            >
                <Crosshair size={12} />
                CENTER_VIEW
            </button>
            <button className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-b from-white/10 to-transparent hover:from-white/20 hover:to-white/5 border border-white/10 py-1.5 rounded text-[10px] font-bold tracking-widest text-white/70 transition-all active:scale-[0.98]">
                <MapIcon size={12} />
                TRACK_LOG
            </button>
        </div>
      </div>

      {/* 2. Main Data Body */}
      <div className="flex-1 overflow-y-auto border-x border-tactical-border bg-black/30 backdrop-blur-md p-4 space-y-4 scrollbar-none">
        
        {/* Positional Group */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-hud-green/40 border-b border-hud-green/10 pb-1">
             <Activity size={12} />
             <h3 className="text-[10px] font-bold uppercase tracking-widest">Positional_Telemetry</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
             <div className="bg-white/5 border border-white/5 p-2 rounded shadow-inner">
                <span className="text-[9px] text-white/30 block mb-0.5">LATITUDE</span>
                <span className="text-mono-base font-bold text-white tabular-nums">
                    {entity.lat.toFixed(6)}°
                </span>
             </div>
             <div className="bg-white/5 border border-white/5 p-2 rounded shadow-inner">
                <span className="text-[9px] text-white/30 block mb-0.5">LONGITUDE</span>
                <span className="text-mono-base font-bold text-white tabular-nums">
                    {entity.lon.toFixed(6)}°
                </span>
             </div>
          </div>
        </section>

        {/* Kinematics Group */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-hud-green/40 border-b border-hud-green/10 pb-1">
             <Terminal size={12} />
             <h3 className="text-[10px] font-bold uppercase tracking-widest">Vector_Dynamics</h3>
          </div>
          <div className={`grid ${isShip ? 'grid-cols-2' : 'grid-cols-3'} gap-2`}>
             <div className="bg-white/5 border border-white/5 p-2 rounded">
                <span className="text-[9px] text-white/30 block mb-1">SPEED_KTS</span>
                <span className={`text-mono-base font-bold ${accentColor} tabular-nums`}>
                    {(entity.speed * 1.94384).toFixed(1)}
                </span>
             </div>
             <div className="bg-white/5 border border-white/5 p-2 rounded">
                <span className="text-[9px] text-white/30 block mb-1">HEADING</span>
                <span className={`text-mono-base font-bold ${accentColor} tabular-nums`}>
                    {Math.round(entity.course)}°
                </span>
             </div>
             {!isShip && (
                <div className="bg-white/5 border border-white/5 p-2 rounded">
                   <span className="text-[9px] text-white/30 block mb-1">ALTITUDE_FT</span>
                   <span className={`text-mono-base font-bold tabular-nums ${(() => {
                        const ft = entity.altitude * 3.28084;
                        if (ft < 200) return 'text-sky-400';
                        if (ft < 5000) return 'text-yellow-400';
                        if (ft < 25000) return 'text-orange-400';
                        return 'text-red-400';
                    })()}`}>
                       {entity.altitude > 0 ? Math.round(entity.altitude * 3.28084).toLocaleString() : 'GND'}
                   </span>
                </div>
             )}
          </div>
          
          {/* Linked Compass Widget */}
          <Compass heading={entity.course} size={140} />
        </section>

        {/* Metadata Group */}
        <section className="space-y-2">
           <div className="flex items-center gap-2 text-hud-green/40 border-b border-hud-green/10 pb-1">
             <Info size={12} />
             <h3 className="text-[10px] font-bold uppercase tracking-widest">Metadata_Source</h3>
          </div>
          <div className="flex flex-col gap-2 pt-2">
             <div className="flex justify-between items-baseline py-1 border-b border-white-[3%]">
                <span className="text-[10px] text-white/40">Last_Update</span>
                <span className="text-mono-xs text-white/80 tabular-nums">
                   {((Date.now() - entity.lastSeen) / 1000).toFixed(1)}s ago
                </span>
             </div>
             <div className="flex justify-between items-baseline py-1 border-b border-white-[3%]">
                <span className="text-[10px] text-white/40">Signal_Source</span>
                <span className="text-mono-xs text-white/80">{isShip ? 'AIS_BENTHOS' : 'ADSB_DIRECT'}</span>
             </div>
             <div className="flex justify-between items-baseline py-1 border-b border-white-[3%]">
                <span className="text-[10px] text-white/40">Security_Clearance</span>
                <span className="text-mono-xs text-hud-green">LEVEL_01_PUBLIC</span>
             </div>
          </div>
        </section>
      </div>

      {/* 3. Footer Actions */}
      <div className="p-4 border border-t-0 border-tactical-border bg-black/40 backdrop-blur-md rounded-b-sm">
         <button className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded group transition-all">
            <div className="flex items-center justify-between px-3">
                <span className="text-[10px] font-bold tracking-[.4em] text-white/30 group-hover:text-white/60">RAW_PAYLOAD_EVAL</span>
                <Terminal size={14} className="text-white/20" />
            </div>
         </button>
      </div>
    </div>
  );
};

export default SidebarRight;
