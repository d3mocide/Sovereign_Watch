import React from 'react';
import { MapFilters } from '../../types';
import { OrbitalCategoryPills } from '../widgets/OrbitalCategoryPills';
import { PolarPlotWidget } from '../widgets/PolarPlotWidget';
import { PassPredictorWidget } from '../widgets/PassPredictorWidget';
import { DopplerWidget } from '../widgets/DopplerWidget';

interface OrbitalSidebarLeftProps {
    filters: MapFilters;
    onFilterChange: (key: string, value: unknown) => void;
    selectedSatNorad: number | null;
    setSelectedSatNorad: (noradId: number | null) => void;
    trackCount: number;
}

export const OrbitalSidebarLeft: React.FC<OrbitalSidebarLeftProps> = ({
    filters,
    onFilterChange,
    selectedSatNorad,
    setSelectedSatNorad,
    trackCount
}) => {
    return (
        <div className="flex flex-col h-full gap-2 animate-in fade-in duration-1000">
            <OrbitalCategoryPills filters={filters} onFilterChange={onFilterChange} trackCount={trackCount} />


            <PassPredictorWidget
                passes={[]} // To be wired up to API
                homeLocation={{ lat: 45.52, lon: -122.68 }} // Replace with actual home coords
                onPassClick={setSelectedSatNorad}
                isLoading={false}
            />

            {selectedSatNorad && <DopplerWidget />}
            <div className="mt-auto">
                <PolarPlotWidget />
            </div>
        </div>
    );
};
