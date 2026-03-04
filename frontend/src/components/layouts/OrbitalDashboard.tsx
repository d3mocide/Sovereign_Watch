import React, { useState } from 'react';
import { OrbitalMap } from '../map/OrbitalMap';
import { MapFilters, CoTEntity } from '../../types';
import { SystemHealth } from '../../hooks/useSystemHealth';
import { OrbitalSidebarLeft } from './OrbitalSidebarLeft';

interface OrbitalDashboardProps {
  filters: MapFilters;
  onFilterChange: (key: string, value: unknown) => void;
  trackCount: number;
  health: SystemHealth | null;
  selectedEntity: CoTEntity | null;
  onEntitySelect: (entity: CoTEntity | null) => void;
}

export const OrbitalDashboard: React.FC<OrbitalDashboardProps> = ({
  filters,
  onFilterChange,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  trackCount,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  health,
  selectedEntity,
  onEntitySelect
}) => {
  const [orbitalViewMode, setOrbitalViewMode] = useState<'2D' | '3D'>('2D');

  const selectedSatNorad = selectedEntity?.uid ? parseInt(selectedEntity.uid.replace(/\D/g, ''), 10) || null : null;

  const handleSetSelectedSatNorad = (noradId: number | null) => {
    if (noradId) {
      onEntitySelect({
        uid: String(noradId),
        type: 'a-s-K', // Base satellite type
        callsign: `NORAD ${noradId}`,
        lat: 0,
        lon: 0,
        altitude: 0,
        course: 0,
        speed: 0,
        lastSeen: Date.now(),
        trail: [],
        uidHash: 0,
      } as CoTEntity);
    } else {
      onEntitySelect(null);
    }
  };

  // Create an overridden filters object for the main map to only show satellites
  // and force the requested orbital features
  const mapFilters: MapFilters = {
    ...filters,
    showAir: false,
    showSea: false,
    showHelicopter: false,
    showMilitary: false,
    showGovernment: false,
    showCommercial: false,
    showPrivate: false,
    showCargo: false,
    showTanker: false,
    showPassenger: false,
    showFishing: false,
    showSeaMilitary: false,
    showLawEnforcement: false,
    showSar: false,
    showTug: false,
    showPleasure: false,
    showHsc: false,
    showPilot: false,
    showSpecial: false,
    showDrone: false,
    showSatellites: true,
    showRepeaters: false,
    showCables: false,
    showLandingStations: false,
    // Future integrations can use the orbital view mode (2D/3D toggle)
    // or terminator toggles via `filters` extensions if desired
  };

  return (
    <div className="flex flex-row h-full w-full overflow-hidden bg-tactical-bg">
      <OrbitalSidebarLeft
        filters={filters}
        onFilterChange={onFilterChange}
        selectedSatNorad={selectedSatNorad}
        setSelectedSatNorad={handleSetSelectedSatNorad}
        trackCount={trackCount}
      />

      {/* Center Main Map Area */}
      <div className="flex-1 relative border-l border-r border-tactical-border">
        {/* We use OrbitalMap with overridden filters to only show orbital elements */}
        {/* For the real implementation, OrbitalMap will need to be made aware of globeMode via orbitalViewMode === '3D' */}
        <OrbitalMap
          filters={mapFilters}
          globeMode={orbitalViewMode === '3D'}
          onEntitySelect={onEntitySelect}
          selectedEntity={selectedEntity}
          // The rest are dummy/no-ops for the layout shell
          onCountsUpdate={() => { }}
          onEvent={() => { }}
          onMissionPropsReady={() => { }}
          onMapActionsReady={() => { }}
          showVelocityVectors={false}
          showHistoryTails={false}
          onToggleGlobe={() => setOrbitalViewMode(orbitalViewMode === '3D' ? '2D' : '3D')}
          replayMode={false}
          replayEntities={new Map()}
          followMode={false}
          onFollowModeChange={() => { }}
          onEntityLiveUpdate={() => { }}
          js8StationsRef={{ current: new Map() }}
          ownGridRef={{ current: '' }}
          repeatersRef={{ current: [] }}
          showRepeaters={false}
          repeatersLoading={false}
        />
      </div>


    </div>
  );
};

export default OrbitalDashboard;
