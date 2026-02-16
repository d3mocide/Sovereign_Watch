import React from 'react';
import { CoTEntity } from '../../types';
import { Plane, Ship, Zap, Crosshair } from 'lucide-react';

interface MapTooltipProps {
  entity: CoTEntity;
  position: { x: number; y: number };
}

export const MapTooltip: React.FC<MapTooltipProps> = ({ entity, position }) => {
  const isShip = entity.type.includes('S');
  const accentColor = isShip ? 'text-sea-accent' : 'text-air-accent';
  const borderColor = isShip ? 'border-sea-accent/50' : 'border-air-accent/50';

  return (
    <div
      style={{
        position: 'absolute',
        left: position.x + 20,
        top: position.y - 40,
        pointerEvents: 'none',
        zIndex: 100,
      }}
      className={`animate-in fade-in zoom-in-95 duration-200 min-w-[200px] bg-black/95 backdrop-blur-md border ${borderColor} rounded-sm overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.6)]`}
    >
      {/* Tooltip Header */}
      <div className={`px-3 py-1.5 flex items-center justify-between border-b ${borderColor} bg-white-[2%]`}>
        <div className="flex items-center gap-2">
            {isShip ? <Ship size={14} className={accentColor} /> : <Plane size={14} className={accentColor} />}
            <span className="text-mono-sm font-bold text-white tracking-tight">{entity.callsign}</span>
        </div>
        <div className="flex items-center gap-1">
            <div className={`h-1.5 w-1.5 rounded-full ${accentColor} animate-pulse shadow-[0_0_4px_currentColor]`} />
            <span className="text-[8px] font-mono text-white/50">LIVE</span>
        </div>
      </div>

      {/* Tooltip Content */}
      <div className="p-3 grid grid-cols-2 gap-y-2 gap-x-4">
        <div>
            <span className="text-[8px] text-white/40 block leading-tight">TYPE</span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">{isShip ? 'MARITIME' : 'AVIONICS'}</span>
        </div>
        <div>
            <span className="text-[8px] text-white/40 block leading-tight">SPEED</span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">{(entity.speed * 1.94384).toFixed(1)} kts</span>
        </div>
        <div>
            <span className="text-[8px] text-white/40 block leading-tight">CRS</span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">{Math.round(entity.course)}°</span>
        </div>
        <div>
            <span className="text-[8px] text-white/40 block leading-tight">STATUS</span>
            <span className="text-[10px] text-hud-green font-mono font-bold leading-tight flex items-center gap-1">
                <Zap size={8} /> TRACKING
            </span>
        </div>
      </div>

      {/* Hint Footer */}
      <div className="px-3 py-1 bg-white/5 border-t border-white/5 flex items-center gap-2">
         <Crosshair size={10} className="text-white/20" />
         <span className="text-[8px] text-white/30 font-mono uppercase tracking-widest">Select for details</span>
      </div>
    </div>
  );
};
