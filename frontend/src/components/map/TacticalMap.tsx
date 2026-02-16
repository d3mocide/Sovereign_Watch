import { useEffect, useRef, useState, useCallback } from 'react';
import { Map as GLMap, useControl, MapRef } from 'react-map-gl';
// @ts-expect-error: deck.gl types are missing or incompatible with current setup
import { MapboxOverlay } from '@deck.gl/mapbox';
// @ts-expect-error: deck.gl layers missing types
import { ScatterplotLayer, PathLayer, IconLayer, LineLayer } from '@deck.gl/layers';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CoTEntity, TrailPoint } from '../../types';
import { MapTooltip } from './MapTooltip';
import { MapContextMenu } from './MapContextMenu';
import { SaveLocationForm } from './SaveLocationForm';
import { PollingAreaVisualization } from './PollingAreaVisualization';
import { AltitudeLegend } from './AltitudeLegend';
import { useMissionLocations } from '../../hooks/useMissionLocations';
import { setMissionArea, getMissionArea } from '../../api/missionArea';

// ============================================================================
// ICON ATLAS — Simple chevron markers
// ============================================================================

const createIconAtlas = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';

    // Simple chevron/triangle for all entities (centered at 32, 32)
    ctx.save();
    ctx.translate(32, 32);
    ctx.beginPath();
    ctx.moveTo(0, -16);      // Top point
    ctx.lineTo(12, 8);       // Bottom right
    ctx.lineTo(0, 4);        // Bottom center (notch)
    ctx.lineTo(-12, 8);      // Bottom left
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Same chevron for vessels (at 96, 32)
    ctx.save();
    ctx.translate(96, 32);
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(12, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-12, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    return {
        url: canvas.toDataURL(),
        width: 128,
        height: 64,
        mapping: {
            aircraft: { x: 0, y: 0, width: 64, height: 64, anchorY: 32, mask: true },
            vessel: { x: 64, y: 0, width: 64, height: 64, anchorY: 32, mask: true }
        }
    };
};

const ICON_ATLAS = createIconAtlas();



// DeckGL Overlay Control
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DeckGLOverlay(props: any) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  
  const { onOverlayLoaded } = props;

  useEffect(() => {
      if (onOverlayLoaded) {
          onOverlayLoaded(overlay);
      }
  }, [overlay, onOverlayLoaded]);

  return null;
}

// Helper: Simple Haversine Distance in Meters
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/** Interpolate between two angles on the shortest arc */
function lerpAngle(a: number, b: number, t: number): number {
    const delta = ((b - a + 540) % 360) - 180;
    return (a + delta * t + 360) % 360;
}



/** 10-stop altitude color gradient with gamma correction - TACTICAL THEME (Green->Red) */
const ALTITUDE_STOPS: [number, [number, number, number]][] = [
    [0.00, [0, 255, 100]],    // Green (ground)
    [0.10, [50, 255, 50]],    // Lime
    [0.20, [150, 255, 0]],    // Yellow-green
    [0.30, [255, 255, 0]],    // Yellow
    [0.40, [255, 200, 0]],    // Gold
    [0.52, [255, 150, 0]],    // Orange
    [0.64, [255, 100, 0]],    // Red-orange
    [0.76, [255, 50, 50]],    // Red
    [0.88, [255, 0, 100]],    // Crimson
    [1.00, [255, 0, 255]],    // Magenta (max alt)
];

function altitudeToColor(altitudeMeters: number, alpha: number = 220): [number, number, number, number] {
    if (altitudeMeters == null || altitudeMeters < 0) return [100, 100, 100, alpha];
    const MAX_ALT = 13000; // meters
    const normalized = Math.min(altitudeMeters / MAX_ALT, 1.0);
    const t = Math.pow(normalized, 0.4); // Gamma compress — more variation at low altitudes

    // Find surrounding stops
    for (let i = 0; i < ALTITUDE_STOPS.length - 1; i++) {
        const [t0, c0] = ALTITUDE_STOPS[i];
        const [t1, c1] = ALTITUDE_STOPS[i + 1];
        if (t >= t0 && t <= t1) {
            const f = (t - t0) / (t1 - t0);
            return [
                Math.round(c0[0] + (c1[0] - c0[0]) * f),
                Math.round(c0[1] + (c1[1] - c0[1]) * f),
                Math.round(c0[2] + (c1[2] - c0[2]) * f),
                alpha,
            ];
        }
    }
    const last = ALTITUDE_STOPS[ALTITUDE_STOPS.length - 1][1];
    return [last[0], last[1], last[2], alpha];
}

