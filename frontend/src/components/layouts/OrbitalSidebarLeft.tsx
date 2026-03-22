import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { MapFilters, PassResult } from '../../types';
import { OrbitalCategoryPills } from '../widgets/OrbitalCategoryPills';
import { PassPredictorWidget } from '../widgets/PassPredictorWidget';

import { DopplerWidget } from '../widgets/DopplerWidget';
import { usePassPredictions } from '../../hooks/usePassPredictions';
import { useMissionLocation } from '../../hooks/useMissionLocation';

interface OrbitalSidebarLeftProps {
    filters: MapFilters;
    onFilterChange: (key: string, value: unknown) => void;
    selectedSatNorad: number | null;
    setSelectedSatNorad: (noradId: number | null) => void;
    trackCount: number;
}

// Map filter keys → the category string stored in the satellites table
const FILTER_TO_CATEGORY: Record<string, string> = {
    showSatGPS: 'gps',
    showSatWeather: 'weather',
    showSatComms: 'comms',
    showSatSurveillance: 'intel',
    showSatOther: 'other',
};

// Categories for which category-level pass prediction is disabled.
// Comms constellations (Starlink, OneWeb, Iridium, amateur) number 8-10k satellites
// and will saturate the SGP4 pass-prediction server when queried as a whole category.
// Per-satellite on-demand prediction (single NORAD ID) still works fine.
const PASS_PREDICTION_DISABLED_CATEGORIES = new Set(['comms']);

function getActiveCategory(filters: MapFilters): string | null {
    const active = Object.entries(FILTER_TO_CATEGORY)
        .filter(([key]) => filters[key] !== false)
        .map(([, cat]) => cat);
    // Only scope to a single category so the query stays fast
    return active.length === 1 ? active[0] : null;
}

export const OrbitalSidebarLeft: React.FC<OrbitalSidebarLeftProps> = ({
    filters,
    onFilterChange,
    selectedSatNorad,
    setSelectedSatNorad,
    trackCount
}) => {
    const { lat: observerLat, lon: observerLon } = useMissionLocation();
    const [minElevation, setMinElevation] = useState(10);
    const [searchTerm, setSearchTerm] = useState('');

    // ── Upcoming Passes list ──────────────────────────────────────────────────
    // Only runs when exactly one category is active AND that category is not
    // comms (Starlink/OneWeb/Iridium) — querying comms as a whole would send
    // 8-10k satellite SGP4 calculations in one shot and brick the server.
    const activeCategory = getActiveCategory(filters);
    const isPassDisabledCategory = activeCategory !== null && PASS_PREDICTION_DISABLED_CATEGORIES.has(activeCategory);
    const { passes: listPasses, loading: listLoading } = usePassPredictions(
        observerLat,
        observerLon,
        {
            minElevation,
            hours: 6,
            category: activeCategory ?? undefined,
            skip: activeCategory === null || isPassDisabledCategory,
        }
    );

    // ── Selected-satellite pass (on-demand, fast) ─────────────────────────────
    // Only fires when a satellite is selected. Single NORAD = single SGP4 run.
    const { passes: satPasses, loading: satLoading } = usePassPredictions(
        observerLat,
        observerLon,
        {
            minElevation,
            hours: 12,
            noradIds: selectedSatNorad ? [String(selectedSatNorad)] : undefined,
            skip: selectedSatNorad === null,
        }
    );

    // The selected satellite's nearest upcoming pass drives Doppler + Polar
    const selectedPass: PassResult | undefined = satPasses[0];

    const query = searchTerm.trim().toLowerCase();
    const filteredPasses = query
        ? listPasses.filter(p =>
            p.name.toLowerCase().includes(query) ||
            String(p.norad_id).includes(query)
        )
        : listPasses;

    const widgetPasses = filteredPasses.map((p) => ({
        norad_id: parseInt(p.norad_id, 10) || 0,
        name: p.name,
        aos: p.aos,
        tca: p.tca,
        los: p.los,
        max_elevation: p.max_elevation,
        aos_azimuth: p.aos_azimuth,
        los_azimuth: p.los_azimuth,
        duration_seconds: p.duration_seconds,
    }));

    const dopplerPoints = selectedPass?.points.map((pt) => ({
        time: pt.t,
        slant_range_km: pt.slant_range_km,
        elevation: pt.el,
    })) ?? [];


    const handlePassClick = (norad: number) => {
        setSelectedSatNorad(norad);
    };

    return (
        <div className="flex flex-col h-full gap-2 animate-in fade-in duration-1000">
            <OrbitalCategoryPills filters={filters} onFilterChange={onFilterChange} trackCount={trackCount} />




            {/* NORAD / Name search */}
            <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-black/60 border border-white/15 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
                <Search size={11} className="text-white/30 shrink-0" />
                <input
                    type="text"
                    placeholder="Search by name or NORAD ID…"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="flex-1 bg-transparent text-[10px] font-mono text-white/80 placeholder-white/20 outline-none"
                />
                {searchTerm && (
                    <button
                        onClick={() => setSearchTerm('')}
                        className="text-white/30 hover:text-white/60 text-[10px] leading-none"
                    >
                        ×
                    </button>
                )}
            </div>

            <PassPredictorWidget
                passes={widgetPasses}
                homeLocation={{ lat: observerLat, lon: observerLon }}
                onPassClick={handlePassClick}
                isLoading={listLoading}
                minElevation={minElevation}
                onMinElevationChange={setMinElevation}
                emptyMessage={
                    isPassDisabledCategory
                        ? 'Pass prediction is not available for the COMMS layer — constellation too large (Starlink / OneWeb / Iridium). Select an individual satellite to compute its pass.'
                        : activeCategory === null
                            ? 'Select one category to predict passes'
                            : undefined
                }
            />

            {/* Doppler — on-demand when a sat is selected */}
            {selectedSatNorad && (
                <>
                    {satLoading ? (
                        <div className="flex items-center justify-center gap-2 py-3 text-[9px] text-purple-400/50 font-mono tracking-widest uppercase">
                            <div className="w-3 h-3 rounded-full border border-purple-400/20 border-t-purple-400 animate-spin" />
                            Computing pass geometry…
                        </div>
                    ) : (
                        <DopplerWidget passPoints={dopplerPoints} />
                    )}
                </>
            )}
        </div>
    );
};
