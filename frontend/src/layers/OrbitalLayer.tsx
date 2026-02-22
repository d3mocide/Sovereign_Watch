import { ScatterplotLayer, PathLayer, IconLayer, TextLayer } from '@deck.gl/layers';
import { CoTEntity } from '../../types';

const createSatIconAtlas = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';

    // 4-point diamond/star shape
    ctx.save();
    ctx.translate(32, 32);
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(8, -8);
    ctx.lineTo(24, 0);
    ctx.lineTo(8, 8);
    ctx.lineTo(0, 24);
    ctx.lineTo(-8, 8);
    ctx.lineTo(-24, 0);
    ctx.lineTo(-8, -8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    return {
        url: canvas.toDataURL(),
        width: 64,
        height: 64,
        mapping: {
            satellite: { x: 0, y: 0, width: 64, height: 64, anchorY: 32, mask: true }
        }
    };
};

const SAT_ICON_ATLAS = createSatIconAtlas();

const getSatColor = (category?: string, alpha: number = 255): [number, number, number, number] => {
    const cat = (category || '').toLowerCase();
    if (cat === 'gps' || cat.includes('gps') || cat.includes('gnss') || cat.includes('galileo') || cat.includes('beidou') || cat.includes('glonass')) return [56, 189, 248, alpha];
    if (cat === 'weather' || cat.includes('weather') || cat.includes('noaa') || cat.includes('meteosat')) return [251, 191, 36, alpha];
    if (cat === 'comms' || cat.includes('comms') || cat.includes('communications') || cat.includes('starlink') || cat.includes('iridium'))    return [52, 211, 153, alpha];
    if (cat === 'surveillance' || cat.includes('surveillance') || cat.includes('military') || cat.includes('isr'))                            return [251, 113, 133, alpha];
    return [156, 163, 175, alpha];
};

/** Chaikin smoothing — mirrors TacticalMap for consistent trail aesthetics */
function chaikinSmooth(pts: number[][], iterations = 2): number[][] {
    if (pts.length < 3) return pts;
    let result = pts;
    for (let iter = 0; iter < iterations; iter++) {
        const smoothed: number[][] = [result[0]];
        for (let i = 0; i < result.length - 1; i++) {
            const p0 = result[i];
            const p1 = result[i + 1];
            smoothed.push([0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1], 0.75 * p0[2] + 0.25 * p1[2]]);
            smoothed.push([0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1], 0.25 * p0[2] + 0.75 * p1[2]]);
        }
        smoothed.push(result[result.length - 1]);
        result = smoothed;
    }
    return result;
}

interface OrbitalLayerProps {
    satellites: CoTEntity[];
    selectedEntity: CoTEntity | null;
    hoveredEntity: CoTEntity | null;
    now: number;
    showHistoryTails: boolean;
    onEntitySelect: (entity: CoTEntity | null) => void;
    onHover: (entity: CoTEntity | null, x: number, y: number) => void;
}

