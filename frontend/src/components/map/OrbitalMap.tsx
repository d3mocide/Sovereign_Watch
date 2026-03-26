import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  Suspense,
  MutableRefObject,
} from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { SpaceWeatherPanel } from "./SpaceWeatherPanel";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import "mapbox-gl/dist/mapbox-gl.css";
import { CoTEntity, JS8Station, MissionProps, RFSite, GroundTrackPoint, SatNOGSStation } from "../../types";
import { MapTooltip } from "./MapTooltip";
import { MapContextMenu } from "./MapContextMenu";
import { MapControls } from "./MapControls";
import { SaveLocationForm } from "./SaveLocationForm";
import { useAnimationLoop } from "../../hooks/useAnimationLoop";
import { useMapBase } from "../../hooks/useMapBase";
import { useMapCamera } from "../../hooks/useMapCamera";
import { getCompensatedCenter } from "../../utils/map/geoUtils";
import { StarField } from "./StarField";

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

  // ---------------------------------------------------------------------------
  // Map base: adapter, style, refs, view state, hash sync (shared via useMapBase)
  // ---------------------------------------------------------------------------
  const {
    mapRef,
    overlayRef,
    mapInstanceRef,
    mapLoaded,
    enable3d,
    setEnable3d,
    mapStyleMode,
    setMapStyleMode,
    mapToken,
    MapComponent,
    mapStyle,
    viewState,
    setViewState,
    handleMapLoad,
    handleOverlayLoaded,
  } = useMapBase({ globeMode, defaultZoom: 2.5 });

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



  const handleSaveLocation = useCallback((lat: number, lon: number) => {
    setSaveFormCoords({ lat, lon });
    setShowSaveForm(true);
    setContextMenuPos(null);
  }, [setSaveFormCoords, setShowSaveForm]);

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
          {...(mapToken ? { mapboxAccessToken: mapToken } : {})}
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
      <MapControls
        globeMode={!!globeMode}
        onToggleGlobe={() => onToggleGlobe?.()}
        enable3d={enable3d}
        onSet2D={() => setViewMode("2d")}
        onSet3D={() => setViewMode("3d")}
        mapStyleMode={mapStyleMode}
        styleOptions={[
          { key: "dark", label: "DARK" },
          { key: "satellite", label: "SAT" },
        ]}
        onSetStyleMode={(mode) =>
          setMapStyleMode(mode as "dark" | "satellite")
        }
        onZoomIn={() => mapRef.current?.getMap().zoomIn()}
        onZoomOut={() => mapRef.current?.getMap().zoomOut()}
        onAdjustBearing={(delta) => handleAdjustCamera("bearing", delta)}
        onResetNorth={handleResetCompass}
        onAdjustPitch={(delta) => handleAdjustCamera("pitch", delta)}
      />
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
