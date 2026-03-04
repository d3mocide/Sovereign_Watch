import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  lazy,
  Suspense,
  MutableRefObject,
} from "react";
import { Globe, Plus, Minus } from "lucide-react";
import type { MapRef } from "react-map-gl/maplibre";
import { MapboxOverlay } from "@deck.gl/mapbox";
import "maplibre-gl/dist/maplibre-gl.css";
import "mapbox-gl/dist/mapbox-gl.css";
import { CoTEntity, JS8Station, MissionProps, RepeaterStation } from "../../types";
import { MapTooltip } from "./MapTooltip";
import { useEntityWorker } from "../../hooks/useEntityWorker";
import { useAnimationLoop } from "../../hooks/useAnimationLoop";
import { useMissionArea } from "../../hooks/useMissionArea";
import { useMapCamera } from "../../hooks/useMapCamera";
import { getCompensatedCenter } from "../../utils/map/geoUtils";
import { useInfraData } from "../../hooks/useInfraData";

// Pick the map adapter at module init time based on the build-time env var.
// react-map-gl v8 bakes the GL library into the entry point, so we lazy-load
// the correct adapter rather than using the removed `mapLib` prop.
const _mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
const _enableMapbox = import.meta.env.VITE_ENABLE_MAPBOX !== 'false';
const _isValidToken = !!_mapboxToken && _mapboxToken.startsWith('pk.');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MapComponent: React.ComponentType<any> = (_enableMapbox && _isValidToken)
  ? lazy(() => import("./MapboxAdapter"))
  : lazy(() => import("./MapLibreAdapter"));

// DeckGLOverlay is defined inside each map adapter (MapLibreAdapter / MapboxAdapter)
// so that useControl is always called within the correct react-map-gl endpoint context.

// Props for TacticalMap
interface TacticalMapProps {
  onCountsUpdate?: (counts: { air: number; sea: number; orbital: number }) => void;
  filters?: {
    showAir: boolean;
    showSea: boolean;
    showHelicopter?: boolean;
    showMilitary?: boolean;
    showGovernment?: boolean;
    showCommercial?: boolean;
    showPrivate?: boolean;
    showDrone?: boolean;
    showCargo?: boolean;
    showTanker?: boolean;
    showPassenger?: boolean;
    showFishing?: boolean;
    showSeaMilitary?: boolean;
    showLawEnforcement?: boolean;
    showSar?: boolean;
    showTug?: boolean;
    showPleasure?: boolean;
    showHsc?: boolean;
    showPilot?: boolean;
    showSpecial?: boolean;
    [key: string]: boolean | undefined;
  };
  onEvent?: (event: {
    type: "new" | "lost" | "alert";
    message: string;
    entityType?: "air" | "sea" | "orbital" | "infra";
    classification?: import("../../types").EntityClassification;
  }) => void;
  selectedEntity: CoTEntity | null;
  onEntitySelect: (entity: CoTEntity | null) => void;
  onMissionPropsReady?: (props: MissionProps) => void;
  onMapActionsReady?: (actions: import("../../types").MapActions) => void;
  showVelocityVectors?: boolean;
  showHistoryTails?: boolean;
  globeMode?: boolean;
  onToggleGlobe?: () => void; // Added prop for Globe toggle
  replayMode?: boolean;
  replayEntities?: Map<string, CoTEntity>;
  followMode?: boolean;
  onFollowModeChange?: (enabled: boolean) => void;
  onEntityLiveUpdate?: (entity: CoTEntity) => void;
  js8StationsRef?: MutableRefObject<Map<string, JS8Station>>;
  ownGridRef?: MutableRefObject<string>;
  repeatersRef?: MutableRefObject<RepeaterStation[]>;
  showRepeaters?: boolean;
  repeatersLoading?: boolean;
}

