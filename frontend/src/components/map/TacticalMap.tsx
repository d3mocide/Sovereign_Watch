import React, { useEffect, useRef, useState } from 'react';
import { Map as GLMap, useControl, MapRef, MapLayerMouseEvent } from 'react-map-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { PolygonLayer, ScatterplotLayer, PathLayer, IconLayer } from '@deck.gl/layers';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CoTEntity, TrailPoint } from '../../types';
import { MapTooltip } from './MapTooltip';
import { MapContextMenu } from './MapContextMenu';
import { CoverageCircle } from './CoverageCircle';
import { useMissionLocations } from '../../hooks/useMissionLocations';
import { setMissionArea, getMissionArea } from '../../api/missionArea';

// Sleek tactical kite icon (indented arrowhead) for heading vectors
const TRIANGLE_ICON = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 2l6 18-6-4-6 4z" fill="white" /></svg>')}`;

// DeckGL Overlay Control
function DeckGLOverlay(props: any) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  
  useEffect(() => {
      if (props.onOverlayLoaded) {
          props.onOverlayLoaded(overlay);
      }
  }, [overlay, props.onOverlayLoaded]);

  return null;
}

// Props for TacticalMap
interface TacticalMapProps {
    onCountsUpdate?: (counts: { air: number; sea: number }) => void;
    filters?: { showAir: boolean; showSea: boolean };
    onEvent?: (event: { type: 'new' | 'lost' | 'alert'; message: string; entityType?: 'air' | 'sea' }) => void;
    selectedEntity: CoTEntity | null;
    onEntitySelect: (entity: CoTEntity | null) => void;
    onMissionPropsReady?: (props: any) => void;
}

