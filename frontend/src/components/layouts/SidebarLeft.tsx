import React from 'react';
import { LayerFilters } from '../widgets/LayerFilters';
import { SystemStatus } from '../widgets/SystemStatus';
import { IntelFeed } from '../widgets/IntelFeed';
import { MissionNavigator } from '../widgets/MissionNavigator';
import { SearchWidget } from '../widgets/SearchWidget';

import { SystemHealth } from '../../hooks/useSystemHealth';
import { IntelEvent, MissionProps } from '../../types';

interface SidebarLeftProps {
  trackCounts: { air: number; sea: number };
  filters: import('../../types').MapFilters;
  onFilterChange: (key: string, value: boolean) => void;
  events: IntelEvent[];
  missionProps: MissionProps | null;
  health?: SystemHealth;
  mapActions: import('../../types').MapActions | null;
  onEntitySelect: (entity: import('../../types').CoTEntity) => void;
}

export const SidebarLeft: React.FC<SidebarLeftProps> = ({ 
  trackCounts, 
  filters, 
  onFilterChange, 
  events,
  missionProps,
  health,
  mapActions,
  onEntitySelect
}) => {
  return (
    <div className="flex flex-col h-full gap-4 animate-in fade-in duration-1000">
      {/* Search Widget */}
      {mapActions && (
          <SearchWidget 
            mapActions={mapActions} 
            onEntitySelect={onEntitySelect} 
          />
      )}

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
      <IntelFeed 
        events={events} 
        onEntitySelect={onEntitySelect} 
        mapActions={mapActions} 
        filters={filters}
      />

      {/* 3. Metrics & Analytics */}
      <SystemStatus trackCounts={trackCounts} />
      
      {/* Visual Tech Metadata */}
      <div className="flex items-center justify-between px-1 opacity-20 hover:opacity-100 transition-opacity">
          <span className="text-[8px] tracking-tighter"> </span>
          <span className="text-[8px] tracking-tighter tabular-nums">
              LATENCY: {health ? `${health.latency}MS` : '...'}
          </span>
      </div>
    </div>
  );
};