export function getOrbitalLayers({ satellites, selectedEntity, hoveredEntity, now, showHistoryTails, onEntitySelect, onHover }: OrbitalLayerProps) {
    const R_EARTH_KM = 6371;

    return [
        // 1. Footprint Circle (underneath, only when selected/hovered)
        new ScatterplotLayer({
            id: 'satellite-footprint',
            data: satellites.filter(s => s.uid === selectedEntity?.uid || s.uid === hoveredEntity?.uid),
            getPosition: (d: CoTEntity) => [d.lon, d.lat, 0],
            getRadius: (d: CoTEntity) => {
                const altKm = (d.altitude || 0) / 1000;
                if (altKm <= 0) return 0;
                const footprintKm = 2 * R_EARTH_KM * Math.acos(R_EARTH_KM / (R_EARTH_KM + altKm));
                return footprintKm * 1000;
            },
            radiusUnits: 'meters',
            getFillColor: (d: CoTEntity) => getSatColor(d.detail?.category as string, 20),
            getLineColor: (d: CoTEntity) => getSatColor(d.detail?.category as string, 180),
            getLineWidth: 2,
            lineWidthUnits: 'pixels',
            stroked: true,
            filled: true,
            pickable: false,
            wrapLongitude: true,
            parameters: { depthTest: true, depthBias: 50.0 }, // Satellite footprint: positive = furthest behind
            updateTriggers: {
                getRadius: [selectedEntity?.uid, hoveredEntity?.uid],
                getFillColor: [selectedEntity?.uid, hoveredEntity?.uid]
            }
        }),

        // 1b. Footprint Label — coverage diameter at north rim of circle
        new TextLayer({
            id: 'satellite-footprint-label',
            data: satellites.filter(s => s.uid === selectedEntity?.uid || s.uid === hoveredEntity?.uid),
            getPosition: (d: CoTEntity) => {
                const altKm = (d.altitude || 0) / 1000;
                if (altKm <= 0) return [d.lon, d.lat, 0];
                const footprintKm = 2 * R_EARTH_KM * Math.acos(R_EARTH_KM / (R_EARTH_KM + altKm));
                // Place label at the northernmost point of the footprint circle
                const footprintDeg = (footprintKm / R_EARTH_KM) * (180 / Math.PI);
                return [d.lon, Math.min(d.lat + footprintDeg * 0.65, 85), 0];
            },
            getText: (d: CoTEntity) => {
                const altKm = (d.altitude || 0) / 1000;
                if (altKm <= 0) return '';
                const footprintKm = 2 * R_EARTH_KM * Math.acos(R_EARTH_KM / (R_EARTH_KM + altKm));
                return `⌀ ${Math.round(footprintKm).toLocaleString()} km coverage`;
            },
            getColor: (d: CoTEntity) => getSatColor(d.detail?.category as string, 220),
            getSize: 12,
            sizeUnits: 'pixels',
            getTextAnchor: 'middle' as const,
            getAlignmentBaseline: 'center' as const,
            fontFamily: '"Inter", "DM Mono", monospace',
            fontWeight: 600,
            pickable: false,
            parameters: { depthTest: false },
            updateTriggers: {
                getPosition: [selectedEntity?.uid, hoveredEntity?.uid],
                getText: [selectedEntity?.uid, hoveredEntity?.uid],
            }
        }),

        // 2. Ground Track (respects historyTails toggle, Chaikin-smoothed)
        ...(showHistoryTails ? [
            new PathLayer({
                id: 'satellite-ground-track',
                data: satellites,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                getPath: (d: any) => {
                    if (!d.trail || d.trail.length < 2) return [];
                    const raw = d.trail.map((p: any) => [p[0], p[1], p[2]]);
                    return chaikinSmooth(raw);
                },
                getColor: (d: CoTEntity) => getSatColor(d.detail?.category as string, Math.floor(255 * 0.3)),
                getWidth: 3.5,
                widthMinPixels: 2.5,
                jointRounded: true,
                capRounded: true,
                pickable: false,
                wrapLongitude: true,
                parameters: { depthTest: true, depthBias: -50.0 } // Ground track: behind CoT trails (-101) and icons (-210)
            })
        ] : []),

        // 3. Ground Dot (vertical projection of satellite to ground surface)
        new ScatterplotLayer({
            id: 'satellite-ground-dot',
            data: satellites,
            getPosition: (d: CoTEntity) => [d.lon, d.lat, 0],
            getRadius: 3,
            radiusUnits: 'pixels',
            getFillColor: (d: CoTEntity) => getSatColor(d.detail?.category as string, 120),
            pickable: false,
            wrapLongitude: true,
            parameters: { depthTest: true, depthBias: 0.0 } // Ground dot: behind everything, at surface level
        }),

        // 4. Satellite Markers (clickable — fires onEntitySelect for sidebar)
        new IconLayer({
            id: 'satellite-markers',
            data: satellites,
            getIcon: () => 'satellite',
            iconAtlas: SAT_ICON_ATLAS.url,
            iconMapping: SAT_ICON_ATLAS.mapping,
            getPosition: (d: CoTEntity) => [d.lon, d.lat, d.altitude || 0],
            getSize: (d: CoTEntity) => {
                const isSelected = selectedEntity?.uid === d.uid;
                return isSelected ? 16 : 12;
            },
            sizeUnits: 'pixels',
            sizeMinPixels: 6,
            billboard: true,
            getColor: (d: CoTEntity) => getSatColor(d.detail?.category as string, 255),
            pickable: true,
            wrapLongitude: true,
            parameters: { depthTest: false }, // Always on top — icon must never be occluded by its own trail
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onHover: (info: { object?: any; x: number; y: number }) => {
                onHover(info.object as CoTEntity ?? null, info.x, info.y);
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onClick: (info: { object?: any }) => {
                if (info.object) {
                    const entity = info.object as CoTEntity;
                    const newSelection = selectedEntity?.uid === entity.uid ? null : entity;
                    onEntitySelect(newSelection);
                } else {
                    onEntitySelect(null);
                }
            },
            updateTriggers: {
                getSize: [selectedEntity?.uid],
                getColor: [selectedEntity?.uid]
            }
        }),

        // 5. Glow / Highlight ring for selected satellite
        ...(selectedEntity && satellites.find(s => s.uid === selectedEntity.uid) ? [
            new ScatterplotLayer({
                id: `satellite-selection-ring-${selectedEntity.uid}`,
                data: [satellites.find(s => s.uid === selectedEntity.uid)!],
                getPosition: (d: CoTEntity) => [d.lon, d.lat, d.altitude || 0],
                getRadius: () => {
                    const cycle = (now % 2000) / 2000;
                    return 20 + cycle * 30;
                },
                radiusUnits: 'pixels',
                getFillColor: [0, 0, 0, 0],
                getLineColor: (d: CoTEntity) => {
                    const cycle = (now % 2000) / 2000;
                    const alpha = Math.round(255 * (1 - Math.pow(cycle, 2)));
                    return getSatColor(d.detail?.category as string, alpha);
                },
                getLineWidth: 2,
                stroked: true,
                filled: false,
                pickable: false,
                wrapLongitude: true,
                parameters: { depthTest: true, depthBias: -201.0 },
                updateTriggers: { getRadius: [now], getLineColor: [now] }
            })
        ] : []),
    ];
}