/** Speed-based color for maritime entities (knots) - WATER THEME (Blue->Cyan) */
const SPEED_STOPS_KTS: [number, [number, number, number]][] = [
    [0,  [0, 50, 150]],     // Dark Blue — Anchored/Drifting
    [2,  [0, 100, 200]],    // Medium Blue
    [8,  [0, 150, 255]],    // Bright Blue
    [15, [0, 200, 255]],    // Light Blue
    [25, [200, 255, 255]],  // Cyan/White — High speed
];

function speedToColor(speedMs: number, alpha: number = 220): [number, number, number, number] {
    const kts = speedMs * 1.94384;
    for (let i = 0; i < SPEED_STOPS_KTS.length - 1; i++) {
        const [s0, c0] = SPEED_STOPS_KTS[i];
        const [s1, c1] = SPEED_STOPS_KTS[i + 1];
        if (kts >= s0 && kts <= s1) {
            const f = (kts - s0) / (s1 - s0);
            return [
                Math.round(c0[0] + (c1[0] - c0[0]) * f),
                Math.round(c0[1] + (c1[1] - c0[1]) * f),
                Math.round(c0[2] + (c1[2] - c0[2]) * f),
                alpha,
            ];
        }
    }
    // Above max stop
    const last = SPEED_STOPS_KTS[SPEED_STOPS_KTS.length - 1][1];
    return [last[0], last[1], last[2], alpha];
}

/** Unified color for any entity based on type */
function entityColor(entity: CoTEntity, alpha: number = 220): [number, number, number, number] {
    if (entity.type.includes('S')) {
        return speedToColor(entity.speed, alpha);
    }
    return altitudeToColor(entity.altitude, alpha);
}

/** Deterministic hash from UID for animation phase offset */
function uidToHash(uid: string): number {
    let h = 0;
    for (let i = 0; i < uid.length; i++) {
        h += uid.charCodeAt(i);
    }
    return h * 100;
}


// Props for TacticalMap
interface TacticalMapProps {
    onCountsUpdate?: (counts: { air: number; sea: number }) => void;
    filters?: { showAir: boolean; showSea: boolean };
    onEvent?: (event: { type: 'new' | 'lost' | 'alert'; message: string; entityType?: 'air' | 'sea' }) => void;
    selectedEntity: CoTEntity | null;
    onEntitySelect: (entity: CoTEntity | null) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onMissionPropsReady?: (props: any) => void;
    showVelocityVectors?: boolean;
}

// Adaptive Zoom Calculation
const calculateZoom = (radiusNm: number) => {
    const r = Math.max(1, radiusNm);
    return Math.max(2, 14 - Math.log2(r));
};

