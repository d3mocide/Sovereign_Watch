import React from 'react';
import { CoTEntity } from '../../types';

import { Plane, Ship, Satellite, Zap, Crosshair, Radio, Signal } from 'lucide-react';

interface MapTooltipProps {
  entity: CoTEntity;
  position: { x: number; y: number };
}

export const MapTooltip: React.FC<MapTooltipProps> = ({ entity, position }) => {
  const isShip = entity.type.includes('S');
  const isRepeater = entity.type === 'repeater';
  const isJS8 = entity.type === 'js8';

  const accentColor = isRepeater
    ? 'text-teal-400'
    : isJS8
    ? 'text-emerald-400'
    : isShip
    ? 'text-sea-accent'
    : 'text-air-accent';

  const borderColor = isRepeater
    ? 'border-teal-400/50'
    : isJS8
    ? 'border-emerald-400/50'
    : isShip
    ? 'border-sea-accent/50'
    : 'border-air-accent/50';

  const HeaderIcon = isRepeater
    ? Radio
    : isJS8
    ? Signal
    : isShip
    ? Ship
    : Plane;
  const isOrbital = entity.type === "a-s-K" || (typeof entity.type === "string" && entity.type.indexOf("K") === 4);
  const accentColor = isOrbital ? 'text-purple-400' : isShip ? 'text-sea-accent' : 'text-air-accent';
  const borderColor = isOrbital ? 'border-purple-400/50' : isShip ? 'border-sea-accent/50' : 'border-air-accent/50';

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
          <HeaderIcon size={14} className={accentColor} />
          {isOrbital ? <Satellite size={14} className={accentColor} /> : isShip ? <Ship size={14} className={accentColor} /> : <Plane size={14} className={accentColor} />}
          <span className="text-mono-sm font-bold text-white tracking-tight">{entity.callsign}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className={`h-1.5 w-1.5 rounded-full ${accentColor} animate-pulse shadow-[0_0_4px_currentColor]`} />
          <span className="text-[8px] font-mono text-white/50">
            {isRepeater ? 'INFRA' : isJS8 ? 'JS8CALL' : 'LIVE'}
          </span>
          <span className="text-[8px] font-mono text-white/50">LIVE</span>
        </div>
      </div>

      {/* Tooltip Content */}
      {isRepeater ? (
        <div className="p-3 grid grid-cols-2 gap-y-2 gap-x-4">
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">FREQ OUT</span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {(entity.detail?.frequency as string) || '--'} MHz
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">CTCSS/PL</span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {(entity.detail?.ctcss as string) || 'none'}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">ACCESS</span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {(entity.detail?.use as string) || '--'}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">STATUS</span>
            <span className={`text-[10px] font-mono font-bold leading-tight ${
              String(entity.detail?.status ?? '').toLowerCase().includes('off')
                ? 'text-red-400'
                : 'text-teal-400'
            }`}>
              {(entity.detail?.status as string) || '--'}
            </span>
          </div>
          <div className="col-span-2">
            <span className="text-[8px] text-white/40 block leading-tight">LOCATION</span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {[entity.detail?.city, entity.detail?.state].filter(Boolean).join(', ') || '--'}
            </span>
          </div>
          {entity.detail?.modes && (
            <div className="col-span-2">
              <span className="text-[8px] text-white/40 block leading-tight">MODES</span>
              <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
                {entity.detail.modes as string}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="p-3 grid grid-cols-2 gap-y-2 gap-x-4">
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">TYPE</span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {isJS8 ? 'JS8CALL' : isShip ? 'MARITIME' : 'AVIONICS'}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">SPEED</span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {(entity.speed * 1.94384).toFixed(1)} kts
            </span>
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
      <div className="p-3 grid grid-cols-2 gap-y-2 gap-x-4">
        <div>
          <span className="text-[8px] text-white/40 block leading-tight">TYPE</span>
          <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">{isOrbital ? 'ORBITAL' : isShip ? 'MARITIME' : 'AVIONICS'}</span>
        </div>
        <div>
          <span className="text-[8px] text-white/40 block leading-tight">SPEED</span>
          <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">{isOrbital ? `${(entity.speed / 1000).toFixed(2)} km/s` : `${(entity.speed * 1.94384).toFixed(1)} kts`}</span>
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
      )}

      {/* Hint Footer */}
      <div className="px-3 py-1 bg-white/5 border-t border-white/5 flex items-center gap-2">
        <Crosshair size={10} className="text-white/20" />
        <span className="text-[8px] text-white/30 font-mono uppercase tracking-widest">Select for details</span>
      </div>
    </div>
  );
};
