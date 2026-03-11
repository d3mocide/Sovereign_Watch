import { GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";

// Helper to convert hex colors (e.g. '#3b82f6') to [R, G, B, A] array required by Deck.GL
function hexToRgb(hex: string, alpha: number = 255): [number, number, number, number] {
    if (!hex) return [59, 130, 246, alpha]; // Default to '#3b82f6' if no color
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.slice(0, 2), 16) || 0;
    const g = parseInt(cleanHex.slice(2, 4), 16) || 255;
    const b = parseInt(cleanHex.slice(4, 6), 16) || 255;
    return [r, g, b, alpha];
}

// Assuming standard GeoJSON Feature types
interface GeoJsonFeature {
    type: "Feature";
    properties: Record<string, unknown>;
    geometry: {
        type: string;
        coordinates: number[];
    };
}

interface InfraFilters {
    showCables?: boolean;
    showLandingStations?: boolean;
    showOutages?: boolean;
    showDatacenters?: boolean;
    cableOpacity?: number;
}

export function buildInfraLayers(
    cablesData: { type: "FeatureCollection"; features: GeoJsonFeature[] } | null,
    stationsData: { type: "FeatureCollection"; features: GeoJsonFeature[] } | null,
    outagesData: { type: "FeatureCollection"; features: GeoJsonFeature[] } | null,
    datacentersData: { type: "FeatureCollection"; features: GeoJsonFeature[] } | null,
    filters: InfraFilters | null,
    setHoveredInfra: (info: unknown) => void,
    setSelectedInfra: ((info: unknown) => void) | undefined,
    selectedEntity: { uid: string } | null = null,
    globeMode: boolean = false
) {
    const layers = [];

    // Submarine Cables Layer - uses GeoJsonLayer
    if (cablesData && filters?.showCables !== false) {
        layers.push(
            new GeoJsonLayer({
                id: `submarine-cables-layer-${globeMode ? "globe" : "merc"}`,
                data: cablesData,
                pickable: true,
                stroked: false,
                filled: false,
                lineWidthScale: 10,
                lineWidthMinPixels: 3, // Increased from 2 for better clickability
                getLineColor: (d: unknown) => {
                    const feature = d as GeoJsonFeature;
                    const isSelected = selectedEntity?.uid === String(feature.properties?.id);
                    const opacity = isSelected ? 255 : (filters?.cableOpacity ?? 0.6) * 255;
                    const colorHex = isSelected ? '#38bdf8' : (feature.properties?.color as string);
                    return hexToRgb(colorHex, opacity);
                },
                getLineWidth: (d: unknown) => {
                    const feature = d as GeoJsonFeature;
                    const isSelected = selectedEntity?.uid === String(feature.properties?.id);
                    return isSelected ? 4 : 2;
                },
                updateTriggers: {
                    getLineColor: [filters?.cableOpacity, selectedEntity?.uid],
                    getLineWidth: [selectedEntity?.uid]
                },
                transitions: {
                    getLineColor: 300,
                    getLineWidth: 300
                },
                wrapLongitude: !globeMode,
                parameters: globeMode ? { depthTest: true, depthBias: -210.0 } : undefined,
                onHover: setHoveredInfra,
                onClick: setSelectedInfra,
            })
        );
    }

    // Cable Landing Stations Layer - uses ScatterplotLayer
    if (stationsData && filters?.showLandingStations !== false) {
        // Build a map of cable names to colors for efficient lookup
        const cableColorMap: Record<string, string> = {};
        if (cablesData?.features) {
            cablesData.features.forEach((f: GeoJsonFeature) => {
                const name = f.properties?.name as string | undefined;
                const color = f.properties?.color as string | undefined;
                if (name && color) cableColorMap[name.toLowerCase()] = color;
            });
        }

        layers.push(
            new ScatterplotLayer({
                id: `cable-stations-layer-${globeMode ? "globe" : "merc"}`,
                data: stationsData.features || [],
                pickable: true,
                opacity: 0.8,
                stroked: true,
                filled: true,
                radiusScale: 100,
                radiusMinPixels: 4,
                radiusMaxPixels: 20,
                lineWidthMinPixels: 1,
                getPosition: (d: unknown) => (d as GeoJsonFeature).geometry.coordinates as [number, number],
                getFillColor: (d: unknown) => {
                    const feature = d as GeoJsonFeature;
                    // Try to find matching cable color
                    const cableList = ((feature.properties?.cables as string) || "").split(",");
                    for (const rawName of cableList) {
                        const name = rawName.trim().toLowerCase();
                        if (cableColorMap[name]) {
                            return hexToRgb(cableColorMap[name], 200);
                        }
                    }
                    return [0, 200, 255, 200]; // Default cyan fallback
                },
                getLineColor: [255, 255, 255, 100],
                updateTriggers: {
                    getFillColor: [cablesData]
                },
                wrapLongitude: !globeMode,
                parameters: globeMode ? { depthTest: true, depthBias: -210.0 } : undefined,
                onHover: setHoveredInfra,
                onClick: setSelectedInfra,
            })
        );
    }

    // Internet Outages Layer - uses ScatterplotLayer
    if (outagesData && filters?.showOutages === true) {
        layers.push(
            new ScatterplotLayer({
                id: `internet-outages-layer-${globeMode ? "globe" : "merc"}`,
                data: outagesData.features || [],
                pickable: true,
                opacity: 0.8,
                stroked: true,
                filled: true,
                radiusScale: 100,
                radiusMinPixels: 6,
                radiusMaxPixels: 20,
                lineWidthMinPixels: 1,
                getPosition: (d: unknown) => (d as GeoJsonFeature).geometry.coordinates as [number, number],
                getFillColor: (d: unknown) => {
                    const feature = d as GeoJsonFeature;
                    const severity = (feature.properties?.severity as number) || 0;
                    // Grey scale or heat map based on severity. The original uses a grey outer ring/inner circle.
                    // We'll use a hot red/orange color based on severity for Sovereign Glass theme
                    if (severity > 80) return [239, 68, 68, 200]; // Red
                    if (severity > 50) return [249, 115, 22, 200]; // Orange
                    return [234, 179, 8, 200]; // Yellow
                },
                getLineColor: [255, 255, 255, 150],
                wrapLongitude: !globeMode,
                parameters: globeMode ? { depthTest: true, depthBias: -210.0 } : undefined,
                onHover: setHoveredInfra,
                onClick: setSelectedInfra,
            })
        );
    }

    // Datacenters Layer - uses ScatterplotLayer
    if (datacentersData && filters?.showDatacenters === true) {
        layers.push(
            new ScatterplotLayer({
                id: `datacenters-layer-${globeMode ? "globe" : "merc"}`,
                data: datacentersData.features || [],
                pickable: true,
                opacity: 0.9,
                stroked: true,
                filled: true,
                radiusScale: 50,
                radiusMinPixels: 3,
                radiusMaxPixels: 10,
                lineWidthMinPixels: 1,
                getPosition: (d: unknown) => (d as GeoJsonFeature).geometry.coordinates as [number, number],
                getFillColor: [124, 58, 237, 200] as [number, number, number, number], // Purple (from the original codebase)
                getLineColor: [255, 255, 255, 100],
                wrapLongitude: !globeMode,
                parameters: globeMode ? { depthTest: true, depthBias: -210.0 } : undefined,
                onHover: setHoveredInfra,
                onClick: setSelectedInfra,
            })
        );
    }

    return layers;
}
