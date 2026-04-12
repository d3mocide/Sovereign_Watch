import type { FeatureCollection } from "geojson";
import "mapbox-gl/dist/mapbox-gl.css";
import "maplibre-gl/dist/maplibre-gl.css";
import React, {
  MutableRefObject,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAnimationLoop } from "../../hooks/useAnimationLoop";
import { useMapBase } from "../../hooks/useMapBase";
import { useMapCamera } from "../../hooks/useMapCamera";
import { CoTEntity, JS8Station, JammingZone, RFSite, Tower } from "../../types";
import {
  buildHoldingAlertMessage,
  getHoldingAlertKey,
  HOLD_ALERT_RENOTIFY_MS,
  isHoldingPatternCritical,
  shouldSuppressHoldingAlert,
} from "../../alerts/HoldingPatternAlertEngine";
import {
  buildJammingAlertMessage,
  getJammingAlertKey,
  JAMMING_ALERT_RENOTIFY_MS,
} from "../../alerts/JammingAlertEngine";
import { getCompensatedCenter } from "../../utils/map/geoUtils";
import { AltitudeLegend } from "./AltitudeLegend";
import { MapContextMenu } from "./MapContextMenu";
import { MapControls } from "./MapControls";
import { MapTooltip } from "./MapTooltip";
import { RFLegend } from "./RFLegend";
import { SaveLocationForm } from "./SaveLocationForm";
import { SpeedLegend } from "./SpeedLegend";
import { StarField } from "./StarField";
import { NWSAlertsWidget } from "../widgets/NWSAlertsWidget";

// DeckGLOverlay is defined inside each map adapter (MapLibreAdapter / MapboxAdapter)
// so that useControl is always called within the correct react-map-gl endpoint context.