export function TacticalMap({ onCountsUpdate, filters, onEvent, selectedEntity, onEntitySelect, onMissionPropsReady, showVelocityVectors }: TacticalMapProps) {

    // Refs for Transient State (No React Re-renders)
    const entitiesRef = useRef<Map<string, CoTEntity>>(new Map());
    const overlayRef = useRef<MapboxOverlay | null>(null);
    const rafRef = useRef<number>();
    const countsRef = useRef({ air: 0, sea: 0 });
    const knownUidsRef = useRef<Set<string>>(new Set()); // Track known UIDs for new/lost events
    const currentMissionRef = useRef<{ lat: number; lon: number; radius_nm: number } | null>(null);
    const prevCourseRef = useRef<Map<string, number>>(new Map());
    const prevSnapshotsRef = useRef<Map<string, { lon: number; lat: number; ts: number }>>(new Map());
    const currSnapshotsRef = useRef<Map<string, { lon: number; lat: number; ts: number }>>(new Map());
    const visualStateRef = useRef<Map<string, { lon: number; lat: number }>>(new Map());
    


    // State for UI interactions (causes re-renders but tooltip needs it)
    const [hoveredEntity, setHoveredEntity] = useState<CoTEntity | null>(null);
    // selectedEntity is now passed as prop
    const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);

    // Context Menu State
    const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
    const [contextMenuCoords, setContextMenuCoords] = useState<{ lat: number; lon: number } | null>(null);

    // Save Location Form State
    const [showSaveForm, setShowSaveForm] = useState(false);
    const [saveFormCoords, setSaveFormCoords] = useState<{ lat: number; lon: number } | null>(null);

    // Velocity Vector Toggle - use ref for reactivity in animation loop
    const velocityVectorsRef = useRef(showVelocityVectors ?? false);
    
    // Update ref when prop changes
    useEffect(() => {
        if (showVelocityVectors !== undefined) {
            velocityVectorsRef.current = showVelocityVectors;
        }
    }, [showVelocityVectors]);

    // Mission Management
    const { savedMissions, saveMission, deleteMission } = useMissionLocations();
    const [currentMission, setCurrentMission] = useState<{ lat: number; lon: number; radius_nm: number } | null>(null);

    // Mission Area Handlers - Defined early to be used in effects
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleContextMenu = useCallback((e: any) => {
        e.preventDefault();
        const { lngLat, point } = e;
        setContextMenuPos({ x: point.x, y: point.y });
        setContextMenuCoords({ lat: lngLat.lat, lon: lngLat.lng });
    }, []);

    const handleSetFocus = useCallback(async (lat: number, lon: number) => {
         try {
             // Use ref or current state. Since this is async/user-triggered, current state is fine but we need it in deps.
             // But to decouple, we can read the ENV fallback if mission is null.
             const radius = currentMissionRef.current?.radius_nm || parseInt(import.meta.env.VITE_COVERAGE_RADIUS_NM || '150');
             await setMissionArea({ lat, lon, radius_nm: radius });
             setCurrentMission({ lat, lon, radius_nm: radius });
             
             // Clear old entities when changing mission area
             entitiesRef.current.clear();
             console.log('🗑️ Cleared old entities for new mission area');
             
             // Fly map to new location
             if (mapRef.current) {
                 mapRef.current.flyTo({
                     center: [lon, lat],
                     zoom: calculateZoom(radius),
                     duration: 2000
                 });
             }
             
             console.log(`📍 Mission area pivoted to: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
         } catch (error) {
             console.error('Failed to set mission focus:', error);
         }
    }, []);

    const handlePresetSelect = useCallback(async (radius: number) => {
        const mission = currentMissionRef.current;
        if (!mission) return;
        
        try {
            await setMissionArea({ lat: mission.lat, lon: mission.lon, radius_nm: radius });
            setCurrentMission({ ...mission, radius_nm: radius });
            
            if (mapRef.current) {
                mapRef.current.flyTo({
                    zoom: calculateZoom(radius),
                    duration: 1000
                });
            }

            console.log(`📐 Radius updated to ${radius}nm`);
        } catch (error) {
            console.error('Failed to update radius:', error);
        }
    }, []);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleSwitchMission = useCallback(async (mission: any) => {
        await handleSetFocus(mission.lat, mission.lon);
        setCurrentMission({ lat: mission.lat, lon: mission.lon, radius_nm: mission.radius_nm });
    }, [handleSetFocus]);

    // Expose mission management to parent
    useEffect(() => {
        if (onMissionPropsReady) {
            onMissionPropsReady({
                savedMissions,
                currentMission,
                onSwitchMission: handleSwitchMission,
                onDeleteMission: deleteMission,
                onPresetSelect: handlePresetSelect,
            });
        }
    }, [savedMissions, currentMission, onMissionPropsReady, handleSwitchMission, deleteMission, handlePresetSelect]);

    // Load active mission state on mount and poll for updates
    useEffect(() => {
        const loadActiveMission = async () => {
            try {
                const mission = await getMissionArea();
                if (mission && mission.lat && mission.lon) {
                    // Only update if mission has actually changed to prevent map resets/clears
                    const prev = currentMissionRef.current;
                    if (!prev || prev.lat !== mission.lat || prev.lon !== mission.lon || prev.radius_nm !== mission.radius_nm) {
                        console.log('🔄 Syncing with active mission:', mission);
                        // Update state (this will trigger the clear effect below)
                        setCurrentMission({
                            lat: mission.lat,
                            lon: mission.lon,
                            radius_nm: mission.radius_nm
                        });
                        
                        // Sync map view to active mission (Only on actual change)
                        if (mapRef.current) {
                            mapRef.current.flyTo({
                                center: [mission.lon, mission.lat],
                                zoom: calculateZoom(mission.radius_nm),
                                duration: 2000
                            });
                        }
                    }
                }
            } catch (err) {
                console.warn('Failed to load active mission:', err);
            }
        };
        loadActiveMission();
        // Poll every 2 seconds for external updates
        const timer = setInterval(loadActiveMission, 2000);
        return () => clearInterval(timer);
    }, []);

    // Clear entities when mission area changes (New Selection, Preset, or External Update)
    useEffect(() => {
        if (currentMission) {
            // Update ref for polling comparison
            currentMissionRef.current = currentMission;

            console.log('🧹 Clearing map entities for new mission parameters...');
            entitiesRef.current.clear();
            knownUidsRef.current.clear();
            prevCourseRef.current.clear();
            prevSnapshotsRef.current.clear();
            currSnapshotsRef.current.clear();
            countsRef.current = { air: 0, sea: 0 };
            onCountsUpdate?.({ air: 0, sea: 0 });
            
            // Clear selection to avoid ghost trails
            onEntitySelect(null);
        }
    }, [currentMission, onCountsUpdate, onEntitySelect]);

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

                   // Spatial Filter: Drop entities outside active mission area
                   // (Backend should filter, but this cleanup prevents stale data artifacts)
                   const mission = currentMissionRef.current;
                   if (mission) {
                       const distToCenter = getDistanceMeters(newLat, newLon, mission.lat, mission.lon);
                       const maxRadiusM = mission.radius_nm * 1852;
                       
                       // Allow 5% buffer for edge cases, but drop outliers
                       if (distToCenter > maxRadiusM * 1.05) {
                           // If it exists, remove it (it moved out of bounds)
                           if (existing) {
                               entitiesRef.current.delete(entity.uid);
                               knownUidsRef.current.delete(entity.uid);
                               onEvent?.({
                                   type: 'lost',
                                   message: `${isShip ? '🚢' : '✈️'} ${existing.callsign || entity.uid} (Out of Range)`,
                                   entityType: isShip ? 'sea' : 'air'
                               });
                           }
                           return; // Skip update
                       }
                   }
                   
                   // Build trail from existing positions (max 100 points for rich history).
                   // Minimum distance gate (30m) prevents multilateration noise between
                   // ADS-B source networks from accumulating as zigzag artefacts in the trail.
                   const MIN_TRAIL_DIST_M = 30;
                   let trail: TrailPoint[] = existing?.trail || [];
                   const lastTrail = trail[trail.length - 1];
                   const distFromLastTrail = lastTrail
                       ? getDistanceMeters(lastTrail[1], lastTrail[0], newLat, newLon)
                       : Infinity;
                   if (distFromLastTrail > MIN_TRAIL_DIST_M) {
                       const speed = entity.detail?.track?.speed || 0;
                       trail = [...trail, [newLon, newLat, entity.hae || 0, speed] as TrailPoint].slice(-100);
                   }
                   
                    const callsign = entity.detail?.contact?.callsign?.trim() || entity.uid;
                    
                    // TIMESTAMP CHECK: Prevent "Sawtooth" / Time-Travel
                    // If we have a newer update already, ignore this one.
                    const existingEntity = entitiesRef.current.get(entity.uid);
                    
                    // 1. Strict Source Ordering (if both have timestamps)
                    if (existingEntity && existingEntity.lastSourceTime && entity.time) {
                        if (existingEntity.lastSourceTime >= entity.time) {
                            return; // Drop stale AND duplicate packets (Strictly Monotonic)
                        }
                    }

                    // Snapshot for interpolation (BEFORE updating the entity)
                    const currSnap = currSnapshotsRef.current.get(entity.uid);
                    if (currSnap && (currSnap.lon !== newLon || currSnap.lat !== newLat)) {
                        prevSnapshotsRef.current.set(entity.uid, { ...currSnap });
                    }
                    currSnapshotsRef.current.set(entity.uid, { lon: newLon, lat: newLat, ts: Date.now() });
                    
                    entitiesRef.current.set(entity.uid, {
                        uid: entity.uid,
                        lat: newLat,
                        lon: newLon,
                        altitude: entity.hae || 0, // Height Above Ellipsoid in meters (Proto is flat)
                        type: entity.type,
                        course: entity.detail?.track?.course || 0,
                        speed: entity.detail?.track?.speed || 0,
                        callsign,
                        // SEPARATION OF CONCERNS:
                        // time: The raw source time from the packet
                        // lastSourceTime: The newest source time we have accepted (for ordering)
                        // lastSeen: The local wall-clock time (for fading/stale checks)
                        time: entity.time,
                        lastSourceTime: entity.time || existingEntity?.lastSourceTime, 
                        lastSeen: Date.now(), 
                        trail,
                        uidHash: 0 // Will be set below
                    });
                    
                    // Pre-compute UID hash for glow animation (once per entity, not per frame)
                    const stored = entitiesRef.current.get(entity.uid)!;
                    if (stored.uidHash == null || stored.uidHash === 0) {
                        stored.uidHash = uidToHash(entity.uid);
                    }
                    
                    // Smooth course transitions
                    const prevCourse = prevCourseRef.current.get(entity.uid);
                    const rawCourse = entity.detail?.track?.course || 0;
                    const smoothedCourse = prevCourse != null ? lerpAngle(prevCourse, rawCourse, 0.18) : rawCourse;
                    prevCourseRef.current.set(entity.uid, smoothedCourse);
                    stored.course = smoothedCourse;
                   
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
        
        // ... (WebSocket Setup - No changes needed here, skipping context to lessen payload) ...
        // Note: In real code replace, I'd probably skip the whole connection block and target specific chunks if they were static.
        // But since I need to replace the animate function too which is further down, and the tool limits chunking...
        // Actually, I can just replace the entity update block above, and then make a separate call for the animate loop.
        // Let's stick to the entity update block first.


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
                    // console.log(`Reconnecting in ${delay/1000}s...`);
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

    }, [onEvent]);

    // Animation Loop
    useEffect(() => {
        const animate = () => {
            // 1. Cleanup stale entities
            const entities = entitiesRef.current;
            const now = Date.now();
            const STALE_THRESHOLD_AIR_MS = 120 * 1000;
            const STALE_THRESHOLD_SEA_MS = 300 * 1000;
            
            for (const [uid, entity] of entities) {
                const isShip = entity.type?.includes('S');
                const threshold = isShip ? STALE_THRESHOLD_SEA_MS : STALE_THRESHOLD_AIR_MS;
                
                if (now - entity.lastSeen > threshold) {
                    entities.delete(uid);
                    knownUidsRef.current.delete(uid);
                    prevCourseRef.current.delete(uid);
                    prevSnapshotsRef.current.delete(uid);
                    currSnapshotsRef.current.delete(uid);
                    
                    onEvent?.({
                        type: 'lost',
                        message: `${isShip ? '🚢' : '✈️'} ${entity.callsign}`,
                        entityType: isShip ? 'sea' : 'air'
                    });
                }
            }
            
            // 2. Report counts
            let airCount = 0;
            let seaCount = 0;
            for (const entity of entities.values()) {
                if (entity.type?.includes('S')) {
                    seaCount++;
                } else {
                    airCount++;
                }
            }
            
            if (countsRef.current.air !== airCount || countsRef.current.sea !== seaCount) {
                countsRef.current = { air: airCount, sea: seaCount };
                onCountsUpdate?.({ air: airCount, sea: seaCount });
            }
            
            // 3. Interpolate
            const interpolated: CoTEntity[] = [];
            for (const entity of entities.values()) {
                const isShip = entity.type?.includes('S');
                if (isShip && !filters?.showSea) continue;
                if (!isShip && !filters?.showAir) continue;

                const prev = prevSnapshotsRef.current.get(entity.uid);
                const curr = currSnapshotsRef.current.get(entity.uid);

                let targetLon = entity.lon;
                let targetLat = entity.lat;

                if (prev && curr && curr.ts > prev.ts) {
                    const elapsed = now - curr.ts;
                    const duration = curr.ts - prev.ts;
                    // Cap at 1.0× — beyond the measured update interval we switch to
                    // physics-based dead reckoning using the aircraft's own course/speed
                    // rather than overshooting the geometric interpolation.
                    const t = Math.min(elapsed / Math.max(duration, 100), 1.0);

                    targetLon = prev.lon + (curr.lon - prev.lon) * t;
                    targetLat = prev.lat + (curr.lat - prev.lat) * t;

                    // Dead reckoning: once we've exhausted the measured interval,
                    // project forward using course + speed from the track message.
                    if (elapsed > duration && entity.speed > 1.0) {
                        const overrun = (elapsed - duration) / 1000; // seconds past last update
                        const courseRad = (entity.course || 0) * Math.PI / 180;
                        const R = 6_371_000;
                        const latRad = entity.lat * Math.PI / 180;
                        const distM = entity.speed * overrun;
                        const dLat = (distM * Math.cos(courseRad)) / R;
                        const dLon = (distM * Math.sin(courseRad)) / (R * Math.cos(latRad));
                        targetLat = entity.lat + dLat * (180 / Math.PI);
                        targetLon = entity.lon + dLon * (180 / Math.PI);
                    }
                }

                let visual = visualStateRef.current.get(entity.uid);
                if (!visual) {
                    visual = { lat: targetLat, lon: targetLon };
                } else {
                    // Velocity-adaptive EWMA: fast aircraft converge quickly to avoid
                    // visible positional lag (83m at 500kts with α=0.05); slow vessels
                    // keep the gentle smoothing. Applied to position only — heading
                    // smoothing is handled separately via lerpAngle in the update handler.
                    const speedKts = entity.speed * 1.94384;
                    const SMOOTH_FACTOR = speedKts > 200 ? 0.15 :
                                         speedKts > 50  ? 0.10 :
                                                          0.05;
                    visual.lat = visual.lat + (targetLat - visual.lat) * SMOOTH_FACTOR;
                    visual.lon = visual.lon + (targetLon - visual.lon) * SMOOTH_FACTOR;
                }
                visualStateRef.current.set(entity.uid, visual);

                interpolated.push({ ...entity, lon: visual.lon, lat: visual.lat });
            }
            
            // 4. Update Layers


            const layers = [
                ...(selectedEntity && interpolated.find(e => e.uid === selectedEntity.uid)
                    ? (() => {
                        const entity = interpolated.find(e => e.uid === selectedEntity.uid)!;
                        if (entity.trail.length < 2) return [];
                        const trailPath = entity.trail.map(p => [p[0], p[1], p[2]]);
                        const isShip = entity.type.includes('S');
                        const trailColor = isShip
                            ? speedToColor(entity.speed, 200)
                            : altitudeToColor(entity.altitude, 200);

                        return [new PathLayer({
                            id: `selected-trail-${selectedEntity.uid}`,
                            data: [{ path: trailPath }],
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            getPath: (d: any) => d.path,
                            getColor: trailColor,
                            getWidth: 3,
                            widthMinPixels: 2.5,
                            pickable: false,
                            jointRounded: true,
                            capRounded: true,
                            opacity: 1.0,
                        })];
                    })()
                    : []),

                new IconLayer({
                    id: 'heading-arrows',
                    data: interpolated,
                    getIcon: (d: CoTEntity) => {
                        const isVessel = d.type.includes('S');
                        return isVessel ? 'vessel' : 'aircraft';
                    },
                    iconAtlas: ICON_ATLAS.url,
                    iconMapping: ICON_ATLAS.mapping,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    getPosition: (d: any) => [d.lon, d.lat, d.altitude || 0],
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    getSize: (d: any) => {
                        const isSelected = selectedEntity?.uid === d.uid;
                        const isVessel = d.type.includes('S');
                        const baseSize = isVessel ? 24 : 32;
                        return isSelected ? baseSize * 1.3 : baseSize;
                    },
                    sizeUnits: 'pixels' as const,
                    billboard: true,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    getAngle: (d: any) => -(d.course || 0),
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    getColor: (d: any) => entityColor(d as CoTEntity),
                    pickable: true,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onHover: (info: { object?: any; x: number; y: number }) => {
                        if (info.object) {
                            setHoveredEntity(info.object as CoTEntity);
                            setHoverPosition({ x: info.x, y: info.y });
                        } else {
                            setHoveredEntity(null);
                            setHoverPosition(null);
                        }
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
                    }
                }),

                new ScatterplotLayer({
                    id: 'entity-glow',
                    data: interpolated,
                    getPosition: (d: CoTEntity) => [d.lon, d.lat, d.altitude || 0],
                    getRadius: (d: CoTEntity) => {
                        const isSelected = selectedEntity?.uid === d.uid;
                        const pulse = (Math.sin((now + d.uidHash) / 600) + 1) / 2;
                        const base = isSelected ? 20 : 6;
                        return base * (1 + (pulse * 0.1));
                    },
                    radiusUnits: 'pixels' as const,
                    getFillColor: (d: CoTEntity) => {
                        const isSelected = selectedEntity?.uid === d.uid;
                        const pulse = (Math.sin((now + d.uidHash) / 600) + 1) / 2;
                        const baseAlpha = isSelected ? 60 : 10;
                        const a = baseAlpha * (0.8 + pulse * 0.2);
                        return entityColor(d, a);
                    },
                    pickable: false,
                    updateTriggers: { getRadius: [now], getFillColor: [now] }
                }),

                ...(selectedEntity ? [
                    new ScatterplotLayer({
                        id: `selection-ring-${selectedEntity.uid}`,
                        data: interpolated.filter(e => e.uid === selectedEntity.uid),
                        getPosition: (d: CoTEntity) => [d.lon, d.lat, d.altitude || 0],
                        getRadius: () => {
                            const cycle = (now % 2000) / 2000; // Faster pulse (2s)
                            return 30 + cycle * 40; // Start larger (30px) to clear icon
                        },
                        radiusUnits: 'pixels' as const,
                        getFillColor: [0, 0, 0, 0],
                        getLineColor: () => {
                            const cycle = (now % 2000) / 2000;
                            const alpha = Math.round(255 * (1 - Math.pow(cycle, 2))); // Brighter start
                            return entityColor(selectedEntity, alpha);
                        },
                        getLineWidth: 3, // Thicker line
                        stroked: true,
                        filled: false,
                        pickable: false,
                        updateTriggers: { getRadius: [now], getLineColor: [now] }
                    })
                ] : []),

                ...(velocityVectorsRef.current ? [
                    new LineLayer({
                        id: 'velocity-vectors',
                        data: interpolated.filter(e => e.speed > 0.5),
                        getSourcePosition: (d: CoTEntity) => [d.lon, d.lat, d.altitude || 0],
                        getTargetPosition: (d: CoTEntity) => {
                            const projectionSeconds = 45;
                            const distMeters = d.speed * projectionSeconds;
                            const courseRad = (d.course || 0) * Math.PI / 180;
                            const R = 6371000;
                            const latRad = d.lat * Math.PI / 180;
                            const dLat = (distMeters * Math.cos(courseRad)) / R;
                            const dLon = (distMeters * Math.sin(courseRad)) / (R * Math.cos(latRad));
                            return [
                                d.lon + dLon * (180 / Math.PI),
                                d.lat + dLat * (180 / Math.PI),
                                d.altitude || 0,
                            ];
                        },
                        getColor: (d: CoTEntity) => entityColor(d, 120),
                        getWidth: 1.5,
                        widthMinPixels: 1,
                        pickable: false,
                    })
                ] : []),

            ];

            if (overlayRef.current) {
                overlayRef.current.setProps({ layers });
            }

            rafRef.current = requestAnimationFrame(animate);
        };

        const rafId = requestAnimationFrame(animate);
        rafRef.current = rafId;

        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [selectedEntity, onCountsUpdate, filters, onEvent, onEntitySelect]);

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

    // Handlers (moved to useCallback above)
    // Removed duplicate definitions: handleContextMenu, handleSetFocus, handleSaveLocation, handleSaveFormSubmit, handleSaveFormCancel, handleReturnHome, handlePresetSelect, handleSwitchMission
    // But we need to keep the ones NOT moved yet or just remove the duplicates if I moved them.
    // I moved handleContextMenu, handleSetFocus, handlePresetSelect, handleSwitchMission.
    // I did NOT move handleSaveLocation, handleSaveFormSubmit, handleSaveFormCancel, handleReturnHome.
    
    const handleSaveLocation = useCallback((lat: number, lon: number) => {
        // Open inline form instead of prompt
        setSaveFormCoords({ lat, lon });
        setShowSaveForm(true);
        setContextMenuPos(null); // Close context menu
    }, []);

    const handleSaveFormSubmit = useCallback((name: string, radius: number) => {
        if (!saveFormCoords) return;
        
        saveMission({ 
            name, 
            lat: saveFormCoords.lat, 
            lon: saveFormCoords.lon, 
            radius_nm: radius 
        });
        
        console.log(`💾 Saved mission location: ${name}`);
        setShowSaveForm(false);
        setSaveFormCoords(null);
    }, [saveFormCoords, saveMission]);

    const handleSaveFormCancel = useCallback(() => {
        setShowSaveForm(false);
        setSaveFormCoords(null);
    }, []);

    const handleReturnHome = useCallback(async () => {
        const defaultLat = parseFloat(import.meta.env.VITE_CENTER_LAT || '45.5152');
        const defaultLon = parseFloat(import.meta.env.VITE_CENTER_LON || '-122.6784');
        const defaultRadius = parseInt(import.meta.env.VITE_COVERAGE_RADIUS_NM || '150');

        await handleSetFocus(defaultLat, defaultLon);
        setCurrentMission({ lat: defaultLat, lon: defaultLon, radius_nm: defaultRadius });
    }, [handleSetFocus]);

    const handleOverlayLoaded = useCallback((overlay: MapboxOverlay) => {
        overlayRef.current = overlay;
    }, []);

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
            // @ts-expect-error: maplibre-gl type incompatibility with react-map-gl
            mapLib={mapToken ? undefined : import('maplibre-gl')}
            style={{width: '100vw', height: '100vh', userSelect: 'none', WebkitUserSelect: 'none'}}
            onContextMenu={handleContextMenu}
            onClick={() => {
                setContextMenuPos(null);
                setContextMenuCoords(null);
            }}
        >
            <DeckGLOverlay 
                interleaved={true} 
                onOverlayLoaded={handleOverlayLoaded}
            />
            
            {/* Polling Area Visualization based on CURRENT mission state */}
            {currentMission ? (
                <PollingAreaVisualization 
                    center={currentMission} 
                    radiusNm={currentMission.radius_nm} 
                />
            ) : (
                <PollingAreaVisualization 
                    center={{ lat: initialLat, lon: initialLon }} 
                    radiusNm={parseInt(import.meta.env.VITE_COVERAGE_RADIUS_NM || '150')} 
                />
            )}
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
        
        {/* Save Location Form */}
        {showSaveForm && (
            <SaveLocationForm
                coordinates={saveFormCoords}
                onSave={handleSaveFormSubmit}
                onCancel={handleSaveFormCancel}
            />
        )}
        

        {/* Modern Map Tooltip */}
        {hoveredEntity && hoverPosition && (
            <MapTooltip entity={hoveredEntity} position={hoverPosition} />
        )}
        
        {/* Altitude Legend (Visible for Air Layer) */}
        <AltitudeLegend visible={filters?.showAir ?? true} />
    </>
    );
};



export default TacticalMap;

