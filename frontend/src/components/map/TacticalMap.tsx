import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  lazy,
  Suspense,
  MutableRefObject,
} from "react";
import { Globe, RotateCcw, ChevronUp, ChevronDown, Plus, Minus } from "lucide-react";
import type { MapRef } from "react-map-gl/maplibre";
import { MapboxOverlay } from "@deck.gl/mapbox";
import "maplibre-gl/dist/maplibre-gl.css";
import "mapbox-gl/dist/mapbox-gl.css";
import { CoTEntity, JS8Station, MissionProps, RepeaterStation } from "../../types";
import { MapTooltip } from "./MapTooltip";
import { MapContextMenu } from "./MapContextMenu";
import { SaveLocationForm } from "./SaveLocationForm";
import { AltitudeLegend } from "./AltitudeLegend";
import { SpeedLegend } from "./SpeedLegend";
import { useEntityWorker } from "../../hooks/useEntityWorker";
import { useAnimationLoop } from "../../hooks/useAnimationLoop";
import { useMissionArea } from "../../hooks/useMissionArea";
import { useMapCamera } from "../../hooks/useMapCamera";
import { getCompensatedCenter } from "../../utils/map/geoUtils";

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
    entityType?: "air" | "sea" | "orbital";
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
}

export function TacticalMap({
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
}: TacticalMapProps) {
  // State for UI interactions
  const [hoveredEntity, setHoveredEntity] = useState<CoTEntity | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [contextMenuCoords, setContextMenuCoords] = useState<{
    lat: number;
    lon: number;
  } | null>(null);

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
  const initialZoom = 9.5;

  // View State (Controlled for bearing tracking)
  const [viewState, setViewState] = useState({
    latitude: initialLat,
    longitude: initialLon,
    zoom: initialZoom,
    pitch: enable3d ? 50 : 0,
    bearing: 0,
  });

  // Refs for transient state
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
    console.log("FollowMode prop changed:", followMode);
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
    handleSetFocus,
    handleReturnHome,
    showSaveForm,
    setShowSaveForm,
    saveFormCoords,
    setSaveFormCoords,
    handleSaveFormSubmit,
    handleSaveFormCancel,
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
    globeMode,
    enable3d,
    mapToken,
    mapStyle,
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
  const { setViewMode, handleAdjustCamera, handleResetCompass } = useMapCamera({
    mapRef,
    mapInstanceRef,
    mapLoaded,
    globeMode,
    enable3d,
    setEnable3d,
    mapToken,
  });

  // Mission Area Handlers that bridge to context menu UI
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleContextMenu = useCallback((e: any) => {
    e.preventDefault();
    const { lngLat, point } = e;
    setContextMenuPos({ x: point.x, y: point.y });
    setContextMenuCoords({ lat: lngLat.lat, lon: lngLat.lng });
  }, []);

  const handleSaveLocation = useCallback((lat: number, lon: number) => {
    setSaveFormCoords({ lat, lon });
    setShowSaveForm(true);
    setContextMenuPos(null);
  }, [setSaveFormCoords, setShowSaveForm]);

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
      console.log("[TacticalMap] Map Loaded Successfully");
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
          onContextMenu={handleContextMenu}
          onClick={() => {
            setContextMenuPos(null);
            setContextMenuCoords(null);
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
            // The user requested to keep interleave OFF for stability
            interleaved: false,
            globeMode,
            onOverlayLoaded: handleOverlayLoaded,
          }}
        />
      </Suspense>

      {/* View Controls */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 z-[100] pointer-events-auto">
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

        {/* Manual Orientation Controls - Only in 3D mode, Hidden in Globe */}
        {enable3d && !globeMode && (
          <div className="flex flex-row gap-2">
            <div className="flex gap-2 bg-black/40 backdrop-blur-md p-1.5 rounded-lg border border-white/5 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300">
              <button
                onClick={() => handleAdjustCamera("bearing", -45)}
                className="p-2 rounded bg-transparent border border-white/10 text-white/50 hover:text-white transition-all active:scale-95 w-10 h-10 flex items-center justify-center"
                title="Rotate Left"
              >
                <RotateCcw size={16} />
              </button>
              <button
                onClick={handleResetCompass}
                className="p-2 rounded bg-transparent border border-white/10 text-white/50 hover:text-cyan-400 transition-all active:scale-95 w-10 h-10 flex items-center justify-center font-mono font-bold text-lg"
                title="Reset to North"
              >
                N
              </button>
              <button
                onClick={() => handleAdjustCamera("bearing", 45)}
                className="p-2 rounded bg-transparent border border-white/10 text-white/50 hover:text-white transition-all active:scale-95 w-10 h-10 flex items-center justify-center"
                title="Rotate Right"
              >
                <RotateCcw size={16} className="scale-x-[-1]" />
              </button>
            </div>

            <div className="flex gap-2 bg-black/40 backdrop-blur-md p-1.5 rounded-lg border border-white/5 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300">
              <button
                onClick={() => handleAdjustCamera("pitch", 15)}
                className="p-2 rounded bg-transparent border border-white/10 text-white/50 hover:text-white transition-all active:scale-95 w-10 h-10 flex items-center justify-center"
                title="Tilt Down"
              >
                <ChevronUp size={16} />
              </button>
              <button
                onClick={() => handleAdjustCamera("pitch", -15)}
                className="p-2 rounded bg-transparent border border-white/10 text-white/50 hover:text-white transition-all active:scale-95 w-10 h-10 flex items-center justify-center"
                title="Tilt Up"
              >
                <ChevronDown size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

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

      {/* Map Zoom HUD - Floating anchored to bottom left */}
      <div className="absolute left-[405px] bottom-4 z-10 flex flex-col gap-1 items-start select-none">
        <div className="flex flex-col bg-black/40 backdrop-blur-md border border-white/10 rounded overflow-hidden shadow-2xl animate-in fade-in slide-in-from-left-4 duration-500">
          <button
            onClick={() => mapRef.current?.getMap().zoomIn()}
            className="p-2 text-white/40 hover:text-hud-green hover:bg-white/5 transition-all active:scale-95 border-b border-white/5"
            title="Zoom In"
          >
            <Plus size={14} strokeWidth={3} />
          </button>
          <button
            onClick={() => mapRef.current?.getMap().zoomOut()}
            className="p-2 text-white/40 hover:text-hud-green hover:bg-white/5 transition-all active:scale-95"
            title="Zoom Out"
          >
            <Minus size={14} strokeWidth={3} />
          </button>
        </div>
      </div>
    </>
  );
}

export default TacticalMap;
