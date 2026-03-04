import { ScatterplotLayer, PathLayer, IconLayer, TextLayer, SolidPolygonLayer } from '@deck.gl/layers';
import { CoTEntity } from '../types';

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
    if (cat === 'comms' || cat.includes('comms') || cat.includes('communications') || cat.includes('starlink') || cat.includes('iridium')) return [52, 211, 153, alpha];
    if (cat === 'surveillance' || cat.includes('surveillance') || cat.includes('military') || cat.includes('isr')) return [251, 113, 133, alpha];
    return [156, 163, 175, alpha];
};

interface OrbitalLayerProps {
    satellites: CoTEntity[];
    selectedEntity: CoTEntity | null;
    hoveredEntity: CoTEntity | null;
    now: number;
    showHistoryTails: boolean;
    showFootprints?: boolean;
    projectionMode?: string; // Nuclear Sync: Appended to IDs to force buffer rebuilds
    zoom?: number;
    onEntitySelect: (entity: CoTEntity | null) => void;
    onHover: (entity: CoTEntity | null, x: number, y: number) => void;
}

interface FaceDatum { polygon: number[][], entity: CoTEntity, shade?: number }

function buildGemFaces(
    satellites: CoTEntity[],
    selectedUid: string | undefined,
    zoom: number = 0
): FaceDatum[] {
    const faces: FaceDatum[] = [];
    const pxToDeg = (360 / 512) / Math.pow(2, Math.max(0, zoom));

    for (const d of satellites) {
        const isSelected = selectedUid === d.uid;
        const alt = d.altitude || 1000;

        const desiredPx = isSelected ? 12 : 6;
        const sizeDegUnclamped = desiredPx * pxToDeg;

        // Compensate for altitude expansion: objects further from center appear structurally larger for the same degree width
        const altRadiusScale = (6371 + (alt / 1000)) / 6371;

        // Cap the maximum degree size to avoid absurdly huge pyramids at low zoom, 
        // while also preventing them from turning into specs when zooming far in.
        const sizeDeg = Math.min(Math.max((sizeDegUnclamped / altRadiusScale), 0.02), 1.0);

        const latRad = (d.lat * Math.PI) / 180;
        const lonScale = Math.min(1 / Math.max(0.01, Math.cos(latRad)), 10);

        // Vertical apex offset in meters
        // Scale the height according to the physical width of the base to keep it a nice diamond
        const gemH = (sizeDeg * 111_000 * altRadiusScale) * 0.6;

        const apex = [d.lon, d.lat, alt + gemH];
        const nadir = [d.lon, d.lat, alt - gemH];
        const vN = [d.lon, d.lat + sizeDeg, alt];
        const vE = [d.lon + sizeDeg * lonScale, d.lat, alt];
        const vS = [d.lon, d.lat - sizeDeg, alt];
        const vW = [d.lon - sizeDeg * lonScale, d.lat, alt];

        // 8 triangular faces: 4 top cap + 4 bottom cap
        const tris = [
            [apex, vN, vE], [apex, vE, vS], [apex, vS, vW], [apex, vW, vN],
            [nadir, vE, vN], [nadir, vS, vE], [nadir, vW, vS], [nadir, vN, vW],
        ];
        const shades = [1.0, 0.75, 0.5, 0.75, 0.8, 0.6, 0.4, 0.6];
        for (let i = 0; i < tris.length; i++) {
            faces.push({ polygon: tris[i], entity: d, shade: shades[i] });
        }
    }
    return faces;
}

