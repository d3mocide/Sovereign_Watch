import React from 'react';
import { Radio, Bell, TrendingDown, TrendingUp, Filter } from 'lucide-react';

interface IntelEvent {
    id: string;
    time: Date;
    type: 'new' | 'lost' | 'alert';
    message: string;
    entityType?: 'air' | 'sea';
}

interface IntelFeedProps {
  events: IntelEvent[];
}

export const IntelFeed: React.FC<IntelFeedProps> = ({ events }) => {
  return (
    <div className="flex flex-1 flex-col min-h-0 rounded-sm border border-tactical-border bg-black/40 backdrop-blur-md shadow-inner overflow-hidden">
      <div className="flex items-center justify-between border-b border-tactical-border bg-white/5 px-3 py-2">
        <h3 className="text-mono-xs font-bold uppercase tracking-[0.2em] text-hud-green/70 flex items-center gap-2">
            <Radio size={12} className="animate-pulse text-hud-green" />
            Intelligence Stream
        </h3>
        <button className="text-white/30 hover:text-hud-green transition-colors">
            <Filter size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 scrollbar-thin scrollbar-thumb-hud-green/20">
        {events.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center space-y-2 opacity-30">
             <ActivityIndicator />
             <span className="text-mono-xs font-bold tracking-widest text-white">Awaiting Fusion Uplink...</span>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((event) => {
              const isAir = event.entityType === 'air';
              const isLost = event.type === 'lost';
              const isAlert = event.type === 'alert';
              
              const accentColor = isAlert ? 'bg-alert-red' : 
                                 isLost ? 'bg-alert-amber' : 
                                 isAir ? 'bg-air-cyan' : 'bg-sea-green';
              
              const borderLight = isAlert ? 'border-alert-red/30' : 
                                 isLost ? 'border-alert-amber/30' : 
                                 isAir ? 'border-air-cyan/30' : 'border-sea-green/30';

              return (
                <div 
                  key={event.id}
                  className={`group relative overflow-hidden rounded border border-white/5 bg-black/40 p-2 transition-all hover:bg-white-[5%] hover:${borderLight}`}
                >
                  {/* Event Marker Bar */}
                  <div className={`absolute left-0 top-0 h-full w-[2px] ${accentColor}`} />
                  
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col gap-0.5">
                       <div className="flex items-center gap-2">
                          {isAlert ? <Bell size={10} className="text-alert-red" /> : 
                           isLost ? <TrendingDown size={10} className="text-alert-amber" /> : 
                           <TrendingUp size={10} className={isAir ? 'text-air-cyan' : 'text-sea-green'} />}
                          
                          <span className={`text-[10px] font-bold tracking-widest uppercase ${isAlert ? 'text-alert-red' : isLost ? 'text-alert-amber' : isAir ? 'text-air-cyan' : 'text-sea-green'}`}>
                             {isAlert ? 'CRITICAL ALERT' : event.type.toUpperCase()}
                          </span>
                       </div>
                       <p className="text-mono-sm font-medium leading-tight text-white/80 group-hover:text-white">
                          {event.message}
                       </p>
                    </div>
                    <span className="text-[8px] font-mono text-white/30 whitespace-nowrap">
                       {event.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  
                  {/* Subtle Background Icon */}
                  <div className="absolute -bottom-2 -right-2 opacity-[0.03] transition-opacity group-hover:opacity-[0.08]">
                     {isAir ? <PlaneIcon size={40} /> : <ShipIcon size={40} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

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
