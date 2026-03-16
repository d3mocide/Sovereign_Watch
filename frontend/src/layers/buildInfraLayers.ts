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
    showTowers?: boolean;
    cableOpacity?: number;
}

export function buildInfraLayers(
    cablesData: { type: "FeatureCollection"; features: GeoJsonFeature[] } | null,
    stationsData: { type: "FeatureCollection"; features: GeoJsonFeature[] } | null,
    outagesData: { type: "FeatureCollection"; features: GeoJsonFeature[] } | null,
    towersData: { type: "FeatureCollection"; features: GeoJsonFeature[] } | null,
    filters: InfraFilters | null,
    setHoveredInfra: (info: unknown) => void,
    setSelectedInfra: ((info: unknown) => void) | undefined,
    selectedEntity: { uid: string } | null = null,
    globeMode: boolean = false,
    worldCountriesData: { type: "FeatureCollection"; features: GeoJsonFeature[] } | null = null,
    countryOutageMap: Record<string, any> | null = null
) {
    const layers = [];

    // Country Outage Shading Layer
    if (worldCountriesData && (outagesData || countryOutageMap) && filters?.showOutages === true) {
        // Use pre-calculated map if available, otherwise build it (fallback)
        const activeOutageMap = countryOutageMap || (outagesData ? (() => {
            const map: Record<string, any> = {};
            outagesData.features.forEach(f => {
                const countryCode = f.properties?.country_code as string;
                if (countryCode) {
                    const current = map[countryCode];
                    if (!current || (f.properties?.severity as number || 0) > (current.severity || 0)) {
                        map[countryCode] = f.properties;
                    }
                }
            });
            return map;
        })() : {});

        layers.push(
            new GeoJsonLayer({
                id: `country-outages-layer-${globeMode ? "globe" : "merc"}`,
                data: worldCountriesData,
                pickable: true,
                stroked: true,
                filled: true,
                getFillColor: (d: unknown) => {
                    const feature = d as GeoJsonFeature;
                    const iso2 = feature.properties?.["ISO3166-1-Alpha-2"] as string;
                    const outage = activeOutageMap[iso2];
                    const severity = outage?.severity || 0;
                    
                    if (severity === 0) return [0, 0, 0, 0];
                    
                    // Heat map color based on severity
                    const alpha = Math.min(180, 80 + (severity * 1.2));
                    if (severity > 80) return [239, 68, 68, alpha]; // Red
                    if (severity > 50) return [249, 115, 22, alpha]; // Orange
                    return [234, 179, 8, alpha]; // Yellow
                },
                getLineColor: [255, 255, 255, 30],
                lineWidthMinPixels: 0.5,
                updateTriggers: {
                    getFillColor: [outagesData]
                },
                wrapLongitude: !globeMode,
                parameters: { 
                    depthTest: !!globeMode, 
                    depthMask: !!globeMode,
                    depthBias: globeMode ? -20.0 : 0 
                },
                onHover: (info: any) => {
                    const iso2 = info.object?.properties?.["ISO3166-1-Alpha-2"];
                    const outage = iso2 ? activeOutageMap[iso2] : null;
                    
                    if (outage) {
                        // Synthesize an 'outage' entity for the tooltip preserving geometry
                        setHoveredInfra({
                            ...info,
                            object: {
                                ...info.object,
                                type: 'outage',
                                properties: { ...info.object.properties, ...outage }
                            }
                        });
                    } else {
                        // Pass null object to clear tooltips for countries without outages
                        setHoveredInfra({ ...info, object: null });
                    }
                },
                onClick: (info: any) => {
                    const iso2 = info.object?.properties?.["ISO3166-1-Alpha-2"];
                    const outage = iso2 ? activeOutageMap[iso2] : null;
                    
                    if (outage && setSelectedInfra) {
                        setSelectedInfra({
                            ...info,
                            object: {
                                ...info.object,
                                type: 'outage',
                                properties: { ...info.object.properties, ...outage }
                            }
                        });
                    } else if (setSelectedInfra) {
                        setSelectedInfra({ ...info, object: null });
                    }
                },
            })
        );
    }

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
                parameters: { 
                    depthTest: !!globeMode, 
                    depthMask: !!globeMode,
                    depthBias: globeMode ? -30.0 : 0 
                },
                onHover: setHoveredInfra,
                onClick: setSelectedInfra,
            })
        );
    }

    // FCC ASR Towers Layer
    if (towersData && filters?.showTowers !== false) {
        layers.push(
            new ScatterplotLayer({
                id: `fcc-towers-layer-${globeMode ? "globe" : "merc"}`,
                data: towersData.features || [],
                pickable: true,
                opacity: 0.8,
                stroked: true,
                filled: true,
                radiusScale: 1,
                radiusMinPixels: 3,
                radiusMaxPixels: 20,
                lineWidthMinPixels: 1,
                getPosition: (d: unknown) => (d as GeoJsonFeature).geometry.coordinates as [number, number],
                getRadius: (d: unknown) => {
                    const feature = d as GeoJsonFeature;
                    const height = (feature.properties?.height_m as number) || 50;
                    return height * 2; // Scale visually by height
                },
                getFillColor: (d: unknown) => {
                    const feature = d as GeoJsonFeature;
                    const type = (feature.properties?.type as string) || "UNKNOWN";
                    if (type === "TOWER") return [239, 68, 68, 200]; // Red
                    if (type === "POLE") return [249, 115, 22, 200]; // Orange
                    if (type === "MAST") return [234, 179, 8, 200]; // Yellow
                    if (type === "BUILDING") return [56, 189, 248, 200]; // Blue
                    return [156, 163, 175, 200]; // Gray fallback
                },
                getLineColor: [255, 255, 255, 100],
                parameters: {
                    depthTest: !!globeMode,
                    depthMask: !!globeMode,
                    depthBias: globeMode ? -40.0 : 0
                },
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
                parameters: { 
                    depthTest: !!globeMode, 
                    depthMask: !!globeMode,
                    depthBias: globeMode ? -40.0 : 0 
                },
                onHover: setHoveredInfra,
                onClick: setSelectedInfra,
            })
        );
    }

    return layers;
}
