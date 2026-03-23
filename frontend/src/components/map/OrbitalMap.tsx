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
import { SpaceWeatherPanel } from "./SpaceWeatherPanel";
import type { FeatureCollection } from "geojson";
import type { MapRef } from "react-map-gl/maplibre";
import { MapboxOverlay } from "@deck.gl/mapbox";
import "maplibre-gl/dist/maplibre-gl.css";
import "mapbox-gl/dist/mapbox-gl.css";
import { CoTEntity, JS8Station, MissionProps, RFSite, GroundTrackPoint, SatNOGSStation } from "../../types";
import { MapTooltip } from "./MapTooltip";
import { MapContextMenu } from "./MapContextMenu";
import { SaveLocationForm } from "./SaveLocationForm";
import { useAnimationLoop } from "../../hooks/useAnimationLoop";
import { useMapCamera } from "../../hooks/useMapCamera";
import { getCompensatedCenter } from "../../utils/map/geoUtils";
import { StarField } from "./StarField";
import { parseMissionHash, updateMissionHash } from "../../hooks/useMissionHash";

// Inline MapLibre style for ESRI World Imagery satellite tiles (no API key required)
const SATELLITE_MAP_STYLE = {
  version: 8 as const,
  sources: {
    "esri-satellite": {
      type: "raster" as const,
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
    },
  },
  layers: [{ id: "satellite-layer", type: "raster" as const, source: "esri-satellite" }],
};
const DARK_MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// Pre-load both adapters so React doesn't re-suspend when toggling Globe mode.
// react-map-gl v8 bakes the GL library into the entry point, so we lazy-load
// the correct adapter rather than using the removed `mapLib` prop.
const _mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
const _enableMapbox = import.meta.env.VITE_ENABLE_MAPBOX !== 'false';
const _isValidToken = !!_mapboxToken && _mapboxToken.startsWith('pk.');

 
const MapboxAdapterLazy: React.ComponentType<any> = lazy(() => import("./MapboxAdapter"));
 
const MapLibreAdapterLazy: React.ComponentType<any> = lazy(() => import("./MapLibreAdapter"));

// DeckGLOverlay is defined inside each map adapter (MapLibreAdapter / MapboxAdapter)
// so that useControl is always called within the correct react-map-gl endpoint context.

// Props for TacticalMap
interface TacticalMapProps {
  onCountsUpdate?: (counts: { air: number; sea: number; orbital: number }) => void;
  filters?: import("../../types").MapFilters;
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
  rfSitesRef?: MutableRefObject<RFSite[]>;
  showRepeaters?: boolean;
  repeatersLoading?: boolean;
  /** Called once the entity worker is ready, passing the live satellitesRef map. */
  onSatellitesRefReady?: (ref: MutableRefObject<Map<string, CoTEntity>>) => void;
  // Shared Global State
  entitiesRef: MutableRefObject<Map<string, CoTEntity>>;
  satellitesRef: MutableRefObject<Map<string, CoTEntity>>;
  knownUidsRef: MutableRefObject<Set<string>>;
  drStateRef: MutableRefObject<Map<string, import("../../types").DRState>>;
  visualStateRef: MutableRefObject<Map<string, import("../../types").VisualState>>;
  prevCourseRef: MutableRefObject<Map<string, number>>;
  alertedEmergencyRef: MutableRefObject<Map<string, string>>;
  currentMissionRef: MutableRefObject<{
    lat: number;
    lon: number;
    radius_nm: number;
  } | null>;
  // Infrastructure Data Props
  cablesData: FeatureCollection | null;
  stationsData: FeatureCollection | null;
  outagesData: FeatureCollection | null;
  worldCountriesData: FeatureCollection | null;
  showTerminator?: boolean;
  missionArea: import('../../types').MissionLocation | null;
  satnogsStationsRef?: MutableRefObject<SatNOGSStation[]>;
  passGeometry?: any; // Kept for interface padding but logic removed
  onPassData?: (data: any) => void;
  currentPassData?: any;
}

type InfraPickObject = {
  id?: string;
  type?: string;
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
  properties?: Record<string, unknown>;
};

type InfraPickInfo = {
  object?: InfraPickObject | null;
  coordinate?: [number, number];
  x?: number;
  y?: number;
};

