import React from 'react';
import { SatelliteInspector } from '../widgets/SatelliteInspector';
import { PolarPlotWidget } from '../widgets/PolarPlotWidget';
import { CoTEntity } from '../../types';

interface OrbitalSidebarRightProps {
    selectedSatNorad: number | null;
    setSelectedSatNorad: (noradId: number | null) => void;
    selectedEntity: CoTEntity | null;
    trackCount?: number;
}

export const OrbitalSidebarRight: React.FC<OrbitalSidebarRightProps> = ({
    selectedSatNorad,
    setSelectedSatNorad,
    selectedEntity,
    trackCount = 0
}) => {
    // Construct the data format expected by SatelliteInspector from CoTEntity
    const satelliteData = selectedEntity && selectedEntity.detail?.norad_id ? {
        norad_id: selectedEntity.detail.norad_id as number,
        name: selectedEntity.callsign || 'UNKNOWN',
        category: (selectedEntity.detail.category as string) || 'Orbital Asset',
        altitude_km: selectedEntity.altitude / 1000,
        inclination_deg: (selectedEntity.detail.inclination_deg as number) || 0,
        eccentricity: (selectedEntity.detail.eccentricity as number) || 0,
        velocity_kms: selectedEntity.speed / 1000, // Speed is m/s
        azimuth_deg: selectedEntity.course || 0,
        elevation_deg: 0, // Computed relative to observer (not available globally)
        slant_range_km: 0,
    } : null;

    return (
        <div className="w-[350px] flex-shrink-0 bg-tactical-panel flex flex-col gap-2 p-2">
            <div className="flex items-center justify-between bg-black/40 rounded border border-purple-500/20 p-3 shadow-[0_0_15px_rgba(168,85,247,0.1)]">
                <span className="text-[10px] text-white/50 tracking-[0.2em] font-bold uppercase">ORBITAL OBJECTS</span>
                <span className="text-xl text-purple-400 font-mono font-bold tracking-wider">{trackCount.toLocaleString()}</span>
            </div>
            <SatelliteInspector
                satellite={satelliteData}
                onClose={() => setSelectedSatNorad(null)}
                isLoading={false}
            />
            <PolarPlotWidget />
        </div>
    );
};
