import React, { useState } from 'react';
import TacticalMap from '../map/TacticalMap';
import { MapFilters, CoTEntity } from '../../types';
import { SystemHealth } from '../../hooks/useSystemHealth';
import { OrbitalCategoryPills } from '../widgets/OrbitalCategoryPills';
import { SatelliteInspector } from '../widgets/SatelliteInspector';
import { PassPredictorWidget } from '../widgets/PassPredictorWidget';
import { PolarPlotWidget } from '../widgets/PolarPlotWidget';
import { DopplerWidget } from '../widgets/DopplerWidget';

interface OrbitalDashboardProps {
  filters: MapFilters;
  onFilterChange: (key: string, value: unknown) => void;
  trackCount: number;
  health: SystemHealth | null;
}

export const OrbitalDashboard: React.FC<OrbitalDashboardProps> = ({
  filters,
  onFilterChange,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  trackCount,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  health
}) => {
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [orbitalViewMode, setOrbitalViewMode] = useState<'2D' | '3D'>('2D');
  const [selectedSatNorad, setSelectedSatNorad] = useState<number | null>(null);

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

  // We define map props specific to the orbital view
  // NOTE: For now, TacticalMap only expects the standard props.
  // We provide dummy functions for props we don't care about here.
  const handleEntitySelect = (entity: CoTEntity | null) => {
    if (entity && entity.uid) {
      // In the future, we might parse NORAD ID from the entity
      setSelectedSatNorad(entity.uid ? parseInt(entity.uid.replace(/\D/g, ''), 10) || null : null);
    } else {
      setSelectedSatNorad(null);
    }
  };

  return (
    <div className="flex flex-row h-full w-full overflow-hidden bg-tactical-bg">
      {/* Left Sidebar */}
      <div className="w-64 flex-shrink-0 bg-tactical-panel border-r border-tactical-border flex flex-col gap-2 p-2 overflow-y-auto">
        <OrbitalCategoryPills selected={selectedCategory} onChange={setSelectedCategory} />

        {/* View Mode Toggle */}
        <div className="flex flex-col gap-1.5 mt-2">
          <span className="text-[8px] font-bold tracking-[0.2em] text-white/30 uppercase">View Mode</span>
          <div className="flex flex-wrap gap-1 bg-black/40 rounded border border-white/10 p-1">
            <button
              onClick={() => setOrbitalViewMode('2D')}
              className={`px-3 py-1 rounded transition-all duration-300 ${
                orbitalViewMode === '2D'
                  ? 'bg-purple-400/20 text-purple-300 border border-purple-400/30 shadow-[0_0_6px_rgba(168,85,247,0.2)]'
                  : 'text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent'
              }`}
            >
              <span className="text-[9px] font-black tracking-widest">2D FLAT</span>
            </button>
            <button
              onClick={() => setOrbitalViewMode('3D')}
              className={`px-3 py-1 rounded transition-all duration-300 ${
                orbitalViewMode === '3D'
                  ? 'bg-purple-400/20 text-purple-300 border border-purple-400/30 shadow-[0_0_6px_rgba(168,85,247,0.2)]'
                  : 'text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent'
              }`}
            >
              <span className="text-[9px] font-black tracking-widest">3D GLOBE</span>
            </button>
          </div>
        </div>

        {/* Overlay Toggles (using standard filter toggle pattern) */}
        <div className="flex flex-col gap-1.5 mt-2">
          <span className="text-[8px] font-bold tracking-[0.2em] text-white/30 uppercase">Overlays</span>
          <div className="flex flex-col gap-1 bg-black/40 rounded border border-white/10 p-2">
             <label className="flex items-center justify-between group cursor-pointer">
               <span className="text-[9px] font-mono tracking-wider text-white/60 group-hover:text-white transition-colors flex items-center gap-1.5">
                 🌒 TERMINATOR
               </span>
               <div className={`w-6 h-3 rounded-full relative transition-colors ${filters.showTerminator ? 'bg-purple-500/50' : 'bg-white/10'}`}>
                 <div className={`absolute top-[1px] left-[1px] w-[10px] h-[10px] rounded-full transition-transform ${filters.showTerminator ? 'translate-x-3 bg-purple-300 shadow-[0_0_5px_#a855f7]' : 'translate-x-0 bg-white/40'}`} />
               </div>
               {/* Hidden actual checkbox to fulfill interaction if needed, or rely on onClick */}
               <input type="checkbox" className="hidden" checked={!!filters.showTerminator} onChange={(e) => onFilterChange('showTerminator', e.target.checked)} />
             </label>

             <label className="flex items-center justify-between group cursor-pointer mt-1">
               <span className="text-[9px] font-mono tracking-wider text-white/60 group-hover:text-white transition-colors flex items-center gap-1.5">
                 🛤️ GROUND TRACK
               </span>
               <div className={`w-6 h-3 rounded-full relative transition-colors ${filters.showGroundTracks ? 'bg-purple-500/50' : 'bg-white/10'}`}>
                 <div className={`absolute top-[1px] left-[1px] w-[10px] h-[10px] rounded-full transition-transform ${filters.showGroundTracks ? 'translate-x-3 bg-purple-300 shadow-[0_0_5px_#a855f7]' : 'translate-x-0 bg-white/40'}`} />
               </div>
               <input type="checkbox" className="hidden" checked={!!filters.showGroundTracks} onChange={(e) => onFilterChange('showGroundTracks', e.target.checked)} />
             </label>

             <label className="flex items-center justify-between group cursor-pointer mt-1">
               <span className="text-[9px] font-mono tracking-wider text-white/60 group-hover:text-white transition-colors flex items-center gap-1.5">
                 📡 FOOTPRINTS
               </span>
               <div className={`w-6 h-3 rounded-full relative transition-colors ${filters.showFootprints ? 'bg-purple-500/50' : 'bg-white/10'}`}>
                 <div className={`absolute top-[1px] left-[1px] w-[10px] h-[10px] rounded-full transition-transform ${filters.showFootprints ? 'translate-x-3 bg-purple-300 shadow-[0_0_5px_#a855f7]' : 'translate-x-0 bg-white/40'}`} />
               </div>
               <input type="checkbox" className="hidden" checked={!!filters.showFootprints} onChange={(e) => onFilterChange('showFootprints', e.target.checked)} />
             </label>
          </div>
        </div>

        <PassPredictorWidget
          passes={[]} // To be wired up to API
          homeLocation={{ lat: 45.52, lon: -122.68 }} // Replace with actual home coords
          onPassClick={setSelectedSatNorad}
          isLoading={false}
        />

        {selectedSatNorad && <DopplerWidget />}
      </div>

      {/* Center Main Map Area */}
      <div className="flex-1 relative border-l border-r border-tactical-border">
        {/* We use TacticalMap with overridden filters to only show orbital elements */}
        {/* For the real implementation, TacticalMap will need to be made aware of globeMode via orbitalViewMode === '3D' */}
        <TacticalMap
          filters={mapFilters}
          globeMode={orbitalViewMode === '3D'}
          onEntitySelect={handleEntitySelect}
          selectedEntity={null}
          // The rest are dummy/no-ops for the layout shell
          onCountsUpdate={() => {}}
          onEvent={() => {}}
          onMissionPropsReady={() => {}}
          onMapActionsReady={() => {}}
          showVelocityVectors={false}
          showHistoryTails={false}
          onToggleGlobe={() => setOrbitalViewMode(orbitalViewMode === '3D' ? '2D' : '3D')}
          replayMode={false}
          replayEntities={new Map()}
          followMode={false}
          onFollowModeChange={() => {}}
          onEntityLiveUpdate={() => {}}
          js8StationsRef={{ current: new Map() }}
          ownGridRef={{ current: '' }}
          repeatersRef={{ current: [] }}
          showRepeaters={false}
          repeatersLoading={false}
        />
      </div>

      {/* Right Sidebar */}
      <div className="w-64 flex-shrink-0 bg-tactical-panel flex flex-col gap-2 p-2">
        <SatelliteInspector
          satellite={null} // To be wired up to API data
          onClose={() => setSelectedSatNorad(null)}
          isLoading={false}
        />
        <PolarPlotWidget />
      </div>
    </div>
  );
};

export default OrbitalDashboard;