export function OrbitalMap({
  onCountsUpdate,
  filters,
  onEvent,
  selectedEntity,
  onEntitySelect,
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
  rfSitesRef,
  showRepeaters,
  repeatersLoading,
  onSatellitesRefReady,
  entitiesRef,
  satellitesRef,
  knownUidsRef,
  drStateRef,
  visualStateRef,
  prevCourseRef,
  alertedEmergencyRef,
  currentMissionRef,
  cablesData,
  stationsData,
  outagesData,
  worldCountriesData,
  missionArea,
  satnogsStationsRef,
}: TacticalMapProps) {

  // State for UI interactions
  const [hoveredEntity, setHoveredEntity] = useState<CoTEntity | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuCoords, setContextMenuCoords] = useState<{ lat: number; lon: number } | null>(null);

  const handleHoveredInfra = useCallback((info: InfraPickInfo) => {
    const obj = info?.object || null;
    if (obj) {
      const props = obj.properties || {};
      const lat = obj.geometry?.type === 'Point' 
        ? (obj.geometry.coordinates as [number, number])[1] 
        : (obj.geometry?.coordinates as [number, number][])[0][1];
      const lon = obj.geometry?.type === 'Point' 
        ? (obj.geometry.coordinates as [number, number])[0] 
        : (obj.geometry?.coordinates as [number, number][])[0][0];

      const entity: CoTEntity = {
        uid: (props as any).id || String((obj as any).id),
        type: 'infra',
        callsign: (props as any).name || 'Unknown Infra',
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
      setHoverPosition({ x: info.x || 0, y: info.y || 0 });
    } else {
      // Clear tooltip only if current hovered item is infra
      setHoveredEntity(prev => (prev?.type === 'infra' ? null : prev));
    }
  }, []);

  // Space Weather & Jamming data (polled from API, passed to layer composition)
  const [auroraData, setAuroraData] = useState<any>(null);
  const [jammingData, setJammingData] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchSpaceWeather = async () => {
      try {
        if (filters?.showAurora) {
          const r = await fetch("/api/space-weather/aurora");
          if (r.ok && !cancelled) setAuroraData(await r.json());
        }
        if (filters?.showJamming) {
          const r = await fetch("/api/jamming/active");
          if (r.ok && !cancelled) setJammingData(await r.json());
        }
      } catch { /* silently fail */ }
    };
    fetchSpaceWeather();
    const id = setInterval(fetchSpaceWeather, 60_000); // refresh every 60 s
    return () => { cancelled = true; clearInterval(id); };
  }, [filters?.showAurora, filters?.showJamming]);

  // GDELT conflict + tension events — always shown in orbital view (tone ≤ -2 only)
  const [gdeltData, setGdeltData] = useState<any>(null);
  useEffect(() => {
    let cancelled = false;
    const fetch15min = async () => {
      try {
        const r = await fetch("/api/gdelt/events");
        if (r.ok && !cancelled) setGdeltData(await r.json());
      } catch { /* silently fail */ }
    };
    fetch15min();
    const id = setInterval(fetch15min, 15 * 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [enable3d, setEnable3d] = useState(false);
  const [mapStyleMode, setMapStyleMode] = useState<'dark' | 'satellite'>('dark');
  const mapToken = _enableMapbox && _isValidToken ? _mapboxToken : undefined;

  // Globe mode always uses MapLibre — Mapbox Globe blocks CustomLayerInterface
  // which is required by MapboxOverlay for interleaved rendering. MapLibre globe
  // is fully supported by deck.gl (confirmed in @deck.gl/mapbox limitations docs).
  // Mercator uses Mapbox when a valid token is present for premium basemap quality.
  const MapComponent = (globeMode || !mapToken) ? MapLibreAdapterLazy : MapboxAdapterLazy;

  const mapStyle = (mapToken && !globeMode)
    ? "mapbox://styles/mapbox/standard"
    : (mapStyleMode === 'satellite' ? SATELLITE_MAP_STYLE : DARK_MAP_STYLE);

  const mapRef = useRef<MapRef>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  // Stores raw MapLibre GL map from onLoad event.target (bypasses react-map-gl wrapping)
  const mapInstanceRef = useRef<unknown>(null);

  // Environment Fallbacks
  const envLat = import.meta.env.VITE_CENTER_LAT;
  const envLon = import.meta.env.VITE_CENTER_LON;
  const hashState = parseMissionHash();
  const initialLat = hashState.lat !== null ? hashState.lat : (envLat ? parseFloat(envLat) : 45.5152);
  const initialLon = hashState.lon !== null ? hashState.lon : (envLon ? parseFloat(envLon) : -122.6784);
  const initialZoom = hashState.zoom !== null ? hashState.zoom : 2.5;

  // View State (Controlled for bearing tracking)
  const [viewState, setViewState] = useState({
    latitude: initialLat,
    longitude: initialLon,
    zoom: initialZoom,
    pitch: enable3d ? 50 : 0,
    bearing: 0,
  });

  // Sync to hash on move
  useEffect(() => {
    updateMissionHash({
      lat: viewState.latitude,
      lon: viewState.longitude,
      zoom: viewState.zoom
    });
  }, [viewState.latitude, viewState.longitude, viewState.zoom]);

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
      const loadFinished = !repeatersLoading;

      // Notify if loading has explicitly finished AFTER we already transitioned showRepeaters to true
      // This prevents logging 0 when the API is still fetching.
      if (!infraNotifiedRef.current.notifiedRepeaters && loadFinished) {
        const count = rfSitesRef?.current?.length || 0;
        onEvent?.({
          message: `RF_NET: ${count} RF stations active in regional sector`,
          type: "new",
          entityType: "infra",
        });
        infraNotifiedRef.current.notifiedRepeaters = true;
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
  }, [filters?.showCables, filters?.showLandingStations, showRepeaters, cablesData, stationsData, onEvent, rfSitesRef, repeatersLoading]);

  const countsRef = useRef({ air: 0, sea: 0, orbital: 0 });

  // Predicted ground track for the selected satellite
  const predictedGroundTrackRef = useRef<GroundTrackPoint[]>([]);
  useEffect(() => {
    const isSat = !!selectedEntity && (
      selectedEntity.type === 'a-s-K' || selectedEntity.type.indexOf('K') === 4
    );
    const noradId = selectedEntity?.detail?.norad_id;
    if (!isSat || !noradId || !showHistoryTails) {
      predictedGroundTrackRef.current = [];
      return;
    }
    let cancelled = false;
    fetch(`/api/orbital/groundtrack/${noradId}?minutes=90&step_seconds=30`)
      .then(r => r.ok ? r.json() : [])
      .then((pts: GroundTrackPoint[]) => {
        if (!cancelled) predictedGroundTrackRef.current = pts;
      })
      .catch(() => { if (!cancelled) predictedGroundTrackRef.current = []; });
    return () => { cancelled = true; };
  }, [selectedEntity?.uid, showHistoryTails]);

  // Observer ring ref — passed to useAnimationLoop to render the AOI horizon on the orbital map.
  // radiusKm is derived from the mission's radius_nm (1 nm = 1.852 km).
  const observerRef = useRef<{ lat: number; lon: number; radiusKm: number } | null>(null);

  // Keep observerRef in sync whenever the mission area changes.
  useEffect(() => {
    const mission = currentMissionRef.current;
    if (mission) {
      observerRef.current = {
        lat: mission.lat,
        lon: mission.lon,
        radiusKm: mission.radius_nm * 1.852,
      };
    } else {
      observerRef.current = null;
    }
  });

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
    // Null out refs so stale instances aren't used after the adapter unmounts.
    // react-map-gl handles GL context destruction internally on unmount — do not
    // call map.remove() here as it races with react-map-gl's own cleanup.
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


  // Expose the live satellitesRef to parent (App) so it can resolve NORAD IDs to real entities.
  // Use a ref+effect so this only fires once after mount, not on every render.
  const satRefExposedRef = useRef(false);
  useEffect(() => {
    if (!satRefExposedRef.current && onSatellitesRefReady) {
      satRefExposedRef.current = true;
      onSatellitesRefReady(satellitesRef);
    }
     
  }, []);

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
  } = (missionArea || {}) as any;

  useAnimationLoop({
    entitiesRef,
    satellitesRef,
    knownUidsRef,
    drStateRef,
    visualStateRef,
    prevCourseRef,
    alertedEmergencyRef,
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
    cablesData,
    stationsData,
    outagesData,
    auroraData,
    jammingData,
    gdeltData,
    gdeltToneThreshold: -2,
    setHoveredInfra: handleHoveredInfra as any,
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
    mapLoaded,
    replayMode,
    onCountsUpdate,
    onEvent,
    onEntitySelect,
    onEntityLiveUpdate,
    onFollowModeChange,
    js8StationsRef,
    ownGridRef,
    rfSitesRef,
    showRepeaters,
    predictedGroundTrackRef,
    observerRef,
    worldCountriesData,
    satnogsStationsRef,
  });

  // Map Camera: projection, graticule, 3D terrain/fog
  const { setViewMode, handleAdjustCamera, handleResetCompass } = useMapCamera({
    mapRef: mapRef as React.RefObject<MapRef>,
    mapInstanceRef,
    mapLoaded,
    globeMode,
    enable3d,
    setEnable3d,
    mapToken: mapToken || "",
    mapStyleMode,
  });



  const handleOverlayLoaded = useCallback((overlay: MapboxOverlay) => {
    overlayRef.current = overlay;
  }, []);

  const handleSaveLocation = useCallback((lat: number, lon: number) => {
    setSaveFormCoords({ lat, lon });
    setShowSaveForm(true);
    setContextMenuPos(null);
  }, [setSaveFormCoords, setShowSaveForm]);

  const handleMapLoad = useCallback(
    (evt?: unknown) => {
      // evt.target = react-map-gl Map WRAPPER — must call .getMap() for the raw MapLibre GL instance
      if ((evt as any)?.target) {
        mapInstanceRef.current =
          typeof (evt as any).target.getMap === "function"
            ? (evt as any).target.getMap()
            : (evt as any).target;
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
      {/* Star field rendered behind the map canvas. In globe mode the sky
          atmosphere layer is subtly transparent, leaving the WebGL canvas 
          transparent outside the globe sphere so the star field shows through. */}
      <StarField active={!!globeMode} />

      {/* z-index:1 ensures the map canvas stacks above the StarField (z-index:0) */}
      <div style={{ position: 'relative', zIndex: 1, width: '100vw', height: '100vh' }}>
      <Suspense fallback={null}>
        <MapComponent
          key={globeMode ? "map-globe" : "map-mercator"}
          ref={mapRef as React.Ref<unknown>}
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

            // Sync state
            setViewState(evt.viewState);

            // Lock pitch/bearing to 0 in state for globe mode
            if (globeMode) {
              setViewState((prev: any) => ({ ...prev, pitch: 0, bearing: 0 }));
            }
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
          onContextMenu={(e: any) => {
            if (e && e.lngLat) {
              setContextMenuCoords({ lat: e.lngLat.lat, lon: e.lngLat.lng });
              setContextMenuPos({ x: e.point.x, y: e.point.y });
            }
          }}
          showAttribution={false}
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
            id: "orbital-overlay",
            interleaved: false,
            globeMode,
            onOverlayLoaded: handleOverlayLoaded,
          }}
        />
      </Suspense>
            {/* View Controls & Zoom HUD - Centered at the bottom */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-[100] pointer-events-auto">
        {/* Manual Orientation Controls - Only in 3D mode, Hidden in Globe */}
        {enable3d && !globeMode && (
          <div className="flex flex-row gap-2">
            <div className="flex gap-1 bg-black/40 backdrop-blur-md p-1 rounded-lg border border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-bottom-2 duration-300">
              <button
                onClick={() => handleAdjustCamera("bearing", -45)}
                className="p-1.5 rounded-md bg-transparent border border-white/5 text-white/40 hover:text-white hover:bg-white/5 transition-all active:scale-95 w-8 h-8 flex items-center justify-center focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
                title="Rotate Left"
                aria-label="Rotate Left"
              >
                <RotateCcw size={16} />
              </button>
              <button
                onClick={handleResetCompass}
                className="p-1.5 rounded-md bg-transparent border border-white/5 text-white/40 hover:text-hud-green hover:bg-white/5 hover:border-hud-green/30 transition-all active:scale-95 w-8 h-8 flex items-center justify-center font-mono font-bold text-sm focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
                title="Reset to North"
                aria-label="Reset to North"
              >
                N
              </button>
              <button
                onClick={() => handleAdjustCamera("bearing", 45)}
                className="p-1.5 rounded-md bg-transparent border border-white/5 text-white/40 hover:text-white hover:bg-white/5 transition-all active:scale-95 w-8 h-8 flex items-center justify-center focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
                title="Rotate Right"
                aria-label="Rotate Right"
              >
                <RotateCcw size={16} className="scale-x-[-1]" />
              </button>
            </div>

            <div className="flex gap-1 bg-black/40 backdrop-blur-md p-1 rounded-lg border border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-bottom-2 duration-300">
              <button
                onClick={() => handleAdjustCamera("pitch", 15)}
                className="p-1.5 rounded-md bg-transparent border border-white/5 text-white/40 hover:text-white hover:bg-white/5 transition-all active:scale-95 w-8 h-8 flex items-center justify-center focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
                title="Tilt Down"
                aria-label="Tilt Down"
              >
                <ChevronUp size={16} />
              </button>
              <button
                onClick={() => handleAdjustCamera("pitch", -15)}
                className="p-1.5 rounded-md bg-transparent border border-white/5 text-white/40 hover:text-white hover:bg-white/5 transition-all active:scale-95 w-8 h-8 flex items-center justify-center focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
                title="Tilt Up"
                aria-label="Tilt Up"
              >
                <ChevronDown size={16} />
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-row items-center gap-4">
          <div className="flex bg-black/40 backdrop-blur-md border border-white/10 rounded-lg p-1 gap-1 h-fit">
            {!globeMode && (
              <>
                <button
                  onClick={() => setViewMode("2d")}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-2 focus-visible:ring-1 focus-visible:ring-hud-green outline-none ${!enable3d
                    ? "bg-hud-green/20 text-hud-green shadow-[0_0_8px_rgba(0,255,65,0.3)] border border-hud-green/40"
                    : "text-white/40 hover:text-white/80 hover:bg-white/10 border border-transparent"
                    }`}
                >
                  2D
                </button>
                <button
                  onClick={() => setViewMode("3d")}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-2 focus-visible:ring-1 focus-visible:ring-hud-green outline-none ${enable3d
                    ? "bg-hud-green/20 text-hud-green shadow-[0_0_8px_rgba(0,255,65,0.3)] border border-hud-green/40"
                    : "text-white/40 hover:text-white/80 hover:bg-white/10 border border-transparent"
                    }`}
                >
                  3D
                </button>
                <div className="w-[1px] h-4 bg-white/10 my-auto mx-1" />
              </>
            )}
            <button
              onClick={() => onToggleGlobe?.()}
              className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-2 focus-visible:ring-1 focus-visible:ring-indigo-400 outline-none ${globeMode
                ? "bg-indigo-500/20 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.4)] border border-indigo-500/50"
                : "text-white/40 hover:text-white/80 hover:bg-white/10 border border-transparent"
                }`}
              title="Toggle Globe View"
            >
              <Globe size={12} className={globeMode ? "animate-pulse" : ""} />
              GLOBE
            </button>

            {globeMode && (
              <>
                <div className="w-[1px] h-4 bg-white/10 my-auto mx-1" />
                <button
                  onClick={() => setMapStyleMode('dark')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-1 focus-visible:ring-1 focus-visible:ring-indigo-400 outline-none ${mapStyleMode === 'dark'
                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/50"
                    : "text-white/40 hover:text-white/80 hover:bg-white/10 border border-transparent"
                    }`}
                  title="Dark Tactical View"
                >
                  DARK
                </button>
                <button
                  onClick={() => setMapStyleMode('satellite')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-1 focus-visible:ring-1 focus-visible:ring-indigo-400 outline-none ${mapStyleMode === 'satellite'
                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/50"
                    : "text-white/40 hover:text-white/80 hover:bg-white/10 border border-transparent"
                    }`}
                  title="Satellite Terrain View"
                >
                  SAT
                </button>
              </>
            )}
          </div>

          {/* Map Zoom Controls */}
          <div className="flex bg-black/40 backdrop-blur-md border border-white/10 rounded-lg p-1 gap-1 h-fit">
            <button
              onClick={() => mapRef.current?.getMap().zoomOut()}
              className="p-1 text-white/40 hover:text-hud-green hover:bg-white/10 rounded-md transition-all active:scale-95 focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
              title="Zoom Out"
              aria-label="Zoom Out"
            >
              <Minus size={14} strokeWidth={3} />
            </button>
            <button
              onClick={() => mapRef.current?.getMap().zoomIn()}
              className="p-1 text-white/40 hover:text-hud-green hover:bg-white/10 rounded-md transition-all active:scale-95 focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
              title="Zoom In"
              aria-label="Zoom In"
            >
              <Plus size={14} strokeWidth={3} />
            </button>
          </div>
        </div>
      </div>
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

      {/* Right HUD Stack — Space Weather + Pass Geometry */}
      <div
        className="flex flex-col gap-3"
        style={{
          position: "absolute",
          top: 70,
          right: selectedEntity ? 380 : 20,
          zIndex: 100,
          pointerEvents: "none",
          transition: "right 0.3s ease-in-out",
        }}
      >
        {/* Space Weather Panel — always at the top of the stack */}
        <div style={{ pointerEvents: "auto" }}>
          <SpaceWeatherPanel visible={true} />
        </div>
      </div>
    </>
  );
}
