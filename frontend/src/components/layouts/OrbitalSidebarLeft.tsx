import React from 'react';
import { MapFilters } from '../../types';
import { OrbitalCategoryPills } from '../widgets/OrbitalCategoryPills';
import { PassPredictorWidget } from '../widgets/PassPredictorWidget';
import { DopplerWidget } from '../widgets/DopplerWidget';

interface OrbitalSidebarLeftProps {
    filters: MapFilters;
    onFilterChange: (key: string, value: unknown) => void;
    selectedCategory: string;
    setSelectedCategory: (category: string) => void;
    selectedSatNorad: number | null;
    setSelectedSatNorad: (noradId: number | null) => void;
    showHistoryTails: boolean;
    onToggleHistoryTails: () => void;
}

export const OrbitalSidebarLeft: React.FC<OrbitalSidebarLeftProps> = ({
    filters,
    onFilterChange,
    selectedCategory,
    setSelectedCategory,
    selectedSatNorad,
    setSelectedSatNorad,
    showHistoryTails,
    onToggleHistoryTails
}) => {
    return (
        <div className="w-[380px] flex-shrink-0 bg-tactical-panel border-r border-tactical-border flex flex-col gap-2 p-2 overflow-y-auto">
            <OrbitalCategoryPills selected={selectedCategory} onChange={setSelectedCategory} />

            {/* Overlay Toggles (using standard filter toggle pattern) */}
            <div className="flex flex-col gap-1.5 mt-2">
                <span className="text-[8px] font-bold tracking-[0.2em] text-white/30 uppercase pl-1">Overlays</span>
                <div className="flex flex-col rounded-sm border border-tactical-border bg-black/40 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] overflow-hidden">


                    <div className={`group flex items-center justify-between transition-all p-2 border-b border-white/5 ${showHistoryTails ? 'bg-purple-400/10' : 'bg-transparent hover:bg-white/5'}`}>
                        <div
                            className="flex flex-1 items-center justify-between cursor-pointer"
                            onClick={onToggleHistoryTails}
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] w-4 text-center">🛤️</span>
                                <span className={`text-[9px] font-mono tracking-wider ${showHistoryTails ? 'text-white font-bold' : 'text-white/60'}`}>
                                    GROUND TRACK
                                </span>
                            </div>
                            <div className="flex items-center pr-1">
                                <div className={`h-3 w-6 cursor-pointer rounded-full transition-colors relative ${showHistoryTails ? 'bg-purple-500/80' : 'bg-white/10'}`}>
                                    <div className={`absolute top-[2px] h-2 w-2 rounded-full bg-white transition-all ${showHistoryTails ? 'left-3.5 shadow-[0_0_5px_#a855f7]' : 'left-[2px] opacity-70'}`} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={`group flex items-center justify-between transition-all p-2 ${filters.showFootprints ? 'bg-purple-400/10' : 'bg-transparent hover:bg-white/5'}`}>
                        <div
                            className="flex flex-1 items-center justify-between cursor-pointer"
                            onClick={() => onFilterChange('showFootprints', !filters.showFootprints)}
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] w-4 text-center">📡</span>
                                <span className={`text-[9px] font-mono tracking-wider ${filters.showFootprints ? 'text-white font-bold' : 'text-white/60'}`}>
                                    FOOTPRINTS
                                </span>
                            </div>
                            <div className="flex items-center pr-1">
                                <div className={`h-3 w-6 cursor-pointer rounded-full transition-colors relative ${filters.showFootprints ? 'bg-purple-500/80' : 'bg-white/10'}`}>
                                    <div className={`absolute top-[2px] h-2 w-2 rounded-full bg-white transition-all ${filters.showFootprints ? 'left-3.5 shadow-[0_0_5px_#a855f7]' : 'left-[2px] opacity-70'}`} />
                                </div>
                            </div>
                        </div>
                    </div>

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
    );
};