export function OrbitalMap({
  onCountsUpdate,
  filters,
  onEvent,
  selectedEntity,
  onEntitySelect,
  onMissionPropsReady,
  onMapActionsReady,
  showVelocityVectors,
  showHistoryTails,
  globeMode,
  onToggleGlobe,
  replayMode,
  replayEntities,
  followMode,
  onFollowModeChange,
  onEntityLiveUpdate,
  js8StationsRef,
  ownGridRef,
  repeatersRef,
  showRepeaters,
  repeatersLoading,
}: TacticalMapProps) {
  // Fetch infra data (Submarine cables & landing stations)
  const { cablesData, stationsData } = useInfraData();

  // State for UI interactions
  const [hoveredEntity, setHoveredEntity] = useState<CoTEntity | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [hoveredInfra, setHoveredInfraState] = useState<any>(null);
  const handleHoveredInfra = useCallback((info: any) => {
    const obj = info?.object || null;
    setHoveredInfraState(obj);
    if (obj) {
      const props = obj.properties || {};
      const lat = obj.geometry.type === 'Point' ? obj.geometry.coordinates[1] : obj.geometry.coordinates[0][1];
      const lon = obj.geometry.type === 'Point' ? obj.geometry.coordinates[0] : obj.geometry.coordinates[0][0];

      const entity: CoTEntity = {
        uid: props.id || String(obj.id),
        type: 'infra',
        callsign: props.name || 'Unknown Infra',
        lat,
        lon,
        altitude: 0,
        course: 0,
        speed: 0,
        lastSeen: Date.now(),
        uidHash: 0,
        trail: [],
        detail: obj
      };
      setHoveredEntity(entity);
      setHoverPosition({ x: info.x, y: info.y });
    } else {
      // Clear tooltip only if current hovered item is infra
      setHoveredEntity(prev => (prev?.type === 'infra' ? null : prev));
    }
  }, []);

  // Map & Style States
  const [mapLoaded, setMapLoaded] = useState(false);
  const [enable3d, setEnable3d] = useState(false);
  const mapToken = _enableMapbox && _isValidToken ? _mapboxToken : undefined;
  const mapStyle = mapToken
    ? "mapbox://styles/mapbox/standard"
    : "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

  const mapRef = useRef<MapRef>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  // Stores raw MapLibre GL map from onLoad event.target (bypasses react-map-gl wrapping)
  const mapInstanceRef = useRef<any>(null);

  // Environment Fallbacks
  const envLat = import.meta.env.VITE_CENTER_LAT;
  const envLon = import.meta.env.VITE_CENTER_LON;
  const initialLat = envLat ? parseFloat(envLat) : 45.5152;
  const initialLon = envLon ? parseFloat(envLon) : -122.6784;
  const initialZoom = 2.5;

  // View State (Controlled for bearing tracking)
  const [viewState, setViewState] = useState({
    latitude: initialLat,
    longitude: initialLon,
    zoom: initialZoom,
    pitch: enable3d ? 50 : 0,
    bearing: 0,
  });

  // Refs for transient state
  // Store previously active filters and notification states for Detecting transitions
  const infraNotifiedRef = useRef<{
    showCables?: boolean;
    showRepeaters?: boolean;
    showLandingStations?: boolean;
    notifiedCables?: boolean;
    notifiedRepeaters?: boolean;
    notifiedLandingStations?: boolean;
  }>({
    showCables: false,
    showRepeaters: false,
    showLandingStations: false,
    notifiedCables: false,
    notifiedRepeaters: false,
    notifiedLandingStations: false,
  });

  useEffect(() => {
    const prevCables = infraNotifiedRef.current?.showCables;
    const currCables = filters?.showCables !== false;
    const prevLanding = infraNotifiedRef.current?.showLandingStations;
    const currLanding = !!filters?.showLandingStations;
    const prevRepeaters = infraNotifiedRef.current?.showRepeaters;
    const currRepeaters = !!showRepeaters;

    // 1. Submarine Cables Trigger
    if (currCables) {
      if (!infraNotifiedRef.current.notifiedCables && cablesData) {
        const cableCount = cablesData.features?.length || 0;
        onEvent?.({
          message: `INFRA: ${cableCount} global undersea cable systems synchronized`,
          type: "new",
          entityType: "infra",
        });
        infraNotifiedRef.current.notifiedCables = true;
      }
    } else {
      if (prevCables === true) {
        onEvent?.({
          message: "INFRA: Undersea cable infrastructure data stream terminated",
          type: "lost",
          entityType: "infra",
        });
      }
      infraNotifiedRef.current.notifiedCables = false;
    }

    // 2. Landing Stations Trigger (Independent)
    if (currLanding) {
      if (!infraNotifiedRef.current.notifiedLandingStations && stationsData) {
        const stationCount = stationsData.features?.length || 0;
        onEvent?.({
          message: `INFRA: ${stationCount} international landing points active`,
          type: "new",
          entityType: "infra",
        });
        infraNotifiedRef.current.notifiedLandingStations = true;
      }
    } else {
      if (prevLanding === true) {
        onEvent?.({
          message: "INFRA: Landing point precision tracking offline",
          type: "lost",
          entityType: "infra",
        });
      }
      infraNotifiedRef.current.notifiedLandingStations = false;
    }

    // 3. RF Repeaters Trigger
    if (currRepeaters) {
      const dataReady = repeatersRef?.current && repeatersRef.current.length > 0;
      const loadFinished = !repeatersLoading;

      // Notify if:
      // 1. Data is ready (non-zero count)
      // 2. OR loading has explicitly finished AFTER we already transitioned showRepeaters to true
      // This prevents the "0 repeaters" flash during the initial frame of a toggle.
      if (!infraNotifiedRef.current.notifiedRepeaters) {
        if (dataReady || (loadFinished && infraNotifiedRef.current.showRepeaters === true)) {
          const count = repeatersRef?.current?.length || 0;
          onEvent?.({
            message: `RF_NET: ${count} amateur radio repeaters active in regional sector`,
            type: "new",
            entityType: "infra",
          });
          infraNotifiedRef.current.notifiedRepeaters = true;
        }
      }
    } else {
      if (prevRepeaters === true) {
        onEvent?.({
          message: "RF_NET: Local repeater network visualization offline",
          type: "lost",
          entityType: "infra",
        });
      }
      infraNotifiedRef.current.notifiedRepeaters = false;
    }

    infraNotifiedRef.current.showCables = currCables;
    infraNotifiedRef.current.showLandingStations = currLanding;
    infraNotifiedRef.current.showRepeaters = currRepeaters;
  }, [filters?.showCables, filters?.showLandingStations, showRepeaters, cablesData, stationsData, onEvent, repeatersRef, repeatersLoading]);

  const countsRef = useRef({ air: 0, sea: 0, orbital: 0 });
  const currentMissionRef = useRef<{
    lat: number;
    lon: number;
    radius_nm: number;
  } | null>(null);

  // Velocity Vector Toggle - use ref for reactivity in animation loop
  const velocityVectorsRef = useRef(showVelocityVectors ?? false);
  const historyTailsRef = useRef(showHistoryTails ?? true); // Default to true as per user preference
  const replayEntitiesRef = useRef<Map<string, CoTEntity>>(new Map());
  const followModeRef = useRef(followMode ?? false);
  const lastFollowEnableRef = useRef<number>(0);
  const selectedEntityRef = useRef<CoTEntity | null>(selectedEntity);

  // Sync followMode ref
  useEffect(() => {
    if (followMode && !followModeRef.current) {
      lastFollowEnableRef.current = Date.now();
    }
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

  // Initialization Sync: Reset map state on projection toggle
  // This ensures that when the "Nuclear Remount" happens, all effects re-synchronize
  // correctly with the fresh map instance.
  useEffect(() => {
    setMapLoaded(false);
    mapInstanceRef.current = null;
    overlayRef.current = null;
  }, [globeMode]);

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

  // Entity Worker: TAK worker lifecycle, WebSocket, entity processing
  const { entitiesRef, satellitesRef, knownUidsRef, drStateRef, visualStateRef, prevCourseRef } =
    useEntityWorker({ onEvent, currentMissionRef });

  // Mission Area: mission state, AOT geometry, entity clearing, save form
  // currentMission/savedMissions/saveMission/deleteMission/handleSwitchMission/handlePresetSelect
  // are consumed internally by useMissionArea (passed to onMissionPropsReady) — not needed here.
  const {
    aotShapes,
  } = useMissionArea({
    mapRef,
    currentMissionRef,
    entitiesRef,
    knownUidsRef,
    prevCourseRef,
    drStateRef,
    visualStateRef,
    countsRef,
    onCountsUpdate,
    onEntitySelect,
    onMissionPropsReady,
    initialLat,
    initialLon,
  });

  // Animation Loop
  useAnimationLoop({
    entitiesRef,
    satellitesRef,
    knownUidsRef,
    drStateRef,
    visualStateRef,
    prevCourseRef,
    countsRef,
    currentMissionRef,
    selectedEntityRef,
    followModeRef,
    lastFollowEnableRef,
    velocityVectorsRef,
    historyTailsRef,
    replayEntitiesRef,
    mapRef,
    overlayRef,
    hoveredEntity,
    setHoveredEntity,
    setHoverPosition,
    aotShapes,
    selectedEntity,
    filters,
    cablesData: cablesData,
    stationsData: stationsData,
    setHoveredInfra: handleHoveredInfra,
    setSelectedInfra: (info: any) => {
      if (!info || !info.object) return;

      const infraEntity: CoTEntity = {
        uid: String(info.object.properties?.id || `infra-${Date.now()}`),
        lat: info.coordinate?.[1] || 0,
        lon: info.coordinate?.[0] || 0,
        altitude: 0,
        type: 'infra',
        course: 0,
        speed: 0,
        callsign: String(info.object.properties?.name || 'INFRA'),
        lastSeen: Date.now(),
        trail: [],
        uidHash: 0,
        detail: info.object
      };
      onEntitySelect(infraEntity);
    },
    globeMode,
    enable3d,
    mapToken: mapToken || "",
    mapStyle: mapStyle || "",
    mapLoaded,
    replayMode,
    onCountsUpdate,
    onEvent,
    onEntitySelect,
    onEntityLiveUpdate,
    onFollowModeChange,
    js8StationsRef,
    ownGridRef,
    repeatersRef,
    showRepeaters,
  });

  // Map Camera: projection, graticule, 3D terrain/fog
  const { setViewMode } = useMapCamera({
    mapRef,
    mapInstanceRef,
    mapLoaded,
    globeMode,
    enable3d,
    setEnable3d,
    mapToken: mapToken || "",
  });



  const handleOverlayLoaded = useCallback((overlay: MapboxOverlay) => {
    overlayRef.current = overlay;
  }, []);

  const handleMapLoad = useCallback(
    (evt?: any) => {
      // evt.target = react-map-gl Map WRAPPER — must call .getMap() for the raw MapLibre GL instance
      if (evt?.target) {
        mapInstanceRef.current =
          typeof evt.target.getMap === "function"
            ? evt.target.getMap()
            : evt.target;
      }
      setMapLoaded(true);
    },
    [],
  );

  // Expose mission management to parent via onMissionPropsReady (handled inside useMissionArea)

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
            const [cLon, cLat] =
              selected && selected.lat === lat && selected.lon === lon
                ? getCompensatedCenter(lat, lon, selected.altitude, map)
                : [lon, lat];

            map.flyTo({
              center: [cLon, cLat],
              zoom: targetZoom,
              duration: 1000,
            });
          }
        },
        fitBounds: (bounds) => {
          mapRef.current?.fitBounds(bounds, { padding: 50 });
        },
        zoomIn: () => {
          mapRef.current?.getMap().zoomIn();
        },
        zoomOut: () => {
          mapRef.current?.getMap().zoomOut();
        },
        searchLocal: (query: string) => {
          const results: CoTEntity[] = [];
          const q = query.toLowerCase();
          entitiesRef.current.forEach((e: CoTEntity) => {
            if (
              e.callsign.toLowerCase().includes(q) ||
              e.uid.toLowerCase().includes(q)
            ) {
              results.push(e);
            }
          });
          return results;
        },
      });
    }
  }, [mapLoaded, onMapActionsReady]);

  return (
    <>
      <Suspense fallback={null}>
        <MapComponent
          key={globeMode ? "map-globe" : "map-mercator"}
          ref={mapRef as any}
          viewState={
            globeMode ? { ...viewState, pitch: 0, bearing: 0 } : viewState
          }
          onLoad={handleMapLoad}
          onMove={(evt: any) => {
            // If user interacts (drags/pans), disable Follow Mode to prevent fighting.
            if (
              evt.originalEvent &&
              followModeRef.current &&
              onFollowModeChange
            ) {
              followModeRef.current = false; // Instant kill before next frame
              onFollowModeChange(false);
            }

            const nextViewState = { ...evt.viewState };
            if (globeMode) {
              // Lock pitch/bearing to 0 in state
              nextViewState.pitch = 0;
              nextViewState.bearing = 0;
            }
            setViewState(nextViewState as any);
          }}
          mapStyle={mapStyle}
          {...(_enableMapbox && _isValidToken ? { mapboxAccessToken: mapToken } : {})}
          globeMode={globeMode}
          style={{
            width: "100vw",
            height: "100vh",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
          antialias={true}
          projection={globeMode ? { type: 'globe' } : { type: 'mercator' }}
          dragRotate={!globeMode}
          pitchWithRotate={!globeMode}
          touchPitch={!globeMode}
          keyboard={!globeMode}
          maxPitch={globeMode ? 0 : 85}
          deckProps={{
            key: `overlay-${globeMode ? "globe" : "merc"}-${enable3d ? "3d" : "2d"}`, // Force remount on projection/3D change
            id: "tactical-overlay",
            // Globe mode: interleaved shares the Mapbox WebGL context and depth buffer.
            // The globe sphere writes depth when rendered, so DeckGL layers that come
            // after in the render pipeline correctly clip far-side geometry via depthTest.
            // Previous attempts failed due to _full3d conflicts + per-frame projection
            // being set — both are now removed, so this should work cleanly.
            interleaved: false,
            globeMode,
            onOverlayLoaded: handleOverlayLoaded,
          }}
        />
      </Suspense>

      {/* View Controls & Zoom HUD - Centered at the bottom */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-row items-center gap-4 z-[100] pointer-events-auto">
        <div className="flex bg-black/40 backdrop-blur-md border border-white/10 rounded-lg p-1 gap-1 h-fit">
          {!globeMode && (
            <>
              <button
                onClick={() => setViewMode("2d")}
                className={`px-3 py-1 text-[10px] font-bold rounded transition-all flex items-center gap-2 ${!enable3d
                  ? "bg-sea-accent text-black shadow-[0_0_10px_rgba(0,255,255,0.6)]"
                  : "text-white/40 hover:text-white/60"
                  }`}
              >
                2D
              </button>
              <button
                onClick={() => setViewMode("3d")}
                className={`px-3 py-1 text-[10px] font-bold rounded transition-all flex items-center gap-2 ${enable3d
                  ? "bg-sea-accent text-black shadow-[0_0_10px_rgba(0,255,255,0.6)]"
                  : "text-white/40 hover:text-white/60"
                  }`}
              >
                3D
              </button>
              <div className="w-[1px] h-4 bg-white/10 my-auto mx-1" />
            </>
          )}
          <button
            onClick={() => onToggleGlobe?.()}
            className={`px-3 py-1 text-[10px] font-bold rounded transition-all flex items-center gap-2 ${globeMode
              ? "bg-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.4)]"
              : "text-white/40 hover:text-white/60"
              }`}
            title="Toggle Globe View"
          >
            <Globe size={12} className={globeMode ? "animate-pulse" : ""} />
            GLOBE
          </button>
        </div>

        {/* Map Zoom Controls */}
        <div className="flex bg-black/40 backdrop-blur-md border border-white/10 rounded-lg p-1 gap-1 h-fit">
          <button
            onClick={() => mapRef.current?.getMap().zoomOut()}
            className="p-2 text-white/40 hover:text-hud-green hover:bg-white/5 rounded transition-all active:scale-95"
            title="Zoom Out"
          >
            <Minus size={14} strokeWidth={3} />
          </button>
          <button
            onClick={() => mapRef.current?.getMap().zoomIn()}
            className="p-2 text-white/40 hover:text-hud-green hover:bg-white/5 rounded transition-all active:scale-95"
            title="Zoom In"
          >
            <Plus size={14} strokeWidth={3} />
          </button>
        </div>

      </div>

      {hoveredEntity && hoverPosition && (
        <MapTooltip entity={hoveredEntity} position={hoverPosition} />
      )}
    </>
  );
}