export function getOrbitalLayers({ satellites, selectedEntity, hoveredEntity, now, showHistoryTails, showFootprints = false, projectionMode, zoom, onEntitySelect, onHover }: OrbitalLayerProps) {
    const R_EARTH_KM = 6371;
    const sfx = projectionMode ? `-${projectionMode}` : '';
    // Pre-build gem faces for globe mode (avoids IIFE inside array spread)
    const gemFaces = projectionMode === 'globe'
        ? buildGemFaces(satellites, selectedEntity?.uid, zoom)
        : [];

    return [
        // 1. Footprint Circle — skipped in Globe mode (flat projection artifact)
        ...(projectionMode !== 'globe' ? [new ScatterplotLayer({
            id: `satellite-footprint${sfx}`,
            // Disabled global showFootprints: rendering 10,000+ giant circles crashes WebGL. 
            // Now it only shows the footprint for the hovered/selected satellite.
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
            wrapLongitude: projectionMode !== 'globe',
            parameters: { depthTest: true, depthBias: 50.0 }, // Satellite footprint: positive = furthest behind
            updateTriggers: {
                getRadius: [selectedEntity?.uid, hoveredEntity?.uid],
                getFillColor: [selectedEntity?.uid, hoveredEntity?.uid]
            }
        })] : []),

        // 1b. Footprint Label — skipped in Globe mode
        ...(projectionMode !== 'globe' ? [new TextLayer({
            id: `satellite-footprint-label${sfx}`,
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
        })] : []),

        // 2. Orbital Trail (respects historyTails toggle, Chaikin-smoothed)
        ...(showHistoryTails ? [
            new PathLayer({
                id: `satellite-ground-track${sfx}`,
                data: satellites,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                getPath: (d: any): any => {
                    const trail: number[][] = d.smoothedTrail || [];
                    if (projectionMode === 'globe') {
                        // Lift trail to orbital altitude so it arcs through 3D space
                        // rather than dragging along the ground surface.
                        const alt = d.altitude || 0;
                        return trail.map((pt: number[]) => [pt[0], pt[1], alt]);
                    }
                    return trail;
                },
                getColor: (d: CoTEntity) => {
                    const isSelected = d.uid === selectedEntity?.uid || d.uid === hoveredEntity?.uid;
                    if (isSelected) return getSatColor(d.detail?.category as string, 200);
                    return getSatColor(d.detail?.category as string, 120);
                },
                getWidth: (d: CoTEntity) => (d.uid === selectedEntity?.uid || d.uid === hoveredEntity?.uid) ? 4.5 : 3.5,
                widthMinPixels: 2.5,
                jointRounded: true,
                capRounded: true,
                pickable: false,
                // wrapLongitude off in globe mode: conflicts with _full3d depth buffer and causes culling
                wrapLongitude: projectionMode !== 'globe',
                // Positive depthBias pushes geometry BEHIND the viewer — trail sits behind the diamond (bias 0)
                parameters: { depthTest: true, depthBias: 50.0 },
                updateTriggers: {
                    getPath: [now],
                    getColor: [selectedEntity?.uid, hoveredEntity?.uid],
                    getWidth: [selectedEntity?.uid, hoveredEntity?.uid]
                }
            })
        ] : []),

        // 3. Ground Dot — removed (surface projection dot was too noisy across all modes)

        // 4. Satellite Markers — Globe: 3D octahedron gems at orbital altitude
        ...(projectionMode === 'globe' ? [
            new SolidPolygonLayer({
                id: `satellite-markers-globe${sfx}`,
                data: gemFaces,
                getPolygon: (d: FaceDatum) => d.polygon as any,
                extruded: false, // Z is embedded in vertex coords; no ground extrusion needed
                getFillColor: (d: FaceDatum) => {
                    const base = getSatColor(d.entity.detail?.category as string, 220);
                    const shade = d.shade || 1.0;
                    return [Math.round(base[0] * shade), Math.round(base[1] * shade), Math.round(base[2] * shade), base[3]];
                },
                pickable: true,
                // wrapLongitude off in globe mode: billboarding + wrapLongitude = render artifacts
                wrapLongitude: false,
                parameters: { depthTest: true },
                onHover: (info: { object?: FaceDatum | null; x: number; y: number }) => {
                    onHover((info.object?.entity ?? null) as CoTEntity | null, info.x, info.y);
                },
                onClick: (info: { object?: FaceDatum | null }) => {
                    const entity = info.object?.entity ?? null;
                    if (entity) {
                        const newSelection = selectedEntity?.uid === entity.uid ? null : entity;
                        onEntitySelect(newSelection);
                    } else {
                        onEntitySelect(null);
                    }
                },
                updateTriggers: {
                    getPolygon: [selectedEntity?.uid],
                    getFillColor: [selectedEntity?.uid],
                }
            })
        ] : [
            new IconLayer({
                id: `satellite-markers-merc${sfx}`,
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
                wrapLongitude: projectionMode !== 'globe',
                parameters: { depthTest: true, depthBias: 0 },
                onHover: (info: { object?: any; x: number; y: number }) => {
                    onHover(info.object as CoTEntity ?? null, info.x, info.y);
                },
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
            })
        ]),


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
                // wrapLongitude off in globe mode — selection ring shares the gem's projection
                wrapLongitude: projectionMode !== 'globe',
                parameters: { depthTest: true, depthBias: -201.0 },
                updateTriggers: { getRadius: [now], getLineColor: [now] }
            })
        ] : []),
    ];
}