const TacticalMap: React.FC<TacticalMapProps> = ({ onCountsUpdate, filters, onEvent, selectedEntity, onEntitySelect, onMissionPropsReady }) => {
    // Refs for Transient State (No React Re-renders)
    const entitiesRef = useRef<Map<string, CoTEntity>>(new Map());
    const overlayRef = useRef<MapboxOverlay | null>(null);
    const rafRef = useRef<number>();
    const countsRef = useRef({ air: 0, sea: 0 });
    const knownUidsRef = useRef<Set<string>>(new Set()); // Track known UIDs for new/lost events

    // State for UI interactions (causes re-renders but tooltip needs it)
    const [hoveredEntity, setHoveredEntity] = useState<CoTEntity | null>(null);
    // selectedEntity is now passed as prop
    const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);

    // Context Menu State
    const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
    const [contextMenuCoords, setContextMenuCoords] = useState<{ lat: number; lon: number } | null>(null);

    // Mission Management
    const { savedMissions, saveMission, deleteMission } = useMissionLocations();
    const [currentMission, setCurrentMission] = useState<{ lat: number; lon: number; radius_nm: number } | null>(null);

    // Expose mission management to parent
    useEffect(() => {
        if (onMissionPropsReady) {
            onMissionPropsReady({
                savedMissions,
                currentMission,
                onSwitchMission: (mission: any) => handleSwitchMission(mission),
                onDeleteMission: deleteMission,
                onPresetSelect: handlePresetSelect,
            });
        }
    }, [savedMissions, currentMission, onMissionPropsReady]);

    // Worker Reference
    const workerRef = useRef<Worker | null>(null);

    // Initial Data Generation (Mock) & Worker Setup
    useEffect(() => {
        // Initialize Worker
        const worker = new Worker(new URL('../../workers/tak.worker.ts', import.meta.url), {
            type: 'module'
        });
        
        // Pass Proto URL (Vite allows importing assets via ?url)
        // We need a way to resolve the proto file URL at runtime.
        // For now, we assume it's served from /tak.proto if we put it in public, 
        // OR we try to import it. Let's try the import method if configured, otherwise public.
        // Simplest for now: Assume we will move tak.proto to public folder for easy fetch.
        worker.postMessage({ type: 'init', payload: '/tak.proto' });

        worker.onmessage = (event: MessageEvent) => {
            const { type, data, status } = event.data;
            if (type === 'status' && status === 'ready') {
                console.log("Main Thread: TAK Worker Ready");
            }
            if (type === 'entity_update') {
               // Handle Decoded Data from Worker
               const entity = data.cotEvent; // Based on our proto structure
               if (entity && entity.uid) {
                   const existing = entitiesRef.current.get(entity.uid);
                   const isNew = !existing && !knownUidsRef.current.has(entity.uid);
                   const newLon = entity.lon;
                   const newLat = entity.lat;
                   const isShip = entity.type?.includes('S');
                   
                   // Build trail from existing positions (max 100 points for rich history)
                   let trail: TrailPoint[] = existing?.trail || [];
                   if (!existing || existing.lon !== newLon || existing.lat !== newLat) {
                       trail = [...trail, [newLon, newLat, entity.hae || 0] as TrailPoint].slice(-100);
                   }
                   
                   const callsign = entity.detail?.contact?.callsign?.trim() || entity.uid;
                   
                   entitiesRef.current.set(entity.uid, {
                       uid: entity.uid,
                       lat: newLat,
                       lon: newLon,
                       altitude: entity.hae || 0, // Height Above Ellipsoid in meters (Proto is flat)
                       type: entity.type,
                       course: entity.detail?.track?.course || 0,
                       speed: entity.detail?.track?.speed || 0,
                       callsign,
                       lastSeen: Date.now(),
                       trail
                   });
                   
                   // Track known UIDs and emit new entity event
                   if (isNew) {
                       knownUidsRef.current.add(entity.uid);
                       onEvent?.({
                           type: 'new',
                           message: `${isShip ? '🚢' : '✈️'} ${callsign}`,
                           entityType: isShip ? 'sea' : 'air'
                       });
                   }
               }
            }
        };

        workerRef.current = worker;

        // --- WebSocket Setup with Reconnection ---
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const wsUrl = apiUrl.replace(/^http/, 'ws') + '/api/tracks/live';
        
        let ws: WebSocket | null = null;
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 10;
        const baseDelay = 1000; // 1 second
        let reconnectTimeout: number | null = null;
        let isCleaningUp = false;
        
        const connect = () => {
            if (isCleaningUp) return;
            
            console.log(`Connecting to Feed: ${wsUrl} (attempt ${reconnectAttempts + 1})`);
            ws = new WebSocket(wsUrl);
            ws.binaryType = 'arraybuffer';
            
            ws.onopen = () => {
                console.log('Connected to TAK Stream');
                reconnectAttempts = 0; // Reset on successful connection
            };
            
            ws.onmessage = (event) => {
                if (workerRef.current) {
                    workerRef.current.postMessage({ 
                        type: 'decode_batch', 
                        payload: event.data 
                    }, [event.data]); 
                }
            };
            
            ws.onerror = () => {
                // Don't log noisy errors - onclose will handle reconnection
            };
            
            ws.onclose = (event) => {
                if (isCleaningUp) return;
                
                // Only log if it was previously connected (not initial failures)
                if (reconnectAttempts === 0 && event.wasClean) {
                    console.log('TAK Stream disconnected');
                }
                
                // Exponential backoff: 1s, 2s, 4s, 8s... max 30s
                if (reconnectAttempts < maxReconnectAttempts) {
                    const delay = Math.min(baseDelay * Math.pow(2, reconnectAttempts), 30000);
                    reconnectAttempts++;
                    console.log(`Reconnecting in ${delay/1000}s...`);
                    reconnectTimeout = window.setTimeout(connect, delay);
                } else {
                    console.error('Max reconnection attempts reached. Please refresh the page.');
                }
            };
        };
        
        connect();

        return () => {
            isCleaningUp = true;
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            worker.terminate();
            if (ws) ws.close();
        };

    }, []);

    // Animation Loop
    useEffect(() => {
        const animate = () => {
            // 1. Cleanup stale entities
            // Ships (AIS) update every 30s-6min depending on class, aircraft update every 1-5s
            const entities = entitiesRef.current;
            const now = Date.now();
            const STALE_THRESHOLD_AIR_MS = 120 * 1000;  // 2 minutes for aircraft
            const STALE_THRESHOLD_SEA_MS = 300 * 1000;  // 5 minutes for ships
            
            for (const [uid, entity] of entities) {
                const isShip = entity.type?.includes('S');
                const threshold = isShip ? STALE_THRESHOLD_SEA_MS : STALE_THRESHOLD_AIR_MS;
                
                if (now - entity.lastSeen > threshold) {
                    entities.delete(uid);
                    knownUidsRef.current.delete(uid);
                    
                    // Emit lost event
                    onEvent?.({
                        type: 'lost',
                        message: `${isShip ? '🚢' : '✈️'} ${entity.callsign}`,
                        entityType: isShip ? 'sea' : 'air'
                    });
                }
            }
            
            // 2. Calculate and report entity counts
            let airCount = 0;
            let seaCount = 0;
            for (const entity of entities.values()) {
                if (entity.type?.includes('S')) {
                    seaCount++;
                } else {
                    airCount++;
                }
            }
            
            // Only update if counts changed (avoid unnecessary React renders)
            if (countsRef.current.air !== airCount || countsRef.current.sea !== seaCount) {
                countsRef.current = { air: airCount, sea: seaCount };
                onCountsUpdate?.({ air: airCount, sea: seaCount });
            }
            
            // In a real app, we update the Float32Arrays directly here.
            // For this MVP refactor, we just iterate the map (slower, but functional for <10k).
            // Future Optimization: Use Binary Attributes (FE-04).
            
            // 2. Coverage Boundary Data (from ENV variables)
            const CENTER_LAT = parseFloat(import.meta.env.VITE_CENTER_LAT || '45.5152');
            const CENTER_LON = parseFloat(import.meta.env.VITE_CENTER_LON || '-122.6784');
            const COVERAGE_RADIUS_NM = parseInt(import.meta.env.VITE_COVERAGE_RADIUS_NM || '150');
            
            const CENTER: [number, number] = [CENTER_LON, CENTER_LAT];
            const AVIATION_RADIUS_M = COVERAGE_RADIUS_NM * 1852; // nautical miles to meters
            
            // Maritime: Bounding box ~2 degrees around center
            const maritimeBoundary = [
                [CENTER_LON - 3.0, CENTER_LAT - 2.0],
                [CENTER_LON + 3.0, CENTER_LAT - 2.0],
                [CENTER_LON + 3.0, CENTER_LAT + 2.0],
                [CENTER_LON - 3.0, CENTER_LAT + 2.0],
                [CENTER_LON - 3.0, CENTER_LAT - 2.0] // Close the polygon
            ];
            
            // 2. Animation Rhythm (Slightly faster: 600ms sweep)
            // Pulse values are calculated per-entity within the loop.
            
            // 3. Construct Layers
            const layers = [
                // 1. Maritime Coverage Boundary (green dashed rectangle)
                new PolygonLayer({
                    id: 'maritime-coverage',
                    data: [{ polygon: maritimeBoundary }],
                    getPolygon: (d: { polygon: number[][] }) => d.polygon,
                    getFillColor: [0, 0, 0, 0], 
                    getLineColor: [0, 255, 100, 30], 
                    getLineWidth: 1.5,
                    lineWidthMinPixels: 1.5,
                    stroked: true,
                    filled: false,
                    pickable: false,
                }),
                
                // 2. Aviation Coverage Boundary (cyan circle)
                new ScatterplotLayer({
                    id: 'aviation-coverage',
                    data: [{ position: CENTER, radius: AVIATION_RADIUS_M }],
                    getPosition: (d: { position: [number, number] }) => d.position,
                    getRadius: (d: { radius: number }) => d.radius,
                    getFillColor: [0, 0, 0, 0],
                    getLineColor: [0, 255, 255, 30], 
                    lineWidthMinPixels: 1.5,
                    stroked: true,
                    filled: false,
                    radiusUnits: 'meters',
                    pickable: false,
                }),
                
                // 3. Trail Lines for selected entity
                ...(selectedEntity && entitiesRef.current.get(selectedEntity.uid)?.trail && entitiesRef.current.get(selectedEntity.uid)!.trail.length > 1 ? [
                    new PathLayer({
                        id: 'selected-trail',
                        data: [{ path: entitiesRef.current.get(selectedEntity.uid)!.trail }],
                        getPath: (d: { path: TrailPoint[] }) => d.path,
                        getColor: selectedEntity.type.includes('S') 
                            ? [0, 255, 100, 180]  
                            : [0, 255, 255, 180], 
                        getWidth: 2.5,
                        widthMinPixels: 2.5,
                        pickable: false,
                        jointRounded: true,
                        capRounded: true,
                    })
                ] : []),

                // 4. Heading Arrows (Primary Tactical Markers)
                new IconLayer({
                    id: 'heading-arrows',
                    data: Array.from(entities.values()).filter((e: any) => {
                        const entity = e as CoTEntity;
                        const isShip = entity.type?.includes('S');
                        if (isShip && !filters?.showSea) return false;
                        if (!isShip && !filters?.showAir) return false;
                        return true; 
                    }),
                    getIcon: () => ({
                        url: TRIANGLE_ICON,
                        width: 24,
                        height: 24,
                        anchorY: 12, // Centered on coordinate
                        mask: true
                    }),
                    getPosition: (d: any) => [d.lon, d.lat, d.altitude || 0],
                    getSize: (d: any) => selectedEntity?.uid === d.uid ? 32 : 24,
                    getAngle: (d: any) => -(d.course || 0),
                    getColor: (d: any) => {
                        const entity = d as CoTEntity;
                        if (entity.type.includes('S')) {
                            // Maritime: Green
                            return [0, 255, 100, 220];
                        } else {
                            // Aviation: Altitude Gradient
                            // < 5kft: Yellow (Takeoff/Landing)
                            // 5k-25k: Orange (Climb/Descent)
                            // > 25k: Red (Cruise/High)
                            const alt = entity.altitude * 3.28084; // Meters to Feet
                            if (alt < 200) return [0, 191, 255, 220];     // Blue (Grounded)
                            if (alt < 5000) return [255, 255, 0, 220];    // Yellow
                            if (alt < 25000) return [255, 165, 0, 220];   // Orange
                            return [255, 50, 50, 220];                    // Red
                        }
                    },
                    pickable: true,
                    onHover: (info: { object?: any; x: number; y: number }) => {
                        if (info.object) {
                            setHoveredEntity(info.object as CoTEntity);
                            setHoverPosition({ x: info.x, y: info.y });
                        } else {
                            setHoveredEntity(null);
                            setHoverPosition(null);
                        }
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
                        getColor: [selectedEntity?.uid] // Trigger color update if selection changes style (optional)
                    }
                }),

                // 5. Halo / Glow Layer (Soft Pulse Detection)
                new ScatterplotLayer({
                    id: 'entity-glow',
                    data: Array.from(entities.values()).filter(e => {
                        const isShip = e.type?.includes('S');
                        if (isShip && !filters?.showSea) return false;
                        if (!isShip && !filters?.showAir) return false;
                        return true;
                    }),
                    getPosition: (d: CoTEntity) => [d.lon, d.lat, d.altitude || 0],
                    getRadius: (d: CoTEntity) => {
                        const isSelected = selectedEntity?.uid === d.uid;
                        const offset = d.uid.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 100;
                        const pulse = (Math.sin((now + offset) / 600) + 1) / 2;
                        const base = isSelected ? 20 : 6; // Compact glow for unselected chevrons
                        return base * (1 + (pulse * 0.1));
                    },
                    radiusUnits: 'pixels',
                    getFillColor: (d: CoTEntity) => {
                        const isSelected = selectedEntity?.uid === d.uid;
                        const offset = d.uid.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 100;
                        const pulse = (Math.sin((now + offset) / 600) + 1) / 2;
                        
                        // Pulsating alpha
                        const baseAlpha = isSelected ? 60 : 10;
                        const a = baseAlpha * (0.8 + pulse * 0.2); 
                        
                        // Match glow color to icon color
                        if (d.type.includes('S')) return [0, 255, 100, a]; // Green glow
                        
                        const alt = d.altitude * 3.28084;
                        if (alt < 200) return [0, 191, 255, a];     // Blue glow
                        if (alt < 5000) return [255, 255, 0, a];    // Yellow glow
                        if (alt < 25000) return [255, 165, 0, a];   // Orange glow
                        return [255, 50, 50, a];                    // Red glow
                    },
                    pickable: false,
                    updateTriggers: { getRadius: [now], getFillColor: [now] }
                })
            ];
  // 3. Update Overlay (Transient Update - No React Render)
            if (overlayRef.current) {
                overlayRef.current.setProps({ layers });
            }

            rafRef.current = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [selectedEntity, onCountsUpdate, filters, onEvent]);

    const mapToken = import.meta.env.VITE_MAPBOX_TOKEN;
    const mapStyle = mapToken 
        ? "mapbox://styles/mapbox/dark-v11" 
        : "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

    // Read center from ENV variables
    const initialLat = parseFloat(import.meta.env.VITE_CENTER_LAT || '45.5152');
    const initialLon = parseFloat(import.meta.env.VITE_CENTER_LON || '-122.6784');

    const mapRef = useRef<MapRef>(null);

    const setViewMode = (mode: '2d' | '3d') => {
        if (!mapRef.current) return;
        if (mode === '2d') {
            mapRef.current.flyTo({ pitch: 0, bearing: 0, duration: 2000 });
        } else {
            mapRef.current.flyTo({ pitch: 45, bearing: 0, duration: 2000 });
        }
    };

    // Mission Area Handlers
    const handleContextMenu = (e: any) => {
        e.preventDefault();
        const { lngLat, point } = e;
        setContextMenuPos({ x: point.x, y: point.y });
        setContextMenuCoords({ lat: lngLat.lat, lon: lngLat.lng });
    };

    const handleSetFocus = async (lat: number, lon: number) => {
        try {
            const radius = currentMission?.radius_nm || parseInt(import.meta.env.VITE_COVERAGE_RADIUS_NM || '150');
            await setMissionArea({ lat, lon, radius_nm: radius });
            setCurrentMission({ lat, lon, radius_nm: radius });
            
            // Fly map to new location
            if (mapRef.current) {
                mapRef.current.flyTo({
                    center: [lon, lat],
                    zoom: 9,
                    duration: 2000
                });
            }
            
            console.log(`📍 Mission area pivoted to: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
        } catch (error) {
            console.error('Failed to set mission focus:', error);
        }
    };

    const handleSaveLocation = (lat: number, lon: number) => {
        const name = prompt('Enter a name for this location:');
        if (!name) return;

        const radius = parseInt(prompt('Enter radius in nautical miles (10-300):', '150') || '150');
        if (radius < 10 || radius > 300) {
            alert('Radius must be between 10 and 300 nautical miles');
            return;
        }

        saveMission({ name, lat, lon, radius_nm: radius });
        console.log(`💾 Saved mission location: ${name}`);
    };

    const handleReturnHome = async () => {
        const defaultLat = parseFloat(import.meta.env.VITE_CENTER_LAT || '45.5152');
        const defaultLon = parseFloat(import.meta.env.VITE_CENTER_LON || '-122.6784');
        const defaultRadius = parseInt(import.meta.env.VITE_COVERAGE_RADIUS_NM || '150');

        await handleSetFocus(defaultLat, defaultLon);
        setCurrentMission({ lat: defaultLat, lon: defaultLon, radius_nm: defaultRadius });
    };

    const handlePresetSelect = async (radius: number) => {
        if (!currentMission) return;
        
        try {
            await setMissionArea({ lat: currentMission.lat, lon: currentMission.lon, radius_nm: radius });
            setCurrentMission({ ...currentMission, radius_nm: radius });
            console.log(`📐 Radius updated to ${radius}nm`);
        } catch (error) {
            console.error('Failed to update radius:', error);
        }
    };

    const handleSwitchMission = async (mission: any) => {
        await handleSetFocus(mission.lat, mission.lon);
        setCurrentMission({ lat: mission.lat, lon: mission.lon, radius_nm: mission.radius_nm });
    };

    return (
    <>
        <GLMap
            ref={mapRef}
            initialViewState={{
                latitude: initialLat,
                longitude: initialLon,
                zoom: 9,
                pitch: 0,
                bearing: 0
            }}
            mapStyle={mapStyle}
            mapboxAccessToken={mapToken}
            mapLib={mapToken ? undefined : import('maplibre-gl')}
            style={{width: '100vw', height: '100vh'}}
            onContextMenu={handleContextMenu}
        >
            <DeckGLOverlay 
                interleaved={true} 
                onOverlayLoaded={(overlay: MapboxOverlay) => {
                    overlayRef.current = overlay;
                }}
            />
        </GLMap>

        {/* View Controls */}
        {/* View Controls - Centered to avoid sidebar overlap */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 z-[100] pointer-events-auto">
            <button 
                onClick={() => setViewMode('2d')}
                className="bg-black/60 hover:bg-black/80 backdrop-blur border border-white/10 text-cyan-400 p-2 rounded shadow-lg transition-all active:scale-95"
                title="Top Down (2D)"
            >
                <div className="w-8 h-8 flex items-center justify-center font-mono font-bold text-xs">2D</div>
            </button>
            <button 
                onClick={() => setViewMode('3d')}
                className="bg-black/60 hover:bg-black/80 backdrop-blur border border-white/10 text-cyan-400 p-2 rounded shadow-lg transition-all active:scale-95"
                title="Perspective (3D)"
            >
                 <div className="w-8 h-8 flex items-center justify-center font-mono font-bold text-xs">3D</div>
            </button>
        </div>
        
        {/* Context Menu */}
        <MapContextMenu
            position={contextMenuPos}
            coordinates={contextMenuCoords}
            onSetFocus={handleSetFocus}
            onSaveLocation={handleSaveLocation}
            onReturnHome={handleReturnHome}
            onClose={() => {
                setContextMenuPos(null);
                setContextMenuCoords(null);
            }}
        />
        
        {/* Modern Map Tooltip */}
        {hoveredEntity && hoverPosition && (
            <MapTooltip entity={hoveredEntity} position={hoverPosition} />
        )}
    </>
    );
};



export default TacticalMap;

