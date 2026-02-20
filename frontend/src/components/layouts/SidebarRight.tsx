import React from 'react';
import { CoTEntity } from '../../types';
import { Compass } from '../widgets/Compass';
import { Crosshair, Map as MapIcon, Shield, Terminal } from 'lucide-react';
import { TimeTracked } from './TimeTracked';
import { PayloadInspector } from '../widgets/PayloadInspector';

export const NAV_STATUS_MAP: Record<number, string> = {
    0: 'Under way using engine',
    1: 'At anchor',
    2: 'Not under command',
    3: 'Restricted maneuverability',
    4: 'Constrained by draught',
    5: 'Moored',
    6: 'Aground',
    7: 'Engaged in fishing',
    8: 'Under way sailing',
    14: 'AIS-SART active',
    15: 'Not defined'
};

export const SHIP_TYPE_MAP: Record<number, string> = {
    30: 'Fishing vessel',
    35: 'Military operations',
    37: 'Pleasure craft',
    52: 'Tug',
    55: 'Law enforcement',
    60: 'Passenger ship',
    70: 'Cargo ship',
    80: 'Tanker'
};

interface SidebarRightProps {
  entity: CoTEntity | null;
  onClose: () => void;
  onCenterMap?: () => void;
}

export const SidebarRight: React.FC<SidebarRightProps> = ({ 
  entity, 
  onClose,
  onCenterMap
}) => {
  const [showInspector, setShowInspector] = React.useState(false);

  // Reset inspector when entity changes
  React.useEffect(() => {
      setShowInspector(false);
  }, [entity?.uid]);

  if (!entity) return null;

  const isShip = entity.type.includes('S');
  const accentColor = isShip ? 'text-sea-accent' : 'text-air-accent';
  const accentBg = isShip ? 'bg-gradient-to-br from-sea-accent/20 to-sea-accent/5' : 'bg-gradient-to-br from-air-accent/20 to-air-accent/5';
  const accentBorder = isShip ? 'border-sea-accent/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]' : 'border-air-accent/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]';

  if (showInspector) {
      return (
          <div className="pointer-events-auto h-full animate-in slide-in-from-right duration-500 w-full">
               <PayloadInspector entity={entity} onClose={() => setShowInspector(false)} />
          </div>
      );
  }

  return (
    <div className="pointer-events-auto flex flex-col h-auto max-h-full overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
      {/* 1. Target Identity Header */}
      <div className={`p-3 border border-b-0 ${accentBorder} ${accentBg} backdrop-blur-md rounded-t-sm relative overflow-hidden`}>
        {/* Glass Reflection Shine */}

        
        <div className="relative z-10 flex justify-between items-start">
          <div className="flex flex-col">
             <div className="flex items-center gap-2 mb-1">
                <Shield size={14} className={accentColor} />
                <span className="text-[10px] font-bold tracking-[.3em] text-white/40">IDENTIFIED_TARGET</span>
                {entity.classification && !isShip && (
                    <div className="flex gap-1.5">
                        {entity.classification.affiliation && (
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wider ${
                                ['military', 'government'].includes(entity.classification.affiliation) ? 'bg-[#FF8800]/20 text-[#FF8800] border border-[#FF8800]/30' :
                                'bg-white/10 text-white/60 border border-white/20'
                            }`}>
                                {entity.classification.affiliation.toUpperCase()}
                            </span>
                        )}
                        {['helicopter', 'drone'].includes(entity.classification.platform || '') && (
                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wider bg-[#FF8800]/20 text-[#FF8800] border border-[#FF8800]/30">
                                {entity.classification.platform!.toUpperCase()}
                            </span>
                        )}
                    </div>
                )}
                {isShip && entity.vesselClassification?.category && (
                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wider ${
                        ['sar', 'military', 'law_enforcement'].includes(entity.vesselClassification.category) ? 'bg-[#FF8800]/20 text-[#FF8800] border border-[#FF8800]/30' :
                        entity.vesselClassification.category === 'cargo' ? 'bg-green-500/20 text-green-500 border border-green-500/30' :
                        entity.vesselClassification.category === 'tanker' ? 'bg-red-500/20 text-red-500 border border-red-500/30' :
                        entity.vesselClassification.category === 'passenger' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                        'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    }`}>
                        {entity.vesselClassification.category.toUpperCase()}
                    </span>
                )}
             </div>
             <h2 className={`text-mono-xl font-bold tracking-tighter ${accentColor} drop-shadow-[0_0_8px_currentColor] mb-2`}>
               {entity.callsign}
             </h2>

             {/* Aircraft Info Box */}
             {/* Vessel Info Box */}
             {isShip && entity.vesselClassification ? (
                <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
                    <h3 className="text-mono-sm font-bold text-white/90">
                        {SHIP_TYPE_MAP[entity.vesselClassification.shipType || 0] || 'UNKNOWN VESSEL'}
                    </h3>
                    <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                        <div className="flex gap-2">
                            <span className="text-white/30 w-16">IMO:</span>
                            <span className="text-white/80">{entity.vesselClassification.imo || 'UNKNOWN'}</span>
                        </div>
                        <div className="flex gap-2">
                            <span className="text-white/30 w-16">Flag MID:</span>
                            <span className="text-white/80">{entity.vesselClassification.flagMid || 'UNKNOWN'}</span>
                        </div>
                        {entity.vesselClassification.length !== undefined && entity.vesselClassification.length > 0 && (
                            <div className="flex gap-2">
                                <span className="text-white/30 w-16">Dimensions:</span>
                                <span className="text-white/80">{entity.vesselClassification.length}m × {entity.vesselClassification.beam}m</span>
                            </div>
                        )}
                    </div>
                </section>
             ) : entity.classification && (
                 /* Aircraft Info Box */
                <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
                    <h3 className="text-mono-sm font-bold text-white/90">
                        {entity.classification.description || entity.classification.icaoType || 'UNKNOWN_MODEL'}
                    </h3>
                    <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                        <div className="flex gap-2">
                            <span className="text-white/30 w-16">Operator:</span>
                            <span className="text-white/80">{entity.classification.operator || 'UNKNOWN'}</span>
                        </div>
                        <div className="flex gap-2">
                            <span className="text-white/30 w-16">Category:</span>
                            <span className="text-white/80">{entity.classification.category || entity.classification.sizeClass || 'UNKNOWN'}</span>
                        </div>
                    </div>
                </section>
             )}
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-white/30 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Global IDs */}
        <div className="flex gap-2 overflow-hidden mb-2">
            <div className="bg-black/40 px-2 py-1 rounded border border-white/10 flex flex-col min-w-0 shadow-inner">
                <span className="text-[8px] text-white/30 uppercase font-bold tracking-tight">TYPE_TAG</span>
                <span className="text-mono-xs font-bold truncate text-white">{entity.type}</span>
            </div>
            <div className="bg-black/40 px-2 py-1 rounded border border-white/10 flex flex-col flex-1 shadow-inner">
                <span className="text-[8px] text-white/30 uppercase font-bold tracking-tight">REGISTRATION</span>
                <span className="text-mono-xs font-bold truncate text-white">
                    {entity.classification?.registration || 'N/A'}
                </span>
            </div>
        </div>

        {/* Actions Bar */}
        <div className="flex gap-2">
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    onCenterMap?.();
                }}
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
      <div className="overflow-y-auto min-h-0 shrink border-x border-tactical-border bg-black/30 backdrop-blur-md p-3 space-y-3 scrollbar-none font-mono">
        
        {/* Positional Group */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-hud-green/40 pb-1">
             <h3 className="text-[10px] text-white/50 font-bold">Positional_Telemetry</h3>
          </div>
          <div className="flex gap-4 text-mono-xs">
             <div className="flex gap-2">
                <span className="text-white/30">LAT:</span>
                <span className="text-white tabular-nums">{entity.lat.toFixed(6)}°</span>
             </div>
             <div className="flex gap-2">
                <span className="text-white/30">LON:</span>
                <span className="text-white tabular-nums">{entity.lon.toFixed(6)}°</span>
             </div>
          </div>
        </section>

        {/* Kinematics Group */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-hud-green/40 pb-1">
             <h3 className="text-[10px] text-white/50 font-bold">Vector_Dynamics</h3>
          </div>
          
          <div className="space-y-1 text-mono-xs font-medium">
              {/* Row 1: Speed / Hdg */}
              <div className="grid grid-cols-2 gap-4">
                  <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-white/30">SOG:</span>
                      <span className={`${accentColor} tabular-nums`}>{(entity.speed * 1.94384).toFixed(1)} kts</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-white/30">COG:</span>
                      <span className={`${accentColor} tabular-nums`}>{Math.round(entity.course)}°</span>
                  </div>
              </div>

              {isShip ? (
                <>
                  {/* Row 2: Nav Status / Dest */}
                  <div className="grid grid-cols-2 gap-4">
                      <div className="flex justify-between border-b border-white/5 pb-1">
                          <span className="text-white/30">STAT:</span>
                          <span className="text-white tabular-nums truncate max-w-[120px]" title={NAV_STATUS_MAP[entity.vesselClassification?.navStatus ?? 15] || 'Unknown'}>
                              {NAV_STATUS_MAP[entity.vesselClassification?.navStatus ?? 15] || 'UNKNOWN'}
                          </span>
                      </div>
                      <div className="flex justify-between border-b border-white/5 pb-1">
                          <span className="text-white/30">DEST:</span>
                          <span className="text-white tabular-nums truncate max-w-[100px]">
                              {entity.vesselClassification?.destination || 'UNKNOWN'}
                          </span>
                      </div>
                  </div>
                  
                  {/* Row 3: Draught / Hazardous */}
                  <div className="grid grid-cols-2 gap-4">
                      <div className="flex justify-between border-b border-white/5 pb-1">
                          <span className="text-white/30">DRGT:</span>
                          <span className="text-white tabular-nums">
                              {entity.vesselClassification?.draught ? `${entity.vesselClassification.draught}m` : '---'}
                          </span>
                      </div>
                      <div className="flex justify-between border-b border-white/5 pb-1">
                          <span className="text-white/30">HAZ:</span>
                          <span className={`${entity.vesselClassification?.hazardous ? 'text-red-500 animate-pulse font-bold' : 'text-white/40'} tabular-nums`}>
                              {entity.vesselClassification?.hazardous ? 'YES' : 'NONE'}
                          </span>
                      </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Row 2: Alt / VS */}
                  <div className="grid grid-cols-2 gap-4">
                  <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-white/30">ALT:</span>
                      <span className="text-white tabular-nums">
                         {entity.altitude > 0 ? Math.round(entity.altitude * 3.28084).toLocaleString() : 'GND'} ft
                      </span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-white/30">VS:</span>
                      <span className={`${entity.vspeed && Math.abs(entity.vspeed) > 100 ? 'text-white' : 'text-white/40'} tabular-nums`}>
                          {entity.vspeed ? Math.round(entity.vspeed).toLocaleString() : '0'} fpm
                      </span>
                  </div>
              </div>

               {/* Row 3: Squawk / Emergency */}
               <div className="grid grid-cols-2 gap-4">
                  <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-white/30">SQUAWK:</span>
                      <span className="text-amber-500/80 tabular-nums">{entity.classification?.squawk || '----'}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-white/30">EMRG:</span>
                      <span className={`${entity.classification?.emergency && entity.classification.emergency !== 'none' ? 'text-alert-red animate-pulse font-bold' : 'text-white/40'} tabular-nums`}>
                          {entity.classification?.emergency ? entity.classification.emergency.toUpperCase() : 'NONE'}
                      </span>
                  </div>
              </div>
              </>
              )}
          </div>
          
          {/* Linked Compass Widget */}
          <div className="pt-1 flex justify-center opacity-80 scale-90">
             <Compass heading={entity.course} size={140} />
          </div>
        </section>

        <div className="h-px bg-white/5 w-full my-2"></div>

        {/* Metadata Group */}
        <section className="space-y-1">
           <h3 className="text-[10px] text-white/50 font-bold pb-1">Metadata_Source</h3>
           <div className="flex flex-col gap-1 text-[10px] font-mono">
              <div className="grid grid-cols-[100px_1fr]">
                 <span className="text-white/30">TIME_TRACKED:</span>
                 <span className="text-white/80"><TimeTracked lastSeen={entity.lastSeen} /></span>
              </div>
              <div className="grid grid-cols-[100px_1fr]">
                 <span className="text-white/30">Signal_Source:</span>
                 <span className="text-hud-green/80">{isShip ? 'AIS_Poller' : 'ADSB_Poller'}</span>
              </div>
              <div className="grid grid-cols-[100px_1fr]">
                 <span className="text-white/30">Classification:</span>
                 <span className={`${
                     entity.classification?.affiliation === 'military' ? 'text-amber-500' :
                     entity.classification?.affiliation === 'government' ? 'text-blue-400' :
                     'text-white/60'
                 } uppercase`}>
                     {entity.classification?.affiliation || 'UNKNOWN'}
                 </span>
              </div>
            </div>
         </section>
      </div>

      {/* 3. Footer Actions */}
      <div className="p-3 border border-t-0 border-tactical-border bg-black/40 backdrop-blur-md rounded-b-sm">
         <button 
            onClick={() => setShowInspector(true)}
            className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded group transition-all"
         >
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