// Props for TacticalMap
interface TacticalMapProps {
  onCountsUpdate?: (counts: {
    air: number;
    sea: number;
    orbital: number;
  }) => void;
  filters?: import("../../types").MapFilters;
  onEvent?: (event: {
    type: "new" | "lost" | "alert";
    message: string;
    entityType?: "air" | "sea" | "orbital" | "infra";
    classification?: import("../../types").EntityClassification;
  }) => void;
  selectedEntity: CoTEntity | null;
  onEntitySelect: (entity: CoTEntity | null) => void;
  onAnalyzeRegionalRisk?: (h3Region: string, lat: number, lon: number) => void;
  onMapActionsReady?: (actions: import("../../types").MapActions) => void;
  showVelocityVectors?: boolean;
  showHistoryTails?: boolean;
  missionArea: {
    aotShapes: { maritime: number[][]; aviation: number[][] } | null;
    handleSetFocus: (
      lat: number,
      lon: number,
      radius?: number,
    ) => Promise<void>;
    showSaveForm: boolean;
    setShowSaveForm: React.Dispatch<React.SetStateAction<boolean>>;
    saveFormCoords: { lat: number; lon: number } | null;
    setSaveFormCoords: React.Dispatch<
      React.SetStateAction<{ lat: number; lon: number } | null>
    >;
    handleSaveFormSubmit: (name: string, radius: number) => void;
    handleSaveFormCancel: () => void;
    handleReturnHome: () => Promise<void>;
  };
  currentMission?: { lat: number; lon: number; radius_nm: number } | null;
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
  kiwiNodeRef?: MutableRefObject<{
    lat: number;
    lon: number;
    host: string;
  } | null>;
  showRepeaters?: boolean;
  repeatersLoading?: boolean;
  // Shared Global State
  entitiesRef: MutableRefObject<Map<string, CoTEntity>>;
  satellitesRef: MutableRefObject<Map<string, CoTEntity>>;
  knownUidsRef: MutableRefObject<Set<string>>;
  drStateRef: MutableRefObject<Map<string, import("../../types").DRState>>;
  visualStateRef: MutableRefObject<
    Map<string, import("../../types").VisualState>
  >;
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
  towersData?: Tower[];
  onBoundsChange?: (
    bounds: {
      minLat: number;
      maxLat: number;
      minLon: number;
      maxLon: number;
    } | null,
  ) => void;
  gdeltData?: FeatureCollection | null;
  /** NDBC Ocean Buoy latest observations GeoJSON (Phase 1 Geospatial) */
  buoyData?: FeatureCollection | null;
  /** Active NWS alerts GeoJSON (environmental overlay) */
  nwsAlertsData?: FeatureCollection | null;
  /** PeeringDB Internet Exchange Points GeoJSON (Initiative B) */
  ixpData?: FeatureCollection | null;
  /** PeeringDB Data Center Facilities GeoJSON (Initiative B) */
  facilityData?: FeatureCollection | null;
  /** Current ISS position (Initiative B real-time tracker) */
  issPosition?: import("../../types").ISSPosition | null;
  /** ISS ground track ring buffer (Initiative B real-time tracker) */
  issTrack?: import("../../types").ISSPosition[];
  showTerminator?: boolean;
  /** Historical track segments from TrackHistoryPanel — rendered as a path layer */
  historySegments?: import("../../types").HistorySegment[];
  wsSignal?: any;
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

function isInfraPickInfo(value: unknown): value is InfraPickInfo {
  return typeof value === "object" && value !== null;
}

export function TacticalMap({
  onCountsUpdate,
  filters,
  onEvent,
  selectedEntity,
  onEntitySelect,
  onAnalyzeRegionalRisk,
  onMapActionsReady,
  showVelocityVectors,
  showHistoryTails,
  missionArea,
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
  kiwiNodeRef,
  showRepeaters,
  repeatersLoading,
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
  towersData,
  onBoundsChange,
  gdeltData: propGdeltData,
  buoyData,
  nwsAlertsData,
  ixpData,
  facilityData,
  issPosition,
  issTrack,
  historySegments,
  currentMission,
  wsSignal,
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
  const handleHoveredInfra = useCallback((info: unknown) => {
    if (!isInfraPickInfo(info)) return;
    const obj = info?.object || null;
    if (obj) {
      let lat = 0,
        lon = 0;
      if (info.coordinate) {
        [lon, lat] = info.coordinate;
      } else {
        const geom = obj.geometry;
        if (geom?.type === "Point") {
          [lon, lat] = geom.coordinates as [number, number];
        } else if (geom?.type === "LineString") {
          [lon, lat] = (geom.coordinates as [number, number][])[0];
        } else if (geom?.type === "Polygon") {
          [lon, lat] = (geom.coordinates as [number, number][][])[0][0];
        } else if (geom?.type === "MultiPolygon") {
          [lon, lat] = (geom.coordinates as [number, number][][][])[0][0][0];
        }
      }

      const props = obj.properties || {};
      const isOutage =
        props.entity_type === "outage" || obj.type === "outage";
      const isNwsAlert =
        props.event !== undefined || props.headline !== undefined;
      const isTower = obj.type === "tower" || props.entity_type === "tower";
      const isBuoy = props.buoy_id !== undefined;
      const isISS = props.entity_type === "iss";
      const isAirspace = props.zone_id !== undefined;
      const entityType = isBuoy
        ? "buoy"
        : isTower
          ? "tower"
          : isNwsAlert
            ? "nws_alert"
          : isOutage
            ? "outage"
          : isISS
            ? "iss"
          : isAirspace
            ? "airspace"
            : "infra";
      const entity: CoTEntity = {
        uid: String(
          props.zone_id || props.id || props.buoy_id || obj.id || `infra-${Date.now()}`,
        ),
        type: entityType,
        callsign: String(
          props.name ||
            props.buoy_id ||
            props.event ||
            props.headline ||
            props.region ||
            props.fcc_id ||
            (isOutage
              ? "INTERNET OUTAGE"
              : isTower
                ? "FCC TOWER"
                : isAirspace
                  ? "AIRSPACE ZONE"
                  : "INFRA"),
        ),
        lat,
        lon,
        altitude: 0,
        course: 0,
        speed: 0,
        lastSeen: Date.now(),
        detail: obj as any,
        trail: [],
        uidHash: 0,
      };
      setHoveredEntity(entity);
      setHoverPosition({ x: info.x || 0, y: info.y || 0 });
    } else {
      // Clear tooltip only if current hovered item is infrastructure-derived
      setHoveredEntity((prev: CoTEntity | null) =>
        prev?.type === "infra" ||
        prev?.type === "outage" ||
        prev?.type === "tower" ||
        prev?.type === "buoy" ||
        prev?.type === "nws_alert"
          ? null
          : prev,
      );
      setHoverPosition(null);
    }
  }, []);

  const [auroraData, setAuroraData] = useState<any>(null);
  const [jammingData, setJammingData] = useState<any>(null);
  const [holdingPatternData, setHoldingPatternData] =
    useState<FeatureCollection | null>(null);
  const [airspaceZonesData, setAirspaceZonesData] =
    useState<FeatureCollection | null>(null);

  // ── Fetching logic (Event-driven) ──────────────────────────────────────────

  const fetchAviationAlerts = useCallback(async () => {
    try {
      if (filters?.showHoldingPatterns !== false) {
        const r = await fetch("/api/holding-patterns/active");
        if (r.ok) setHoldingPatternData(await r.json());
      }
    } catch { /* ignore */ }
  }, [filters, currentMission]);

  const fetchAirspaceZones = useCallback(async () => {
    try {
      if (filters?.showAirspaceZones) {
        const r = await fetch("/api/airspace/zones");
        if (r.ok) setAirspaceZonesData(await r.json());
      } else {
        setAirspaceZonesData(null);
      }
    } catch { /* ignore */ }
  }, [filters, currentMission]);

  const fetchSpaceWeather = useCallback(async () => {
    try {
      const fetchList = [];
      if (filters?.showAurora) {
        fetchList.push(fetch("https://services.swpc.noaa.gov/json/ovation_aurora_latest.json")
          .then(async r => { if (r.ok) setAuroraData(await r.json()); }));
      }
      if (filters?.showJamming) {
        fetchList.push(fetch("/api/jamming/active")
          .then(async r => { if (r.ok) setJammingData(await r.json()); }));
      }
      if (fetchList.length > 0) await Promise.all(fetchList);
    } catch { /* ignore */ }
  }, [filters, currentMission]);

  // 1. Initial load / page refresh — only fires once per mission value
  //    Uses a 500ms delay to avoid fetching before any in-flight poller cycle
  //    has cleared the old cache (belt-and-suspenders for cold start).
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAviationAlerts();
      fetchAirspaceZones();
      fetchSpaceWeather();
    }, 500);
    return () => clearTimeout(timer);
  }, []); // intentionally empty — runs once on mount only

  // 2. Mission change — clear immediately, let WS signals drive re-population
  useEffect(() => {
    setHoldingPatternData(null);
    setAirspaceZonesData(null);
    setJammingData(null);
    // NOTE: No fetch here. We rely exclusively on:
    //   a) The 'clearing' signal (backend confirms wipe)
    //   b) The 'updated' signal (backend confirms new data is ready)
  }, [JSON.stringify(currentMission)]);

  // 3. Reactive updates from WebSocket signals
  useEffect(() => {
    if (!wsSignal || wsSignal.type !== "alert") return;

    const channel = wsSignal.channel;
    const signalData = wsSignal.data as { status?: string } | undefined;

    if (channel === "airspace:zones") {
      if (signalData?.status === "clearing") {
        // Backend has cleared the cache — wipe our local state immediately
        setAirspaceZonesData(null);
      } else if (signalData?.status === "updated") {
        // New data is ready in Redis — fetch it now
        fetchAirspaceZones();
      }
    } else if (channel === "jamming:active_zones") {
      if (signalData?.status === "updated") fetchSpaceWeather();
    } else if (channel === "holding_pattern:active_zones") {
      if (signalData?.status === "updated") fetchAviationAlerts();
    }
  }, [wsSignal, fetchAirspaceZones, fetchAviationAlerts, fetchSpaceWeather]);

  // 4. Periodic polling fallbacks (conservative intervals — WS signals are primary)
  useEffect(() => {
    const id = setInterval(fetchAviationAlerts, 60_000);
    return () => clearInterval(id);
  }, [fetchAviationAlerts]);

  useEffect(() => {
    const id = setInterval(fetchAirspaceZones, 30 * 60_000);
    return () => clearInterval(id);
  }, [fetchAirspaceZones]);

  useEffect(() => {
    const id = setInterval(fetchSpaceWeather, 60_000);
    return () => clearInterval(id);
  }, [fetchSpaceWeather]);

  // GDELT geolocated news events
  const gdeltData = propGdeltData;

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
  } = useMapBase({ globeMode, defaultZoom: 9.5 });

  // History track segments ref — updated synchronously so the RAF loop picks it up
  const historySegmentsRef = useRef<import("../../types").HistorySegment[]>(
    historySegments ?? [],
  );
  useEffect(() => {
    historySegmentsRef.current = historySegments ?? [];
  }, [historySegments]);

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
          message:
            "INFRA: Undersea cable infrastructure data stream terminated",
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

      // Notify if loading has explicitly finished AND we have data.
      // We skip logging 0 during the initial mount/load phase to avoid the race condition.
      if (!infraNotifiedRef.current.notifiedRepeaters && loadFinished) {
        const count = rfSitesRef?.current?.length || 0;

        if (count > 0) {
          onEvent?.({
            message: `RF_NET: ${count} RF stations active in regional sector`,
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
  }, [
    filters?.showCables,
    filters?.showLandingStations,
    showRepeaters,
    cablesData,
    stationsData,
    onEvent,
    rfSitesRef,
    repeatersLoading,
  ]);

  // Aviation Holding Pattern Alert Trigger
  // Keep per-aircraft alert timestamps so temporary empty polls do not re-alert every active hold.
  const seenHoldingRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (
      !holdingPatternData?.features ||
      holdingPatternData.features.length === 0
    ) {
      // Do not clear cache on empty poll; backend/API jitter can briefly return no features.
      return;
    }

    const now = Date.now();

    holdingPatternData.features.forEach((f: any) => {
      const p = f.properties ?? {};
      const key = getHoldingAlertKey(p);
      if (!key) return;

      if (shouldSuppressHoldingAlert(p)) return;

      const lastAlertAt = seenHoldingRef.current.get(key) ?? 0;
      if (now - lastAlertAt >= HOLD_ALERT_RENOTIFY_MS) {
        const isCritical = isHoldingPatternCritical(p);
        onEvent?.({
          message: buildHoldingAlertMessage(p, isCritical),
          type: isCritical ? "alert" : "new",
          entityType: "air",
        });
        seenHoldingRef.current.set(key, now);
      }
    });

    // Cleanup stale keys to keep memory bounded.
    const evictionCutoff = now - 6 * 60 * 60 * 1000;
    for (const [key, ts] of seenHoldingRef.current.entries()) {
      if (ts < evictionCutoff) {
        seenHoldingRef.current.delete(key);
      }
    }
  }, [holdingPatternData, onEvent]);

  // GPS Jamming Alert Trigger
  // Alerts only for intentional jamming or mixed assessments — space_weather and equipment
  // faults are suppressed here (handled by the Space Weather widget and layer tooltips).
  const seenJammingRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (!jammingData?.features?.length) return;

    const now = Date.now();

    jammingData.features.forEach((f: any) => {
      const zone = f.properties as JammingZone;
      if (!zone) return;

      const key = getJammingAlertKey(zone);
      if (!key) return;

      const lastAlertAt = seenJammingRef.current.get(key) ?? 0;
      if (now - lastAlertAt >= JAMMING_ALERT_RENOTIFY_MS) {
        onEvent?.({
          message: buildJammingAlertMessage(zone),
          type: "alert",
          entityType: "infra",
        });
        seenJammingRef.current.set(key, now);
      }
    });

    // Cleanup stale keys to keep memory bounded.
    const evictionCutoff = now - 6 * 60 * 60 * 1000;
    for (const [key, ts] of seenJammingRef.current.entries()) {
      if (ts < evictionCutoff) {
        seenJammingRef.current.delete(key);
      }
    }
  }, [jammingData, onEvent]);

  const countsRef = useRef({ air: 0, sea: 0, orbital: 0 });

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

  // Reset satellite style when exiting globe (satellite tiles only make sense on the globe).
  // mapLoaded reset and ref cleanup are handled by useMapBase.
  const [prevGlobeMode, setPrevGlobeMode] = useState(globeMode);
  if (globeMode !== prevGlobeMode) {
    setPrevGlobeMode(globeMode);
    if (!globeMode) {
      setMapStyleMode("dark");
    }
  }

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

  // Mission Area: mission state, AOT geometry, entity clearing, save form
  // Now provided by parent via missionArea prop
  const {
    aotShapes,
    handleSetFocus,
    showSaveForm,
    setShowSaveForm,
    saveFormCoords,
    setSaveFormCoords,
    handleSaveFormSubmit,
    handleSaveFormCancel,
    handleReturnHome,
  } = missionArea;

  const h3RiskResolution = useMemo(() => {
    const z = viewState.zoom;
    // Backend supports only resolutions 4, 6, 9.
    // Keep large (res-4) hexagons through all regional/state zooms; only
    // switch to finer detail when genuinely zoomed into metro or street level.
    if (z < 9) return 4;   // continent → state → regional (large cells)
    if (z < 13) return 6;  // metro / city overview (medium cells)
    return 9;              // neighbourhood / street detail (fine cells)
  }, [viewState.zoom]);

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
    setHoveredInfra: handleHoveredInfra,
    setSelectedInfra: (info: unknown) => {
      if (!isInfraPickInfo(info) || !info.object) return;

      const props = info.object.properties || {};
      const isOutage =
        props.entity_type === "outage" || info.object.type === "outage";
      const isNwsAlert =
        props.event !== undefined || props.headline !== undefined;
      const isTower =
        info.object.type === "tower" || props.entity_type === "tower";
      const isBuoy = props.buoy_id !== undefined;
      const isISS = props.entity_type === "iss";
      const isAirspace = props.zone_id !== undefined;
      const entityType = isBuoy
        ? "buoy"
        : isTower
          ? "tower"
          : isNwsAlert
            ? "nws_alert"
          : isOutage
            ? "outage"
          : isISS
            ? "iss"
          : isAirspace
            ? "airspace"
            : "infra";
      const callsign = String(
        props.name ||
          props.buoy_id ||
          props.event ||
          props.headline ||
          props.region ||
          props.fcc_id ||
          (isOutage
            ? "INTERNET OUTAGE"
            : isTower
              ? "FCC TOWER"
              : isAirspace
                ? "AIRSPACE ZONE"
                : "INFRA"),
      );

      const infraEntity: CoTEntity = {
        uid: String(
          props.id || props.buoy_id || info.object.id || `infra-${Date.now()}`,
        ),
        lat: info.coordinate?.[1] || 0,
        lon: info.coordinate?.[0] || 0,
        altitude: 0,
        type: entityType,
        course: 0,
        speed: 0,
        callsign,
        lastSeen: Date.now(),
        trail: [],
        uidHash: 0,
        detail: info.object,
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
    kiwiNodeRef,
    rfSitesRef,
    showRepeaters,
    worldCountriesData,
    cablesData,
    stationsData,
    outagesData,
    towersData,
    auroraData,
    jammingData,
    gdeltData,
    buoyData,
    nwsAlertsData,
    ixpData,
    facilityData,
    issPosition,
    issTrack,
    gdeltToneThreshold:
      typeof filters?.gdeltToneThreshold === "number"
        ? filters.gdeltToneThreshold
        : undefined,
    historySegmentsRef,
    holdingPatternData,
    airspaceZonesData,
    h3RiskResolution,
  });

  // Map Camera: projection, graticule, 3D terrain/fog
  const { setViewMode, handleAdjustCamera, handleResetCompass } = useMapCamera({
    mapRef,
    mapInstanceRef,
    mapLoaded,
    globeMode,
    enable3d,
    setEnable3d,
    mapToken: mapToken || "",
    mapStyleMode,
  });

  // Mission Area Handlers that bridge to context menu UI

  const handleContextMenu = useCallback((e: any) => {
    e.preventDefault();
    const { lngLat, point } = e;
    setContextMenuPos({ x: point.x, y: point.y });
    setContextMenuCoords({ lat: lngLat.lat, lon: lngLat.lng });
  }, []);

  const handleSaveLocation = useCallback(
    (lat: number, lon: number) => {
      setSaveFormCoords({ lat, lon });
      setShowSaveForm(true);
      setContextMenuPos(null);
    },
    [setSaveFormCoords, setShowSaveForm],
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
  }, [mapLoaded, onMapActionsReady, entitiesRef]);

  return (
    <>
      {/* Star field rendered behind the map canvas. In globe mode the sky
          atmosphere layer is subtly transparent, leaving the WebGL canvas 
          transparent outside the globe sphere so the star field shows through. */}
      <StarField active={!!globeMode} />

      {/* z-index:1 ensures the map canvas stacks above the StarField (z-index:0) */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100vw",
          height: "100vh",
        }}
      >
        <Suspense fallback={null}>
          <MapComponent
            key={globeMode ? "map-globe" : "map-mercator"}
            ref={mapRef as React.Ref<unknown>}
            showAttribution={false}
            viewState={
              globeMode ? { ...viewState, pitch: 0, bearing: 0 } : viewState
            }
            onLoad={handleMapLoad}
            onMove={(evt: unknown) => {
              const moveEvt = evt as {
                target?: { getBounds?: () => unknown };
                originalEvent?: unknown;
                viewState?: Partial<typeof viewState>;
              };

              if (onBoundsChange && moveEvt.target?.getBounds) {
                const bounds = moveEvt.target.getBounds() as {
                  getSouth?: () => number;
                  getNorth?: () => number;
                  getWest?: () => number;
                  getEast?: () => number;
                };
                if (
                  bounds &&
                  typeof bounds.getSouth === "function" &&
                  typeof bounds.getNorth === "function" &&
                  typeof bounds.getWest === "function" &&
                  typeof bounds.getEast === "function"
                ) {
                  onBoundsChange({
                    minLat: bounds.getSouth(),
                    maxLat: bounds.getNorth(),
                    minLon: bounds.getWest(),
                    maxLon: bounds.getEast(),
                  });
                }
              }
              // If user interacts (drags/pans), disable Follow Mode to prevent fighting.
              if (
                moveEvt.originalEvent &&
                followModeRef.current &&
                onFollowModeChange
              ) {
                followModeRef.current = false; // Instant kill before next frame
                onFollowModeChange(false);
              }

              const nextViewState = {
                latitude: moveEvt.viewState?.latitude ?? viewState.latitude,
                longitude: moveEvt.viewState?.longitude ?? viewState.longitude,
                zoom: moveEvt.viewState?.zoom ?? viewState.zoom,
                pitch: moveEvt.viewState?.pitch ?? viewState.pitch,
                bearing: moveEvt.viewState?.bearing ?? viewState.bearing,
              };
              if (globeMode) {
                // Lock pitch/bearing to 0 in state
                nextViewState.pitch = 0;
                nextViewState.bearing = 0;
              }
              setViewState(nextViewState);
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
            onContextMenu={handleContextMenu}
            onClick={() => {
              setContextMenuPos(null);
              setContextMenuCoords(null);
            }}
            antialias={true}
            projection={globeMode ? { type: "globe" } : { type: "mercator" }}
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
      </div>

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
        onSetStyleMode={(mode) => setMapStyleMode(mode as "dark" | "satellite")}
        onZoomIn={() => mapRef.current?.getMap().zoomIn()}
        onZoomOut={() => mapRef.current?.getMap().zoomOut()}
        onAdjustBearing={(delta) => handleAdjustCamera("bearing", delta)}
        onResetNorth={handleResetCompass}
        onAdjustPitch={(delta) => handleAdjustCamera("pitch", delta)}
      />

      <MapContextMenu
        position={contextMenuPos}
        coordinates={contextMenuCoords}
        onSetFocus={handleSetFocus}
        onSaveLocation={handleSaveLocation}
        onReturnHome={handleReturnHome}
        onAnalyzeRegionalRisk={onAnalyzeRegionalRisk}
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
      <RFLegend visible={!!showRepeaters} />

      {/* NWS Alerts HUD — top-right, fires onEvent for AOT-intersecting Severe/Extreme alerts */}
      {filters?.showNWSAlerts !== false && (
        <div
          style={{
            position: "absolute",
            top: 70,
            right: selectedEntity ? 380 : 20,
            zIndex: 100,
            pointerEvents: "none",
            transition: "right 0.3s ease-in-out",
          }}
        >
          <div style={{ pointerEvents: "auto" }}>
            <NWSAlertsWidget
              nwsAlerts={nwsAlertsData ?? null}
              mission={currentMission}
              onEvent={onEvent}
            />
          </div>
        </div>
      )}
    </>
  );
}

export default TacticalMap;
