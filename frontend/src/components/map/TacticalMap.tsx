import { useEffect, useRef, useState, useCallback } from 'react';
import { Map as GLMap, useControl, MapRef } from 'react-map-gl';
// @ts-expect-error: deck.gl layers missing types
import { MapboxOverlay } from '@deck.gl/mapbox';
// @ts-expect-error: deck.gl layers missing types
import { ScatterplotLayer, PathLayer, IconLayer, LineLayer } from '@deck.gl/layers';
import 'maplibre-gl/dist/maplibre-gl.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import { CoTEntity, TrailPoint, MissionProps } from '../../types';
import { MapTooltip } from './MapTooltip';
import { MapContextMenu } from './MapContextMenu';
import { SaveLocationForm } from './SaveLocationForm';
import { AltitudeLegend } from './AltitudeLegend';
import { SpeedLegend } from './SpeedLegend';
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
  
  const isDeadRef = useRef(false);
  useEffect(() => {
    isDeadRef.current = false;
    return () => { isDeadRef.current = true; };
  }, []);

  // Sync props in an effect to avoid calling setProps during render
  useEffect(() => {
    if (overlay && overlay.setProps && !isDeadRef.current) {
        try {
            overlay.setProps(props);
        } catch (e) {
            // Expected during style changes, just log briefly if needed
            console.debug("[DeckGLOverlay] Transitioning props...");
        }
    }
  }, [props, overlay]);
  
  const { onOverlayLoaded } = props;

  useEffect(() => {
      if (onOverlayLoaded && overlay) {
          onOverlayLoaded(overlay);
      }
      return () => {
          if (onOverlayLoaded) onOverlayLoaded(null);
      };
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

// Helper: Calculate Rhumb Line Bearing (Mercator straight line)
function getBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const φ1 = lat1 * toRad;
    const φ2 = lat2 * toRad;
    let Δλ = (lon2 - lon1) * toRad;

    // Project Latitudes (Mercator "stretched" latitude)
    const ψ1 = Math.log(Math.tan(Math.PI / 4 + φ1 / 2));
    const ψ2 = Math.log(Math.tan(Math.PI / 4 + φ2 / 2));
    const Δψ = ψ2 - ψ1;

    // Handle wrapping around the 180th meridian
    if (Math.abs(Δλ) > Math.PI) {
        Δλ = Δλ > 0 ? -(2 * Math.PI - Δλ) : (2 * Math.PI + Δλ);
    }

    const θ = Math.atan2(Δλ, Δψ);
    return (θ * toDeg + 360) % 360;
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
    if (!uid) return 0;
    let h = 0;
    for (let i = 0; i < uid.length; i++) {
        h += uid.charCodeAt(i);
    }
    return h * 100;
}

/**
 * Helper: Applies 3D altitude compensation to center the focal point on the icon
 * rather than the ground coordinates.
 */
function getCompensatedCenter(lat: number, lon: number, alt: number, map: any): [number, number] {
    const pitch = map.getPitch();
    if (pitch <= 0 || alt <= 0) return [lon, lat];

    const bearing = (map.getBearing() * Math.PI) / 180;
    const pitchRad = (pitch * Math.PI) / 180;

    // Horizontal shift (meters) required to compensate for height projection
    const shiftM = alt * Math.tan(pitchRad);

    // Convert meters to lat/lon degrees
    const R = 6371000;
    const dLat = (shiftM * Math.cos(bearing)) / R * (180 / Math.PI);
    const dLon = (shiftM * Math.sin(bearing)) / (R * Math.cos(lat * Math.PI / 180)) * (180 / Math.PI);

    return [lon + dLon, lat + dLat];
}


// Props for TacticalMap
interface TacticalMapProps {
    onCountsUpdate?: (counts: { air: number; sea: number }) => void;
    filters?: { showAir: boolean; showSea: boolean };
    onEvent?: (event: { type: 'new' | 'lost' | 'alert'; message: string; entityType?: 'air' | 'sea' }) => void;
    selectedEntity: CoTEntity | null;
    onEntitySelect: (entity: CoTEntity | null) => void;
    onMissionPropsReady?: (props: MissionProps) => void;
    onMapActionsReady?: (actions: import('../../types').MapActions) => void;
    showVelocityVectors?: boolean;
    showHistoryTails?: boolean;
    replayMode?: boolean;
    replayEntities?: Map<string, CoTEntity>;
    followMode?: boolean;
    onFollowModeChange?: (enabled: boolean) => void;
}

interface DeadReckoningState {
    serverLat: number;
    serverLon: number;
    serverSpeed: number;
    serverCourseRad: number;
    serverTime: number;
    blendLat: number;
    blendLon: number;
    blendSpeed: number;
    blendCourseRad: number;
    expectedInterval: number;
}

// Adaptive Zoom Calculation
const calculateZoom = (radiusNm: number) => {
    const r = Math.max(1, radiusNm);
    return Math.max(2, 14 - Math.log2(r));
};

export function TacticalMap({ onCountsUpdate, filters, onEvent, selectedEntity, onEntitySelect, onMissionPropsReady, onMapActionsReady, showVelocityVectors, showHistoryTails, replayMode, replayEntities, followMode, onFollowModeChange }: TacticalMapProps) {

    const lastFrameTimeRef = useRef<number>(Date.now());
    

    // State for UI interactions
    const [hoveredEntity, setHoveredEntity] = useState<CoTEntity | null>(null);
    const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
    const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
    const [contextMenuCoords, setContextMenuCoords] = useState<{ lat: number; lon: number } | null>(null);
    const [showSaveForm, setShowSaveForm] = useState(false);
    const [saveFormCoords, setSaveFormCoords] = useState<{ lat: number; lon: number } | null>(null);

    // Map & Style States
    const [mapLoaded, setMapLoaded] = useState(false);
    const [enable3d, setEnable3d] = useState(false);
    const mapToken = import.meta.env.VITE_MAPBOX_TOKEN;
    const mapStyle = mapToken 
        ? "mapbox://styles/mapbox/standard" 
        : "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
    
    const mapRef = useRef<MapRef>(null);
    const overlayRef = useRef<MapboxOverlay | null>(null);
    const rafRef = useRef<number>();
    
    // Environment Fallbacks
    const envLat = import.meta.env.VITE_CENTER_LAT;
    const envLon = import.meta.env.VITE_CENTER_LON;
    const initialLat = envLat ? parseFloat(envLat) : 45.5152;
    const initialLon = envLon ? parseFloat(envLon) : -122.6784;
    const initialZoom = 9.5;

    // View State (Controlled for bearing tracking)
    const [viewState, setViewState] = useState({
        latitude: initialLat,
        longitude: initialLon,
        zoom: initialZoom,
        pitch: enable3d ? 50 : 0,
        bearing: 0
    });

    // State Variables (Already moved to top)
    // Refs for transient state
    const entitiesRef = useRef<Map<string, CoTEntity>>(new Map());
    const countsRef = useRef({ air: 0, sea: 0 });
    const knownUidsRef = useRef<Set<string>>(new Set());
    const currentMissionRef = useRef<{ lat: number; lon: number; radius_nm: number } | null>(null);
    const prevCourseRef = useRef<Map<string, number>>(new Map());
    const drStateRef = useRef<Map<string, DeadReckoningState>>(new Map());
    const visualStateRef = useRef<Map<string, { lon: number; lat: number; alt: number }>>(new Map());

    // Velocity Vector Toggle - use ref for reactivity in animation loop
    const velocityVectorsRef = useRef(showVelocityVectors ?? false);
    const historyTailsRef = useRef(showHistoryTails ?? true); // Default to true as per user preference
    const replayEntitiesRef = useRef<Map<string, CoTEntity>>(new Map());
    const followModeRef = useRef(followMode ?? false);
    const selectedEntityRef = useRef<CoTEntity | null>(selectedEntity);
    
    // Sync followMode ref
    useEffect(() => {
        followModeRef.current = followMode ?? false;
    }, [followMode]);

    // Sync selectedEntity ref
    useEffect(() => {
        selectedEntityRef.current = selectedEntity;
    }, [selectedEntity]);

    // Sync Replay Entities Ref
    useEffect(() => {
        if (replayEntities) {
            replayEntitiesRef.current = replayEntities;
        }
    }, [replayEntities]);
    
    // Update ref when prop changes
    useEffect(() => {
        if (showVelocityVectors !== undefined) {
            velocityVectorsRef.current = showVelocityVectors;
        }
    }, [showVelocityVectors]);

    useEffect(() => {
        if (showHistoryTails !== undefined) {
            historyTailsRef.current = showHistoryTails;
        }
    }, [showHistoryTails]);

    // Mission Management
    const { savedMissions, saveMission, deleteMission } = useMissionLocations();
    const [currentMission, setCurrentMission] = useState<{ lat: number; lon: number; radius_nm: number } | null>(null);

    // AOT Area States (for Deck.gl layers)
    const [aotShapes, setAotShapes] = useState<{ maritime: number[][], aviation: number[][] } | null>(null);

    // Update AOT Geometry when mission changes - moved here to ensure currentMission is defined
    useEffect(() => {
        const targetLat = currentMission?.lat ?? initialLat;
        const targetLon = currentMission?.lon ?? initialLon;
        const radiusNm = currentMission?.radius_nm ?? parseInt(import.meta.env.VITE_COVERAGE_RADIUS_NM || '150');
        
        const NM_TO_DEG = 1 / 60;
        const cosLat = Math.cos(targetLat * (Math.PI / 180));
        const safeCosLat = Math.max(Math.abs(cosLat), 0.0001);
        
        // Maritime Box (only if actual mission exists)
        const maritime = currentMission ? [
            [targetLon - (radiusNm * NM_TO_DEG / safeCosLat), targetLat - (radiusNm * NM_TO_DEG)],
            [targetLon + (radiusNm * NM_TO_DEG / safeCosLat), targetLat - (radiusNm * NM_TO_DEG)],
            [targetLon + (radiusNm * NM_TO_DEG / safeCosLat), targetLat + (radiusNm * NM_TO_DEG)],
            [targetLon - (radiusNm * NM_TO_DEG / safeCosLat), targetLat + (radiusNm * NM_TO_DEG)],
            [targetLon - (radiusNm * NM_TO_DEG / safeCosLat), targetLat - (radiusNm * NM_TO_DEG)]
        ] : [];

        // Aviation Circle
        const aviation: number[][] = [];
        for (let i = 0; i <= 64; i++) {
            const angle = (i / 64) * 2 * Math.PI;
            const dLat = (radiusNm * NM_TO_DEG) * Math.cos(angle);
            const dLon = (radiusNm * NM_TO_DEG / safeCosLat) * Math.sin(angle);
            aviation.push([targetLon + dLon, targetLat + dLat]);
        }

        setAotShapes({ maritime, aviation });
    }, [currentMission, initialLat, initialLon]);

    // Mission Area Handlers - Defined early to be used in effects
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleContextMenu = useCallback((e: any) => {
        e.preventDefault();
        const { lngLat, point } = e;
        setContextMenuPos({ x: point.x, y: point.y });
        setContextMenuCoords({ lat: lngLat.lat, lon: lngLat.lng });
    }, []);

    const handleSetFocus = useCallback(async (lat: number, lon: number, radius?: number) => {
         try {
             // Use provided radius, or fallback to current/default
             const targetRadius = radius || currentMissionRef.current?.radius_nm || parseInt(import.meta.env.VITE_COVERAGE_RADIUS_NM || '150');
             await setMissionArea({ lat, lon, radius_nm: targetRadius });
             setCurrentMission({ lat, lon, radius_nm: targetRadius });
             
             // Clear old entities when changing mission area
             entitiesRef.current.clear();
             console.log('🗑️ Cleared old entities for new mission area');
             
             // Fly map to new location
             if (mapRef.current) {
                 mapRef.current.flyTo({
                     center: [lon, lat],
                     zoom: calculateZoom(targetRadius),
                     duration: 2000,
                     easing: (t: number) => 1 - Math.pow(1 - t, 3),
                 });
             }
             
             console.log(`📍 Mission area pivoted to: ${lat.toFixed(4)}, ${lon.toFixed(4)} @ ${targetRadius}nm`);
         } catch (error) {
             console.error('Failed to set mission focus:', error);
         }
    }, []);

    const handlePresetSelect = useCallback(async (radius: number) => {
        const mission = currentMissionRef.current;
        if (!mission) return;
        
        await handleSetFocus(mission.lat, mission.lon, radius);
    }, [handleSetFocus]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleSwitchMission = useCallback(async (mission: any) => {
        await handleSetFocus(mission.lat, mission.lon, mission.radius_nm);
        // setCurrentMission is now handled inside handleSetFocus to ensure sync
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
    
    // Expose Map Actions (Search, FlyTo)
    // onMapActionsReady is already destructured from props
    


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
                                duration: 2000,
                                easing: (t: number) => 1 - Math.pow(1 - t, 3),
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
            drStateRef.current.clear();
            lastFrameTimeRef.current = Date.now();
            countsRef.current = { air: 0, sea: 0 };
            onCountsUpdate?.({ air: 0, sea: 0 });
            
            // Clear selection to avoid ghost trails
            onEntitySelect(null);
        }
    }, [currentMission, onCountsUpdate, onEntitySelect]);

    // FOLLOW MODE EFFECT
    // DEPRECATED: useEffect based following causes rubber-banding due to state/render desync.
    // We now handle this imperatively in the animation loop.
    /*
    useEffect(() => {
        if (followMode && selectedEntity) {
             setViewState(prev => ({
                 ...prev,
                 longitude: selectedEntity.lon,
                 latitude: selectedEntity.lat,
                 transitionDuration: 100, // Smooth small updates
                 transitionEasing: (t: number) => t 
             }));
        }
    }, [followMode, selectedEntity?.lat, selectedEntity?.lon]);
    */

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

        const processEntityUpdate = (updateData: any) => {
               // Handle Decoded Data from Worker
               const entity = updateData.cotEvent; // Based on our proto structure
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

                    // PVB State Update
                    const now = Date.now();
                    const currentDr = drStateRef.current.get(entity.uid);
                    
                    // Capture current visual state as blend origin
                    const visual = visualStateRef.current.get(entity.uid);
                    const blendLat = visual ? visual.lat : newLat;
                    const blendLon = visual ? visual.lon : newLon;

                    // Calculate interval (clamped to avoid jitter from rapid updates)
                    const lastServerTime = currentDr ? currentDr.serverTime : now - 1000;
                    const timeSinceLast = Math.max(now - lastServerTime, 800); // Minimum 800ms
                    
                    // Prepare new DR state
                    drStateRef.current.set(entity.uid, {
                        serverLat: newLat,
                        serverLon: newLon,
                        serverSpeed: entity.detail?.track?.speed || 0,
                        serverCourseRad: ((entity.detail?.track?.course || 0) * Math.PI) / 180,
                        serverTime: now,
                        blendLat,
                        blendLon,
                        blendSpeed: currentDr ? currentDr.serverSpeed : (entity.detail?.track?.speed || 0),
                        blendCourseRad: currentDr ? currentDr.serverCourseRad : ((entity.detail?.track?.course || 0) * Math.PI) / 180,
                        expectedInterval: timeSinceLast
                    });
                    
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
                        uidHash: 0, // Will be set below
                        raw: updateData.raw // Map raw hex from worker
                    });
                    
                    // Pre-compute UID hash for glow animation (once per entity, not per frame)
                    const stored = entitiesRef.current.get(entity.uid)!;
                    if (stored.uidHash == null || stored.uidHash === 0) {
                        stored.uidHash = uidToHash(entity.uid);
                    }
                    
                    // Kinematic Bearing Priority:
                    // Instead of trusting the reported 'course' (which may be magnetic heading,
                    // crabbed due to wind, or a false zero), we calculate the actual Ground Track
                    // from the history trail. This guarantees the Icon and Velocity Vector
                    // align perfectly with the visual line segment.
                    const prevPos = drStateRef.current.get(entity.uid);
                    const rawCourse = entity.detail?.track?.course ?? 0;
                    let computedCourse = rawCourse;
                    
                    // Use the last segment of the trail if available (most accurate visual alignment)
                    if (trail && trail.length >= 2) {
                        const last = trail[trail.length - 1];
                        const prev = trail[trail.length - 2];
                        const dist = getDistanceMeters(prev[1], prev[0], last[1], last[0]);
                        // Only override if the segment is significant (> 2m)
                        if (dist > 2.0) {
                             computedCourse = getBearing(prev[1], prev[0], last[1], last[0]);
                        }
                    } else if (prevPos) {
                        // Fallback to snapshot history if trail is empty
                        const dist = getDistanceMeters(prevPos.serverLat, prevPos.serverLon, newLat, newLon);
                        if (dist > 2.0) {
                            computedCourse = getBearing(prevPos.serverLat, prevPos.serverLon, newLat, newLon);
                        }
                    }

                    // Directly use the computed course. No smoothing (to avoid lag).
                    const smoothedCourse = computedCourse;
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
        };

        worker.onmessage = (event: MessageEvent) => {
            const { type, data, status } = event.data;
            if (type === 'status' && status === 'ready') {
                console.log("Main Thread: TAK Worker Ready");
            }
            if (type === "entity_batch") {
              // Process batched entities
              for (const item of data) {
                processEntityUpdate(item);
              }
              return;
            }
            if (type === 'entity_update') {
               processEntityUpdate(data);
            }
        };

        workerRef.current = worker;
        
        // Robust WebSocket URL selection
        let wsUrl: string;
        if (import.meta.env.VITE_API_URL) {
            const apiBase = import.meta.env.VITE_API_URL.replace('http', 'ws');
            wsUrl = `${apiBase}/api/tracks/live`;
        } else {
            // Default to proxy-friendly relative URL
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            wsUrl = `${protocol}//${window.location.host}/api/tracks/live`;
        }
        
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
            // Combined pass: cleanup, count, and interpolate in a single iteration
            const entities = entitiesRef.current;
            const now = Date.now();
            const dt = Math.min(now - lastFrameTimeRef.current, 100);
            lastFrameTimeRef.current = now;

            const STALE_THRESHOLD_AIR_MS = 120 * 1000;
            const STALE_THRESHOLD_SEA_MS = 300 * 1000;

            let airCount = 0;
            let seaCount = 0;
            const staleUids: string[] = [];
            const interpolated: CoTEntity[] = [];

            if (replayMode) {
                // REPLAY MODE: Render static snapshots from parent
                for (const [, entity] of replayEntitiesRef.current) {
                     const isShip = entity.type?.includes("S");
                     
                     // Filter
                     if (isShip && !filters?.showSea) continue;
                     if (!isShip && !filters?.showAir) continue;
                     
                     if (isShip) seaCount++; else airCount++;

                     interpolated.push(entity);
                }
            } else {
                // LIVE MODE: Interpolate and Smooth
                // const liveUpdate = entitiesRef.current.get(selectedEntity?.uid || '');
                // if (liveUpdate && selectedEntity) {
                     // Check if data changed significantly to avoid react render thrashing?
                     // Actually, for sidebar we want 1Hz or so. 
                     // But strictly, we should just push the latest object up if it's new.
                     // To avoid loop: parent only updates if object ref changes.
                     // But we are creating new object refs on every frame here? No, only on ws message.
                     // So passing the ref from entitiesRef.current is safe!
                // }

                for (const [uid, entity] of entities) {
                    

                  const isShip = entity.type?.includes("S");
                  const threshold = isShip ? STALE_THRESHOLD_SEA_MS : STALE_THRESHOLD_AIR_MS;

                  // Stale check
                  if (now - entity.lastSeen > threshold) {
                    staleUids.push(uid);
                    continue;
                  }

                  // Count
                  if (isShip) {
                    seaCount++;
                  } else {
                    airCount++;
                  }

                  // Filter
                  if (isShip && !filters?.showSea) continue;
                  if (!isShip && !filters?.showAir) continue;

                  // Interpolate
                  // Projective Velocity Blending (PVB)
                  const dr = drStateRef.current.get(uid);
                  
                  let targetLat = entity.lat;
                  let targetLon = entity.lon;

                  if (dr && entity.speed > 0.5) {
                      const timeSinceUpdate = now - dr.serverTime;
                      const alpha = Math.min(Math.max(timeSinceUpdate / dr.expectedInterval, 0), 1);
                      const dtSec = timeSinceUpdate / 1000;

                      // 1. Server Projection (Where it should be now based on latest report)
                      const R = 6371000;
                      const distServer = dr.serverSpeed * dtSec;
                      const dLatServer = (distServer * Math.cos(dr.serverCourseRad)) / R * (180 / Math.PI);
                      const dLonServer = (distServer * Math.sin(dr.serverCourseRad)) / (R * Math.cos(dr.serverLat * Math.PI / 180)) * (180 / Math.PI);
                      
                      const serverProjLat = dr.serverLat + dLatServer;
                      const serverProjLon = dr.serverLon + dLonServer;

                      // 2. Client Projection (Where we were going visually)
                      // Blend the velocities for smooth transition
                      const blendSpeed = dr.blendSpeed + (dr.serverSpeed - dr.blendSpeed) * alpha;
                      
                      // Angle blending (taking shortest path)
                      let dAngle = dr.serverCourseRad - dr.blendCourseRad;
                      while (dAngle <= -Math.PI) dAngle += 2*Math.PI;
                      while (dAngle > Math.PI) dAngle -= 2*Math.PI;
                      const blendCourse = dr.blendCourseRad + dAngle * alpha;

                      const distClient = blendSpeed * dtSec;
                      const dLatClient = (distClient * Math.cos(blendCourse)) / R * (180 / Math.PI);
                      const dLonClient = (distClient * Math.sin(blendCourse)) / (R * Math.cos(dr.blendLat * Math.PI / 180)) * (180 / Math.PI);

                      const clientProjLat = dr.blendLat + dLatClient;
                      const clientProjLon = dr.blendLon + dLonClient;

                      // 3. Final Target (Blend projections)
                      // As alpha -> 1, we rely fully on the server projection
                      targetLat = clientProjLat + (serverProjLat - clientProjLat) * alpha;
                      targetLon = clientProjLon + (serverProjLon - clientProjLon) * alpha;
                  }

                  let visual = visualStateRef.current.get(uid);
                  if (!visual) {
                    // Initialize immediately to prevent startup delay
                    visual = { lat: targetLat, lon: targetLon, alt: entity.altitude };
                    visualStateRef.current.set(uid, visual);
                  } else {
                    const speedKts = entity.speed * 1.94384;
                    // PVB handles smoothness, just filter micro-jitter
                    const BASE_ALPHA = 0.25;
                    const smoothFactor = 1 - Math.pow(1 - BASE_ALPHA, dt / 16.67);
                    visual.lat = visual.lat + (targetLat - visual.lat) * smoothFactor;
                    visual.lon = visual.lon + (targetLon - visual.lon) * smoothFactor;
                    visual.alt = visual.alt + (entity.altitude - visual.alt) * smoothFactor;
                  }
                  
                  // Clamp to target if very close (prevent micro-jitter)
                  if (Math.abs(visual.lat - targetLat) < 0.000001 && Math.abs(visual.lon - targetLon) < 0.000001) {
                      visual.lat = targetLat;
                      visual.lon = targetLon;
                  }
                  
                  visualStateRef.current.set(uid, visual);

                  const interpolatedEntity: CoTEntity = {
                    ...entity,
                    lon: visual.lon,
                    lat: visual.lat,
                    altitude: visual.alt,
                  };

                  interpolated.push(interpolatedEntity);

                  // Update Selected Entity Data (Live Sidebar) - Sync with interpolation
                  // This ensures the numbers in the sidebar move in perfect lockstep with the map
                  const currentSelected = selectedEntityRef.current;
                  if (currentSelected && uid === currentSelected.uid && onEntitySelect) {
                      // Throttle to ~30Hz (every 2nd frame) to prevent React render saturation
                      // while providing silky smooth numerical updates.
                      if (Math.floor(now / 33) % 2 === 0) {
                          onEntitySelect(interpolatedEntity);
                      }
                  }
                }
            }

            // FOLLOW MODE: Imperative Sync in Animation Loop (Post-Interpolation)
            // This ensures the camera moves EXACTLY with the interpolated selection
            // Preventing "rubber banding" or jitter.
            // Executed ONCE per frame, not per entity.
            // FOLLOW MODE: Imperative Sync in Animation Loop (Post-Interpolation)
            // This ensures the camera moves EXACTLY with the interpolated selection
            // Preventing "rubber banding" or jitter.
            // Executed ONCE per frame, not per entity.
            const currentSelected = selectedEntityRef.current;
            if (followModeRef.current && currentSelected && mapRef.current) {
                const visual = visualStateRef.current.get(currentSelected.uid);
                if (visual) {
                    try {
                        const map = mapRef.current.getMap();
                        
                        // Use unified compensation helper
                        const [centerLon, centerLat] = getCompensatedCenter(visual.lat, visual.lon, visual.alt, map);

                        // Use a more lenient movement check:
                        // Only block jump if the user is explicitly manipulating the view (rot/zoom/drag)
                        // This prevents fighting user input without blocking the follow logic.
                        const isUserInteracting = map.dragPan.isActive() || 
                                                map.scrollZoom.isActive() || 
                                                map.touchZoomRotate.isActive() || 
                                                map.dragRotate.isActive();
                        
                        if (!isUserInteracting && !map.isEasing()) {
                            map.jumpTo({ 
                                center: [centerLon, centerLat],
                                animate: false 
                            });
                        }
                    } catch (e) {
                        // Map instance might not be ready
                    }
                }
            }

            // Deferred stale cleanup (don't delete during iteration)
            for (const uid of staleUids) {
              const entity = entities.get(uid);
              if (entity) {
                const isShip = entity.type?.includes("S");
                onEvent?.({
                  type: "lost",
                  message: `${isShip ? "🚢" : "✈️"} ${entity.callsign}`,
                  entityType: isShip ? "sea" : "air",
                });
              }
              entities.delete(uid);
              knownUidsRef.current.delete(uid);
              prevCourseRef.current.delete(uid);
              drStateRef.current.delete(uid);
              visualStateRef.current.delete(uid);
            }

            if (countsRef.current.air !== airCount || countsRef.current.sea !== seaCount) {
              countsRef.current = { air: airCount, sea: seaCount };
              onCountsUpdate?.({ air: airCount, sea: seaCount });
            }
            
            // 4. Update Layers


            const layers = [
                // 1. All History Trails (Global Toggle)
                ...(historyTailsRef.current ? [
                    new PathLayer({
                        id: 'all-history-trails',
                        data: interpolated.filter(e => e.trail.length >= 2),
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        getPath: (d: any) => {
                            // Sync tail with head: Replace last point with current interpolated position
                            // so the line connects perfectly to the icon.
                            if (!d.trail || d.trail.length === 0) return [];
                            // Convert standard trail points to [lon, lat, alt]
                            const cleanTrail = d.trail.map((p: any) => [p[0], p[1], p[2]]);
                            // Append current visual head
                            return [...cleanTrail.slice(0, -1), [d.lon, d.lat, d.altitude]];
                        },
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        getColor: (d: any) => {
                            const isShip = d.type.includes('S');
                            // Bumping alpha from 100 -> 180 for better visibility
                            return isShip
                                ? speedToColor(d.speed, 180)
                                : altitudeToColor(d.altitude, 180);
                        },
                        getWidth: 2.5,
                        widthMinPixels: 1.5,
                        pickable: false,
                        jointRounded: true,
                        capRounded: true,
                        opacity: 0.8,
                    })
                ] : []),

                // 2. Selected Entity Highlight Trail
                ...(currentSelected && interpolated.find(e => e.uid === currentSelected.uid)
                    ? (() => {
                        const entity = interpolated.find(e => e.uid === currentSelected.uid)!;
                        if (!entity.trail || entity.trail.length < 2) return [];
                        
                        // Sync tail with head for highlight too
                        const cleanTrail = entity.trail.map(p => [p[0], p[1], p[2]]);
                        const trailPath = [...cleanTrail.slice(0, -1), [entity.lon, entity.lat, entity.altitude]];

                        const isShip = entity.type.includes('S');
                        const trailColor = isShip
                            ? speedToColor(entity.speed, 255)
                            : altitudeToColor(entity.altitude, 255);

                        return [new PathLayer({
                            id: `selected-trail-${currentSelected.uid}`,
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

                // 3. Altitude Stems (leader lines to ground) - 3D Mode only
                ...(enable3d ? [
                    new LineLayer({
                        id: 'altitude-stems',
                        data: interpolated.filter(e => e.altitude > 10), // Only for airborne
                        getSourcePosition: (d: CoTEntity) => [d.lon, d.lat, 0],
                        getTargetPosition: (d: CoTEntity) => [d.lon, d.lat, d.altitude],
                        getColor: (d: CoTEntity) => entityColor(d, 80), // Faint line
                        getWidth: 1,
                        widthMinPixels: 0.5,
                        pickable: false,
                    }),
                    new ScatterplotLayer({
                        id: 'ground-shadows',
                        data: interpolated.filter(e => e.altitude > 10),
                        getPosition: (d: CoTEntity) => [d.lon, d.lat, 0],
                        getRadius: 2,
                        radiusUnits: 'pixels' as const,
                        getFillColor: (d: CoTEntity) => entityColor(d, 150),
                        pickable: false,
                    })
                ] : []),

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
                    getPosition: (d: any) => [d.lon, d.lat, (d.altitude || 0) + 2], // 2m offset to prevent ground clipping
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    getSize: (d: any) => {
                        const isSelected = currentSelected?.uid === d.uid;
                        const isVessel = d.type.includes('S');
                        // Bumping marine size from 24 -> 32 to match aircraft prominence
                        const baseSize = isVessel ? 32 : 32;
                        return isSelected ? baseSize * 1.3 : baseSize;
                    },
                    sizeUnits: 'pixels' as const,
                    billboard: false, 
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    getAngle: (d: any) => -(d.course || 0), // Negate course because DeckGL rotates CCW, Compass is CW
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
                        getSize: [currentSelected?.uid],
                        getAngle: [now], // Only update on data change, not view bearing
                    }
                }),

                new ScatterplotLayer({
                    id: 'entity-glow',
                    data: interpolated,
                    getPosition: (d: CoTEntity) => [d.lon, d.lat, d.altitude || 0],
                    getRadius: (d: CoTEntity) => {
                        const isSelected = currentSelected?.uid === d.uid;
                        const pulse = (Math.sin((now + d.uidHash) / 600) + 1) / 2;
                        const base = isSelected ? 20 : 6;
                        return base * (1 + (pulse * 0.1));
                    },
                    radiusUnits: 'pixels' as const,
                    getFillColor: (d: CoTEntity) => {
                        const isSelected = currentSelected?.uid === d.uid;
                        const pulse = (Math.sin((now + d.uidHash) / 600) + 1) / 2;
                        const baseAlpha = isSelected ? 60 : 10;
                        const a = baseAlpha * (0.8 + pulse * 0.2);
                        return entityColor(d, a);
                    },
                    pickable: false,
                    updateTriggers: { getRadius: [now], getFillColor: [now] }
                }),

                ...(currentSelected ? [
                    new ScatterplotLayer({
                        id: `selection-ring-${currentSelected.uid}`,
                        data: interpolated.filter(e => e.uid === currentSelected.uid),
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
                            return entityColor(currentSelected, alpha);
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

            if (mapLoaded && overlayRef.current?.setProps) {
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
    }, [onCountsUpdate, filters, onEvent, onEntitySelect, mapLoaded, enable3d, mapToken, mapStyle, replayMode]);



    // View & Camera Handlers
    const setViewMode = (mode: '2d' | '3d') => {
        if (!mapRef.current) return;
        if (mode === '2d') {
            setEnable3d(false);
            mapRef.current.flyTo({
                pitch: 0,
                bearing: 0,
                duration: 1500,
                easing: (t: number) => 1 - Math.pow(1 - t, 3),
            });
        } else {
            setEnable3d(true);
            mapRef.current.flyTo({
                pitch: 50,
                bearing: 0,
                duration: 2000,
                easing: (t: number) => 1 - Math.pow(1 - t, 3),
            });
        }
    };

    const handleAdjustCamera = (type: 'pitch' | 'bearing', delta: number) => {
        const map = mapRef.current?.getMap();
        if (!map) return;

        if (type === 'pitch') {
            const currentPitch = map.getPitch();
            const newPitch = Math.max(0, Math.min(85, currentPitch + delta));
            map.easeTo({ pitch: newPitch, duration: 300 });
        } else if (type === 'bearing') {
            const currentBearing = map.getBearing();
            map.easeTo({ bearing: currentBearing + delta, duration: 300 });
        }
    };

    const handleResetCompass = () => {
        mapRef.current?.getMap().easeTo({ bearing: 0, duration: 1000 });
    };

    const handleSaveLocation = useCallback((lat: number, lon: number) => {
        setSaveFormCoords({ lat, lon });
        setShowSaveForm(true);
        setContextMenuPos(null);
    }, []);

    const handleSaveFormSubmit = useCallback((name: string, radius: number) => {
        if (!saveFormCoords) return;
        saveMission({ 
            name, 
            lat: saveFormCoords.lat, 
            lon: saveFormCoords.lon, 
            radius_nm: radius 
        });
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

        await handleSetFocus(defaultLat, defaultLon, defaultRadius);
    }, [handleSetFocus]);

    const handleOverlayLoaded = useCallback((overlay: MapboxOverlay) => {
        overlayRef.current = overlay;
    }, []);

    const handleMapLoad = useCallback(() => {
        if (mapLoaded) return;
        const map = mapRef.current?.getMap();
        if (!map) return;
        console.log("[TacticalMap] Map Loaded Successfully");
        setMapLoaded(true);
    }, [mapLoaded]);


    // Imperative Layer Management (AOT Lines)
    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!mapLoaded || !map || !aotShapes) return;

        const updateAotLayers = () => {
            if (!map.isStyleLoaded()) return;

            // Maritime AOT
            const showSea = filters?.showSea ?? true;
            if (showSea && aotShapes.maritime.length > 0) {
                if (!map.getSource('aot-maritime')) {
                    map.addSource('aot-maritime', {
                        type: 'geojson',
                        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: aotShapes.maritime }, properties: {} }
                    });
                    map.addLayer({
                        id: 'aot-maritime-glow',
                        type: 'line',
                        source: 'aot-maritime',
                        slot: 'top',
                        paint: { 'line-color': '#00BFFF', 'line-width': 4, 'line-opacity': 0.4, 'line-blur': 2 }
                    });
                    map.addLayer({
                        id: 'aot-maritime-line',
                        type: 'line',
                        source: 'aot-maritime',
                        slot: 'top',
                        paint: { 'line-color': '#00BFFF', 'line-width': 2, 'line-opacity': 0.6 }
                    });
                } else {
                    (map.getSource('aot-maritime') as any).setData({
                        type: 'Feature',
                        geometry: { type: 'LineString', coordinates: aotShapes.maritime },
                        properties: {}
                    });
                }
            } else {
                if (map.getLayer('aot-maritime-glow')) map.removeLayer('aot-maritime-glow');
                if (map.getLayer('aot-maritime-line')) map.removeLayer('aot-maritime-line');
                if (map.getSource('aot-maritime')) map.removeSource('aot-maritime');
            }

            // Aviation AOT
            const showAir = filters?.showAir ?? true;
            if (showAir && aotShapes.aviation.length > 0) {
                if (!map.getSource('aot-aviation')) {
                    map.addSource('aot-aviation', {
                        type: 'geojson',
                        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: aotShapes.aviation }, properties: {} }
                    });
                    map.addLayer({
                        id: 'aot-aviation-glow',
                        type: 'line',
                        source: 'aot-aviation',
                        slot: 'top',
                        paint: { 'line-color': '#00FF64', 'line-width': 4, 'line-opacity': 0.4, 'line-blur': 2 }
                    });
                    map.addLayer({
                        id: 'aot-aviation-line',
                        type: 'line',
                        source: 'aot-aviation',
                        slot: 'top',
                        paint: { 'line-color': '#00FF64', 'line-width': 2, 'line-opacity': 0.6 }
                    });
                } else {
                    (map.getSource('aot-aviation') as any).setData({
                        type: 'Feature',
                        geometry: { type: 'LineString', coordinates: aotShapes.aviation },
                        properties: {}
                    });
                }
            } else {
                if (map.getLayer('aot-aviation-glow')) map.removeLayer('aot-aviation-glow');
                if (map.getLayer('aot-aviation-line')) map.removeLayer('aot-aviation-line');
                if (map.getSource('aot-aviation')) map.removeSource('aot-aviation');
            }
        };

        updateAotLayers();
        map.on('style.load', updateAotLayers);
        return () => { map.off('style.load', updateAotLayers); };
    }, [mapLoaded, aotShapes, filters?.showSea, filters?.showAir]);

    // Dedicated 3D visuals Effect
    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!mapLoaded || !map) return;

        const sync3D = () => {
             const isMapbox = !!mapToken;

             if (enable3d) {
                 // 1. Terrain - Mapbox Only (URL is Mapbox-exclusive)
                 if (isMapbox) {
                     if (!map.getSource("mapbox-dem")) {
                         map.addSource("mapbox-dem", {
                             type: "raster-dem",
                             url: "mapbox://mapbox.mapbox-terrain-dem-v1",
                             tileSize: 512,
                             maxzoom: 14,
                         });
                     }
                     try {
                         map.setTerrain({ source: "mapbox-dem", exaggeration: 2.0 });
                     } catch (e) {
                         console.warn("[TacticalMap] Failed to set terrain:", e);
                     }
                 }

                 // 2. Fog - Mapbox GL v2+ Only
                 if (isMapbox && map.setFog) {
                     try {
                       map.setFog({
                           range: [0.5, 10],
                           color: "rgba(10, 15, 25, 1)",
                           "high-color": "rgba(20, 30, 50, 1)",
                           "space-color": "rgba(5, 5, 15, 1)",
                           "horizon-blend": 0.1,
                       });
                     } catch (e) {
                       console.warn("[TacticalMap] Failed to set fog:", e);
                     }
                 }

                 // 3. Sky - Mapbox GL v2+ Only
                 if (isMapbox && !map.getLayer('sky') && map.getStyle().layers.every((l: any) => l.type !== 'sky')) {
                     try {
                         map.addLayer({ 
                            id: 'sky', 
                            type: 'sky', 
                            paint: { 'sky-type': 'atmosphere', 'sky-atmosphere-sun': [0.0, 0.0], 'sky-atmosphere-sun-intensity': 15 }
                         });
                     } catch (e) {
                         console.debug("[TacticalMap] Sky layer not supported by this engine.");
                     }
                 }
             } else {
                 if (map.getTerrain?.()) map.setTerrain(null);
                 if (map.setFog) map.setFog(null);
                 if (map.getLayer('sky')) map.removeLayer('sky');
             }
        };

        if (map.isStyleLoaded()) sync3D();
        else map.on('style.load', sync3D);
        return () => { map.off('style.load', sync3D); };
    }, [mapLoaded, enable3d, mapToken]);
    
    // Check if map actions are ready and expose them
    useEffect(() => {
        if (mapLoaded && mapRef.current && onMapActionsReady) {
            onMapActionsReady({
                flyTo: (lat, lon, zoom) => {
                    const map = mapRef.current?.getMap();
                    if (map) {
                        // Intelligent Zoom: Maintain current if reasonable, otherwise snap to tactical default
                        const currentZoom = map.getZoom();
                        let targetZoom = zoom;
                        
                        if (!targetZoom) {
                            // Expand range to include zoom 12
                            if (currentZoom >= 12 && currentZoom <= 18) {
                                targetZoom = currentZoom; // Maintain user perspective
                            } else {
                                targetZoom = 12; // Use new tactical default
                            }
                        }

                        // Apply compensation even for the initial flyTo if selection is known 
                        const selected = selectedEntityRef.current;
                        const [cLon, cLat] = (selected && selected.lat === lat && selected.lon === lon)
                            ? getCompensatedCenter(lat, lon, selected.altitude, map)
                            : [lon, lat];

                        map.flyTo({ center: [cLon, cLat], zoom: targetZoom, duration: 1000 });
                    }
                },
                fitBounds: (bounds) => {
                   mapRef.current?.fitBounds(bounds, { padding: 50 });
                },
                searchLocal: (query: string) => {
                    const results: CoTEntity[] = [];
                    const q = query.toLowerCase();
                    entitiesRef.current.forEach((e: CoTEntity) => {
                        if (e.callsign.toLowerCase().includes(q) || e.uid.toLowerCase().includes(q)) {
                            results.push(e);
                        }
                    });
                    return results;
                }
            });
        }
    }, [mapLoaded, onMapActionsReady]);

    return (
    <>
        <GLMap
            ref={mapRef}
            onLoad={handleMapLoad}
            {...viewState}
            onMove={(evt: any) => {
                // If user interacts (drags/pans), disable Follow Mode to prevent fighting.
                if (evt.originalEvent && followModeRef.current && onFollowModeChange) {
                    followModeRef.current = false; // Instant kill before next frame
                    onFollowModeChange(false);
                }
                setViewState(evt.viewState as any);
            }}
            mapStyle={mapStyle}
            mapboxAccessToken={mapToken}
            config={{
                basemap: {
                    lightPreset: 'night',
                    theme: 'monochrome',
                    showPointOfInterestLabels: false,
                    showRoadLabels: false,
                    showPedestrianRoads: false,
                    showPlaceLabels: true,
                    showTransitLabels: true
                }
            }}
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
                id="tactical-overlay"
                interleaved={false} 
                onOverlayLoaded={handleOverlayLoaded}
            />

        </GLMap>
            
        {/* View Controls */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 z-[100] pointer-events-auto">
            <div className="flex gap-2 bg-black/40 backdrop-blur-md p-1.5 rounded-lg border border-white/5 shadow-2xl">
                <button 
                    onClick={() => setViewMode('2d')}
                    className={`p-2 rounded transition-all active:scale-95 flex flex-col items-center justify-center w-10 h-10 border ${!enable3d ? 'bg-cyan-500/20 border-cyan-400 text-cyan-400 font-bold' : 'bg-transparent border-white/10 text-white/50 hover:text-white'}`}
                    title="Top Down (2D)"
                >
                    <span className="text-[10px] uppercase font-mono tracking-tighter">2D</span>
                </button>
                <button 
                    onClick={() => setViewMode('3d')}
                    className={`p-2 rounded transition-all active:scale-95 flex flex-col items-center justify-center w-10 h-10 border ${enable3d ? 'bg-cyan-500/20 border-cyan-400 text-cyan-400 font-bold' : 'bg-transparent border-white/10 text-white/50 hover:text-white'}`}
                    title="Perspective (3D)"
                >
                    <span className="text-[10px] uppercase font-mono tracking-tighter">3D</span>
                </button>
            </div>

            {enable3d && (
                <>
                    <div className="flex gap-2 bg-black/40 backdrop-blur-md p-1.5 rounded-lg border border-white/5 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <button onClick={() => handleAdjustCamera('bearing', -45)}
                            className="p-2 rounded bg-transparent border border-white/10 text-white/50 hover:text-white transition-all active:scale-95 w-10 h-10 flex items-center justify-center"
                            title="Rotate Left"><span className="text-xl leading-none">↺</span></button>
                        <button onClick={handleResetCompass}
                            className="p-2 rounded bg-transparent border border-white/10 text-white/50 hover:text-cyan-400 transition-all active:scale-95 w-10 h-10 flex items-center justify-center font-mono font-bold text-lg"
                            title="Reset to North">N</button>
                        <button onClick={() => handleAdjustCamera('bearing', 45)}
                            className="p-2 rounded bg-transparent border border-white/10 text-white/50 hover:text-white transition-all active:scale-95 w-10 h-10 flex items-center justify-center"
                            title="Rotate Right"><span className="text-xl leading-none">↻</span></button>
                    </div>

                    <div className="flex gap-2 bg-black/40 backdrop-blur-md p-1.5 rounded-lg border border-white/5 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <button onClick={() => handleAdjustCamera('pitch', 15)}
                            className="p-2 rounded bg-transparent border border-white/10 text-white/50 hover:text-white transition-all active:scale-95 w-10 h-10 flex items-center justify-center"
                            title="Tilt Down"><span className="text-xl leading-none">↑</span></button>
                        <button onClick={() => handleAdjustCamera('pitch', -15)}
                            className="p-2 rounded bg-transparent border border-white/10 text-white/50 hover:text-white transition-all active:scale-95 w-10 h-10 flex items-center justify-center"
                            title="Tilt Up"><span className="text-xl leading-none">↓</span></button>
                    </div>
                </>
            )}
        </div>
        
        <MapContextMenu
            position={contextMenuPos}
            coordinates={contextMenuCoords}
            onSetFocus={handleSetFocus}
            onSaveLocation={handleSaveLocation}
            onReturnHome={handleReturnHome}
            onClose={() => { setContextMenuPos(null); setContextMenuCoords(null); }}
        />
        
        {showSaveForm && (
            <SaveLocationForm
                coordinates={saveFormCoords}
                onSave={handleSaveFormSubmit}
                onCancel={handleSaveFormCancel}
            />
        )}
        
        {hoveredEntity && hoverPosition && (
            <MapTooltip entity={hoveredEntity} position={hoverPosition} />
        )}
        
        <AltitudeLegend visible={filters?.showAir ?? true} />
        <SpeedLegend visible={filters?.showSea ?? true} />
    </>
    );
}

export default TacticalMap;

