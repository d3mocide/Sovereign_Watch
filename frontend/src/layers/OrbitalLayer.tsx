import { ScatterplotLayer, PathLayer, IconLayer } from '@deck.gl/layers';
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
    // Colors are intentionally matched to the LayerFilters chip colors:
    // GPS → sky-400 (#38bdf8), Weather → amber-400 (#fbbf24),
    // Comms → emerald-400 (#34d399), Intel → rose-400 (#fb7185), Other → gray-400
    if (cat === 'gps' || cat.includes('gps') || cat.includes('gnss') || cat.includes('galileo') || cat.includes('beidou') || cat.includes('glonass')) return [56, 189, 248, alpha];   // sky-400
    if (cat === 'weather' || cat.includes('weather') || cat.includes('noaa') || cat.includes('meteosat')) return [251, 191, 36, alpha];       // amber-400
    if (cat === 'comms' || cat.includes('comms') || cat.includes('communications') || cat.includes('starlink') || cat.includes('iridium'))    return [52, 211, 153, alpha];            // emerald-400
    if (cat === 'surveillance' || cat.includes('surveillance') || cat.includes('military') || cat.includes('isr'))                            return [251, 113, 133, alpha];           // rose-400
    return [156, 163, 175, alpha]; // gray-400 — Other / unclassified
};

interface OrbitalLayerProps {
    satellites: CoTEntity[];
    selectedEntity: CoTEntity | null;
    hoveredEntity: CoTEntity | null;
    now: number;
}

export function getOrbitalLayers({ satellites, selectedEntity, hoveredEntity, now }: OrbitalLayerProps) {
    const R_EARTH_KM = 6371;

    return [
        // 1. Footprint Circle (underneath)
        new ScatterplotLayer({
            id: 'satellite-footprint',
            data: satellites.filter(s => s.uid === selectedEntity?.uid || s.uid === hoveredEntity?.uid),
            getPosition: (d: CoTEntity) => [d.lon, d.lat, 0],
            getRadius: (d: CoTEntity) => {
                const altKm = (d.altitude || 0) / 1000;
                if (altKm <= 0) return 0;
                // footprint radius in meters
                const footprintKm = 2 * R_EARTH_KM * Math.acos(R_EARTH_KM / (R_EARTH_KM + altKm));
                return footprintKm * 1000; 
            },
            radiusUnits: 'meters',
            getFillColor: (d: CoTEntity) => getSatColor(d.detail?.category as string, 20), // 8% alpha = ~20/255
            getLineColor: (d: CoTEntity) => getSatColor(d.detail?.category as string, 180),
            getLineWidth: 2,
            lineWidthUnits: 'pixels',
            stroked: true,
            filled: true,
            pickable: false,
            updateTriggers: {
                getRadius: [selectedEntity?.uid, hoveredEntity?.uid],
                getFillColor: [selectedEntity?.uid, hoveredEntity?.uid]
            }
        }),

        // 2. Ground Track (PathLayer)
        new PathLayer({
            id: 'satellite-ground-track',
            data: satellites,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            getPath: (d: any) => {
                if (!d.trail || d.trail.length < 2) return [];
                return d.trail.map((p: any) => [p[0], p[1], p[2]]);
            },
            getColor: (d: CoTEntity) => getSatColor(d.detail?.category as string, Math.floor(255 * 0.3)), // Opacity 0.3
            getWidth: 1,
            widthMinPixels: 1,
            pickable: false,
        }),

        // 3. Satellite Markers
        new IconLayer({
            id: 'satellite-markers',
            data: satellites,
            getIcon: () => 'satellite',
            iconAtlas: SAT_ICON_ATLAS.url,
            iconMapping: SAT_ICON_ATLAS.mapping,
            getPosition: (d: CoTEntity) => [d.lon, d.lat, d.altitude || 0],
            getSize: (d: CoTEntity) => {
                const isSelected = selectedEntity?.uid === d.uid;
                return isSelected ? 16 : 12; // 12px default
            },
            sizeUnits: 'pixels',
            billboard: true, // Face camera
            getColor: (d: CoTEntity) => getSatColor(d.detail?.category as string, 255),
            pickable: true,
            updateTriggers: {
                getSize: [selectedEntity?.uid]
            }
        }),
        
        // 4. Glow / Highlight for selected satellite
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
                updateTriggers: { getRadius: [now], getLineColor: [now] }
            })
        ] : []),
    ];
}
