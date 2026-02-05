import React from 'react';
import { LayerFilters } from '../widgets/LayerFilters';
import { SystemStatus } from '../widgets/SystemStatus';
import { IntelFeed } from '../widgets/IntelFeed';
import { MissionNavigator } from '../widgets/MissionNavigator';

interface SidebarLeftProps {
  trackCounts: { air: number; sea: number };
  filters: { showAir: boolean; showSea: boolean };
  onFilterChange: (key: 'showAir' | 'showSea', value: boolean) => void;
  events: any[];
  missionProps?: any;
}

export const SidebarLeft: React.FC<SidebarLeftProps> = ({ 
  trackCounts, 
  filters, 
  onFilterChange, 
  events,
  missionProps
}) => {
  return (
    <div className="flex flex-col h-full gap-4 animate-in fade-in duration-1000">
      {/* 1. Global Controls Moved to Top */}
      <LayerFilters 
        filters={filters} 
        onFilterChange={onFilterChange} 
      />

      {/* Mission Navigator */}
      {missionProps && (
        <MissionNavigator
          savedMissions={missionProps.savedMissions || []}
          currentMission={missionProps.currentMission}
          onSwitchMission={missionProps.onSwitchMission}
          onDeleteMission={missionProps.onDeleteMission}
          onPresetSelect={missionProps.onPresetSelect}
        />
      )}

      {/* 2. System Intelligence Feed */}
      <IntelFeed events={events} />

      {/* 3. Metrics & Analytics */}
      <SystemStatus trackCounts={trackCounts} />
      
      {/* Visual Tech Metadata */}
      <div className="flex items-center justify-between px-1 opacity-20 hover:opacity-100 transition-opacity">
          <span className="text-[8px] tracking-tighter">SIGINT_PROCESSOR_V4.2</span>
          <span className="text-[8px] tracking-tighter">LATENCY: 42MS</span>
      </div>
    </div>
  );
};
