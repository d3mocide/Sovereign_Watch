import React, { useEffect, useRef, useState } from 'react';
import { Map as GLMap, useControl } from 'react-map-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { PolygonLayer, ScatterplotLayer, PathLayer, IconLayer } from '@deck.gl/layers';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CoTEntity, TrailPoint } from '../../types';
import { MapTooltip } from './MapTooltip';

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
}

const TacticalMap: React.FC<TacticalMapProps> = ({ onCountsUpdate, filters, onEvent, selectedEntity, onEntitySelect }) => {
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
                   
                   // Build trail from existing positions (max 20 points)
                   let trail: TrailPoint[] = existing?.trail || [];
                   if (!existing || existing.lon !== newLon || existing.lat !== newLat) {
                       trail = [...trail, [newLon, newLat] as TrailPoint].slice(-20);
                   }
                   
                   const callsign = entity.detail?.contact?.callsign?.trim() || entity.uid;
                   
                   entitiesRef.current.set(entity.uid, {
                       uid: entity.uid,
                       lat: newLat,
                       lon: newLon,
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
            
            // 2. Coverage Boundary Data
            // Aviation: 150nm radius circle around Portland
            const PORTLAND_CENTER: [number, number] = [-122.6784, 45.5152];
            const AVIATION_RADIUS_M = 150 * 1852; // 150 nautical miles in meters
            
            // Maritime: Bounding box [[43.5, -125.5], [47.5, -120.0]]
            const maritimeBoundary = [
                [-125.5, 43.5],
                [-120.0, 43.5],
                [-120.0, 47.5],
                [-125.5, 47.5],
                [-125.5, 43.5] // Close the polygon
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
                    data: [{ position: PORTLAND_CENTER, radius: AVIATION_RADIUS_M }],
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
                    getPosition: (d: any) => [d.lon, d.lat],
                    getSize: (d: any) => selectedEntity?.uid === d.uid ? 32 : 24,
                    getAngle: (d: any) => -(d.course || 0),
                    getColor: (d: any) => {
                        const entity = d as CoTEntity;
                        return entity.type.includes('S') 
                            ? [0, 255, 100, 220] 
                            : [0, 255, 255, 220];
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
                    updateTriggers: { getSize: [selectedEntity?.uid] }
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
                    getPosition: (d: CoTEntity) => [d.lon, d.lat],
                    getRadius: (d: CoTEntity) => {
                        const isSelected = selectedEntity?.uid === d.uid;
                        const offset = d.uid.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 100;
                        const pulse = (Math.sin((now + offset) / 600) + 1) / 2;
                        const base = isSelected ? 22 : 12; // Tighter glow for chevrons
                        return base * (1 + (pulse * 0.15));
                    },
                    radiusUnits: 'pixels',
                    getFillColor: (d: CoTEntity) => {
                        const isSelected = selectedEntity?.uid === d.uid;
                        const offset = d.uid.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 100;
                        const pulse = (Math.sin((now + offset) / 600) + 1) / 2;
                        const alpha = isSelected ? 40 : 10;
                        return d.type.includes('S') 
                            ? [0, 255, 100, alpha * (1 - pulse)]   
                            : [0, 255, 255, alpha * (1 - pulse)];
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

    return (
    <>
        <GLMap
            initialViewState={{
                latitude: 45.5152,
                longitude: -122.6784,
                zoom: 9,
                pitch: 0,
                bearing: 0
            }}
            mapStyle={mapStyle}
            mapboxAccessToken={mapToken}
            mapLib={mapToken ? undefined : import('maplibre-gl')}
            style={{width: '100vw', height: '100vh'}}
        >
            <DeckGLOverlay 
                interleaved={true} 
                onOverlayLoaded={(overlay: MapboxOverlay) => {
                    overlayRef.current = overlay;
                }}
            />
        </GLMap>
        
        {/* Modern Map Tooltip */}
        {hoveredEntity && hoverPosition && (
            <MapTooltip entity={hoveredEntity} position={hoverPosition} />
        )}
    </>
    );
};



export default TacticalMap;

