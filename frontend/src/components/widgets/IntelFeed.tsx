import React, { useMemo, useCallback, useState } from 'react';
import { Radio, Bell, TrendingDown, TrendingUp, Filter, Plane, Ship, Satellite } from 'lucide-react';
import { CoTEntity, MapActions, IntelEvent, MapFilters } from '../../types';
import { LayerFilters } from './LayerFilters';

interface IntelFeedProps {
  events: IntelEvent[];
  onEntitySelect?: (entity: CoTEntity) => void;
  mapActions?: MapActions;
  filters?: MapFilters;
  onFilterChange?: (key: string, value: boolean) => void;
}

export const IntelFeed = ({ events, onEntitySelect, mapActions, filters, onFilterChange }: IntelFeedProps) => {
  const [showFilters, setShowFilters] = useState(false);

  // 1. Memoize filtered events to avoid recalculating on every render
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
        if (!filters) return true;
        
        // Root filters
        if (event.entityType === 'air' && !filters.showAir) return false;
        if (event.entityType === 'sea' && !filters.showSea) return false;
        
        // Affiliation filters (only if air is on)
        if (event.entityType === 'air' && event.classification) {
            const aff = event.classification.affiliation;
            if (aff === 'military' && filters.showMilitary === false) return false;
            if (aff === 'government' && filters.showGovernment === false) return false;
            if (aff === 'commercial' && filters.showCommercial === false) return false;
            if (aff === 'general_aviation' && filters.showPrivate === false) return false;
            
            // Platform filter
            if (event.classification.platform === 'helicopter' && filters.showHelicopter === false) return false;
            if (event.classification.platform === 'drone' && filters.showDrone === false) return false;
        }
        
        // Sea filters
        if (event.entityType === 'sea' && event.classification) {
            const cat = event.classification.category;
            if (cat === 'cargo' && filters.showCargo === false) return false;
            if (cat === 'tanker' && filters.showTanker === false) return false;
            if (cat === 'passenger' && filters.showPassenger === false) return false;
            if (cat === 'fishing' && filters.showFishing === false) return false;
            if (cat === 'military' && filters.showSeaMilitary === false) return false;
            if (cat === 'law_enforcement' && filters.showLawEnforcement === false) return false;
            if (cat === 'sar' && filters.showSar === false) return false;
            if (cat === 'tug' && filters.showTug === false) return false;
            if (cat === 'pleasure' && filters.showPleasure === false) return false;
            if (cat === 'hsc' && filters.showHsc === false) return false;
            if (cat === 'pilot' && filters.showPilot === false) return false;
            if ((cat === 'special' || cat === 'unknown') && filters.showSpecial === false) return false;
        }
        
        return true;
    });
  }, [events, filters]);

  // 2. stable callback for click handling
  const handleItemClick = useCallback((event: IntelEvent) => {
    if (onEntitySelect && mapActions) {
        const words = event.message.split(' ').map((w: string) => w.replace(/[^a-zA-Z0-9]/g, ''));
        
        for (const word of words) {
            if (word.length < 3) continue;
            const matches = mapActions.searchLocal(word);
            const exact = matches.find((e: CoTEntity) => e.callsign === word || e.uid === word);
            if (exact) {
                onEntitySelect(exact);
                mapActions.flyTo(exact.lat, exact.lon, 12);
                return;
            }
        }
    }
  }, [onEntitySelect, mapActions]);

  return (
    <div className="flex flex-1 flex-col min-h-0 rounded-sm border border-tactical-border bg-black/40 backdrop-blur-md shadow-inner overflow-hidden">
      <div className="flex items-center justify-between border-b border-tactical-border bg-white/5 px-3 py-2">
        <h3 className="text-mono-xs font-bold uppercase tracking-[0.2em] text-hud-green/70 flex items-center gap-2 mr-auto">
            <Radio size={12} className="animate-pulse text-hud-green" />
            Intelligence Stream
        </h3>
        
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
                <button 
                    title="Toggle Air"
                    className={`p-1 rounded transition-all active:scale-95 ${filters?.showAir ? 'text-air-accent bg-air-accent/10 border border-air-accent/30' : 'text-white/20 hover:text-white/40 border border-transparent'}`}
                    onClick={() => onFilterChange?.('showAir', !filters?.showAir)}
                >
                    <Plane size={12} />
                </button>
                <button 
                    title="Toggle Sea"
                    className={`p-1 rounded transition-all active:scale-95 ${filters?.showSea ? 'text-sea-accent bg-sea-accent/10 border border-sea-accent/30' : 'text-white/20 hover:text-white/40 border border-transparent'}`}
                    onClick={() => onFilterChange?.('showSea', !filters?.showSea)}
                >
                    <Ship size={12} />
                </button>
                <button 
                    title="Toggle Orbital"
                    className={`p-1 rounded transition-all active:scale-95 ${filters?.showSatellites ? 'text-purple-400 bg-purple-400/10 border border-purple-400/30' : 'text-white/20 hover:text-white/40 border border-transparent'}`}
                    onClick={() => onFilterChange?.('showSatellites', !filters?.showSatellites)}
                >
                    <Satellite size={12} />
                </button>
            </div>

            <div className="h-4 w-[1px] bg-white/10 mx-1" />

            <button 
                className={`transition-colors p-1 rounded ${showFilters ? 'bg-white/10 text-white' : 'text-white/30 hover:text-hud-green'}`}
                onClick={() => setShowFilters(!showFilters)}
            >
                <Filter size={12} />
            </button>
        </div>
      </div>

      {showFilters && filters && onFilterChange && (
          <div className="border-b border-tactical-border bg-black/60 p-3 max-h-[50vh] overflow-y-auto">
              <LayerFilters filters={filters} onFilterChange={onFilterChange} />
          </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 scrollbar-thin scrollbar-thumb-hud-green/20">
        {events.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center space-y-2 opacity-30">
             <ActivityIndicator />
             <span className="text-mono-xs font-bold tracking-widest text-white">Awaiting Fusion Uplink...</span>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredEvents.slice(0, 50).map((event) => (
                <IntelEventItem 
                    key={event.id} 
                    event={event} 
                    onClick={handleItemClick} 
                />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// 3. Isolated sub-component with React.memo to prevent unnecessary re-renders
const IntelEventItem = React.memo(({ 
    event, 
    onClick 
}: { 
    event: IntelEvent; 
    onClick: (event: IntelEvent) => void; 
}) => {
    const isAir = event.entityType === 'air';
    const isLost = event.type === 'lost';
    const isAlert = event.type === 'alert';
    
    const isMil = event.classification?.affiliation === 'military';
    const isGov = event.classification?.affiliation === 'government';
    
    const accentColor = isAlert ? 'bg-alert-red' : 
                       isLost ? 'bg-alert-amber' : 
                       isMil ? 'bg-amber-500' :
                       isGov ? 'bg-blue-400' :
                       isAir ? 'bg-air-accent' : 'bg-sea-accent';
    
    const textColor = isAlert ? 'text-alert-red' : 
                     isLost ? 'text-alert-amber' : 
                     isMil ? 'text-amber-500' :
                     isGov ? 'text-blue-400' :
                     isAir ? 'text-air-accent' : 'text-sea-accent';

    const borderLight = isAlert ? 'border-alert-red/30' : 
                       isLost ? 'border-alert-amber/30' : 
                       isMil ? 'border-amber-500/30' :
                       isGov ? 'border-blue-400/30' :
                       isAir ? 'border-air-accent/30' : 'border-sea-accent/30';

    return (
      <div 
        onClick={() => onClick(event)}
        className={`group relative overflow-hidden rounded border border-white/5 bg-black/40 p-2 transition-all hover:bg-white-[5%] hover:${borderLight} cursor-pointer active:scale-[0.98]`}
      >
        <div className={`absolute left-0 top-0 h-full w-[2px] ${accentColor}`} />
        
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-0.5">
             <div className="flex items-center gap-2">
                {isAlert ? <Bell size={10} className="text-alert-red" /> : 
                 isLost ? <TrendingDown size={10} className="text-alert-amber" /> : 
                 <TrendingUp size={10} className={isAir ? 'text-air-accent' : 'text-sea-accent'} />}
                
                 <span className={`text-[10px] font-bold tracking-widest uppercase ${textColor}`}>
                    {isAlert ? 'CRITICAL ALERT' : event.type.toUpperCase()}
                 </span>
                 {event.classification?.affiliation && ['military', 'government'].includes(event.classification.affiliation.toLowerCase()) && (
                      <span className={`text-[9px] px-1 rounded border opacity-80 font-bold ${event.classification.affiliation.toLowerCase() === 'military' ? 'border-amber-500/80 text-amber-500 tracking-wide' : `${borderLight} ${textColor}`}`}>
                          {event.classification.affiliation.toUpperCase()}
                      </span>
                 )}
                 {event.classification?.platform && event.classification.platform.toLowerCase() !== 'fixed_wing' && (
                      <span className={`text-[9px] px-1 rounded border opacity-80 font-bold ${event.classification.platform.toLowerCase() === 'helicopter' ? 'border-amber-500/80 text-amber-500 tracking-wide' : `${borderLight} ${textColor}`}`}>
                          {event.classification.platform.toUpperCase()}
                      </span>
                 )}
                 {event.classification?.category && (
                      <span className={`text-[9px] px-1 rounded border opacity-80 font-bold ${['sar', 'law_enforcement', 'military'].includes(event.classification.category.toLowerCase()) ? 'border-amber-500/80 text-amber-500 tracking-wide' : `${borderLight} ${textColor}`}`}>
                          {event.classification.category.toUpperCase().replace(/_/g, ' ')}
                      </span>
                 )}
             </div>
             <p className="text-mono-sm font-medium leading-tight text-white/80 group-hover:text-white">
                {event.message}
             </p>
          </div>
          <span className="text-[8px] font-mono text-white/30 whitespace-nowrap">
             {event.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
        
        <div className="absolute -bottom-2 -right-2 opacity-[0.03] transition-opacity group-hover:opacity-[0.08]">
           {isAir ? <PlaneIcon size={40} /> : <ShipIcon size={40} />}
        </div>
      </div>
    );
});

// Internal utility icons
const ActivityIndicator = () => (
    <div className="relative h-6 w-6">
       <div className="absolute inset-0 rounded-full border border-hud-green opacity-20 animate-ping" />
       <div className="absolute inset-0 rounded-full border border-hud-green animate-pulse" />
    </div>
);

const PlaneIcon = ({ size }: { size: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3.5 19.5 3 18 3.5 16.5 5L13 8.5 4.8 6.7c-1.2-.3-2.4.5-2.8 1.7-.2.6 0 1.2.5 1.7L9 13.5l-3.5 3.5c-.7.7-.7 1.8 0 2.5.7.7 1.8.7 2.5 0l3.5-3.5 3.4 6.5c.5.5 1.1.7 1.7.5 1.2-.4 2-1.6 1.7-2.8z" />
    </svg>
);

const ShipIcon = ({ size }: { size: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 21H3L1 15h22l-2 6zM12 15V1M7 10h10" />
    </svg>
);
