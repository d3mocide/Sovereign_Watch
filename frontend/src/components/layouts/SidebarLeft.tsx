import React from 'react';
import { SystemStatus } from '../widgets/SystemStatus';
import { IntelFeed } from '../widgets/IntelFeed';
import { MissionNavigator } from '../widgets/MissionNavigator';
import { SearchWidget } from '../widgets/SearchWidget';
import { JS8Widget } from '../widgets/JS8Widget';

import { SystemHealth } from '../../hooks/useSystemHealth';
import { IntelEvent, MissionProps, JS8Station, JS8LogEntry, JS8StatusLine } from '../../types';

interface SidebarLeftProps {
  trackCounts: { air: number; sea: number; orbital: number };
  filters: import('../../types').MapFilters;
  onFilterChange: (key: string, value: boolean) => void;
  events: IntelEvent[];
  missionProps: MissionProps | null;
  health?: SystemHealth;
  mapActions: import('../../types').MapActions | null;
  onEntitySelect: (entity: import('../../types').CoTEntity) => void;
  js8Stations?: JS8Station[];
  js8LogEntries?: JS8LogEntry[];
  js8StatusLine?: JS8StatusLine;
  js8BridgeConnected?: boolean;
  js8Connected?: boolean;
  js8KiwiConnecting?: boolean;
  js8ActiveKiwiConfig?: any;
  sendMessage?: (target: string, message: string) => void;
  sendAction?: (payload: object) => void;
}

export const SidebarLeft: React.FC<SidebarLeftProps> = ({
  trackCounts,
  filters,
  onFilterChange,
  events,
  missionProps,
  mapActions,
  onEntitySelect,
  js8Stations = [],
  js8LogEntries = [],
  js8StatusLine = { callsign: '--', grid: '----', freq: '--' },
  js8BridgeConnected = false,
  js8Connected = false,
  js8KiwiConnecting = false,
  js8ActiveKiwiConfig = null,
  sendMessage = () => { },
  sendAction = () => { },
}) => {
  return (
    <div className="flex flex-col h-full gap-2 animate-in fade-in duration-1000 overflow-y-auto overflow-x-hidden">
      {/* Search Widget */}
      {mapActions && (
        <SearchWidget
          mapActions={mapActions}
          onEntitySelect={onEntitySelect}
        />
      )}

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

      {/* 2. System Intelligence Feed - Takes remaining space */}
      <div className="flex-1 min-h-[300px] overflow-hidden flex flex-col">
        <IntelFeed
          events={events}
          onEntitySelect={onEntitySelect}
          mapActions={mapActions}
          filters={filters}
          onFilterChange={onFilterChange}
        />
      </div>

      {/* 3. JS8Call / HF Radio */}
      <JS8Widget
        stations={js8Stations}
        logEntries={js8LogEntries}
        statusLine={js8StatusLine}
        connected={js8BridgeConnected}
        js8Connected={js8Connected}
        kiwiConnecting={js8KiwiConnecting}
        activeKiwiConfig={js8ActiveKiwiConfig}
        sendMessage={sendMessage}
        sendAction={sendAction}
      />

      {/* 4. Metrics, Analytics & Map Layers */}
      <SystemStatus
        trackCounts={trackCounts}
        filters={filters}
        onFilterChange={onFilterChange}
      />
    </div>
  );
};
