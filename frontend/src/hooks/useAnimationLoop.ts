import type { PickingInfo } from "@deck.gl/core";
import type { MapboxOverlay } from "@deck.gl/mapbox";
import type { FeatureCollection } from "geojson";
import React, { MutableRefObject, useEffect, useRef } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import {
  processEntityFrame,
  processReplayFrame,
} from "../engine/EntityFilterEngine";
import { processSatelliteFrame } from "../engine/EntityPositionInterpolator";
import { fetchH3Risk, H3RiskCellData } from "../api/h3Risk";
import { fetchClusters, ClusterInfo } from "../api/clusters";
import { latLngToCell } from "h3-js";
import { H3CellData } from "../layers/buildH3CoverageLayer";
import { composeAllLayers } from "../layers/composition";
import {
  CoTEntity,
  DRState,
  GroundTrackPoint,
  HistorySegment,
  ISSPosition,
  JS8Station,
  RFSite,
  SatNOGSStation,
  Tower,
  VisualState,
} from "../types";
import { getCompensatedCenter } from "../utils/map/geoUtils";

interface UseAnimationLoopOptions {
  entitiesRef: MutableRefObject<Map<string, CoTEntity>>;
  satellitesRef: MutableRefObject<Map<string, CoTEntity>>;
  knownUidsRef: MutableRefObject<Set<string>>;
  drStateRef: MutableRefObject<Map<string, DRState>>;
  visualStateRef: MutableRefObject<Map<string, VisualState>>;
  prevCourseRef: MutableRefObject<Map<string, number>>;
  alertedEmergencyRef?: MutableRefObject<Map<string, string>>;
  countsRef: MutableRefObject<{ air: number; sea: number; orbital: number }>;
  currentMissionRef: MutableRefObject<{
    lat: number;
    lon: number;
    radius_nm: number;
  } | null>;
  selectedEntityRef: MutableRefObject<CoTEntity | null>;
  followModeRef: MutableRefObject<boolean>;
  lastFollowEnableRef: MutableRefObject<number>;
  velocityVectorsRef: MutableRefObject<boolean>;
  historyTailsRef: MutableRefObject<boolean>;
  replayEntitiesRef: MutableRefObject<Map<string, CoTEntity>>;
  mapRef: MutableRefObject<MapRef | null>;
  overlayRef: MutableRefObject<MapboxOverlay | null>;
  hoveredEntity: CoTEntity | null;
  setHoveredEntity: (entity: CoTEntity | null) => void;
  setHoverPosition: (pos: { x: number; y: number } | null) => void;
  aotShapes: { maritime: number[][]; aviation: number[][] } | null;
  selectedEntity: CoTEntity | null;
  filters: import("../types").MapFilters | undefined;
  cablesData?: FeatureCollection | null;
  stationsData?: FeatureCollection | null;
  outagesData?: FeatureCollection | null;
  towersData?: Tower[];
  /** NOAA aurora 1-hour forecast GeoJSON (from /api/space-weather/aurora) */
  auroraData?: any;
  /** Active GPS jamming zones GeoJSON (from /api/jamming/active) */
  jammingData?: any;
  /** GDELT v2 geolocated news events GeoJSON (from /api/gdelt/events) */
  gdeltData?: any;
  /** Active NWS alerts GeoJSON (from /api/infra/nws-alerts) */
  nwsAlertsData?: FeatureCollection | null;
  /** Minimum tone threshold for GDELT; default -Infinity (all events) */
  gdeltToneThreshold?: number;
  /** NDBC Ocean Buoy latest observations GeoJSON (Phase 1 Geospatial) */
  buoyData?: FeatureCollection | null;
  /** PeeringDB Internet Exchange Points GeoJSON (Initiative B) */
  ixpData?: FeatureCollection | null;
  /** PeeringDB Data Center Facilities GeoJSON (Initiative B) */
  facilityData?: FeatureCollection | null;
  /** Current ISS position (Initiative B real-time tracker) */
  issPosition?: ISSPosition | null;
  /** ISS ground track ring buffer (Initiative B real-time tracker) */
  issTrack?: ISSPosition[];
  setHoveredInfra?: (info: unknown) => void;
  setSelectedInfra?: (info: unknown) => void;
  worldCountriesData?: FeatureCollection | null;
  globeMode: boolean | undefined;
  enable3d: boolean;
  mapLoaded: boolean;
  replayMode: boolean | undefined;
  onCountsUpdate:
    | ((counts: { air: number; sea: number; orbital: number }) => void)
    | undefined;
  onEvent:
    | ((event: {
        type: "new" | "lost" | "alert";
        message: string;
        entityType?: "air" | "sea" | "orbital";
      }) => void)
    | undefined;
  onEntitySelect: (entity: CoTEntity | null) => void;
  onEntityLiveUpdate: ((entity: CoTEntity) => void) | undefined;
  onFollowModeChange: ((enabled: boolean) => void) | undefined;
  js8StationsRef?: MutableRefObject<Map<string, JS8Station>>;
  ownGridRef?: MutableRefObject<string>;
  rfSitesRef?: MutableRefObject<RFSite[]>;
  kiwiNodeRef?: MutableRefObject<{
    lat: number;
    lon: number;
    host: string;
  } | null>;
  showRepeaters?: boolean;
  predictedGroundTrackRef?: MutableRefObject<GroundTrackPoint[]>;
  /** Observer position for the orbital AOI ring. radiusKm is the pass-prediction horizon. */
  observerRef?: MutableRefObject<{
    lat: number;
    lon: number;
    radiusKm: number;
  } | null>;
  /** Historical track segments loaded by TrackHistoryPanel — rendered as a PathLayer */
  historySegmentsRef?: MutableRefObject<HistorySegment[]>;
  satnogsStationsRef?: MutableRefObject<SatNOGSStation[]>;
  /** Aviation holding pattern GeoJSON (from /api/holding-patterns/active) */
  holdingPatternData?: FeatureCollection | null;
  /** H3 resolution tier (4/6/9) derived from map zoom; drives risk layer refetch */
  h3RiskResolution?: number;
}

export function useAnimationLoop({
  entitiesRef,
  satellitesRef,
  knownUidsRef,
  drStateRef,
  visualStateRef,
  prevCourseRef,
  alertedEmergencyRef,
  countsRef,
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
  towersData,
  auroraData,
  jammingData,
  gdeltData,
  nwsAlertsData,
  gdeltToneThreshold,
  buoyData,
  ixpData,
  facilityData,
  issPosition,
  issTrack,
  setHoveredInfra,
  setSelectedInfra,
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
  kiwiNodeRef,
  predictedGroundTrackRef,
  observerRef,
  currentMissionRef,
  worldCountriesData,
  historySegmentsRef,
  satnogsStationsRef,
  holdingPatternData,
  h3RiskResolution,
}: UseAnimationLoopOptions): void {
  const lastFrameTimeRef = useRef<number>(0);
  useEffect(() => {
    lastFrameTimeRef.current = Date.now();
  }, []);

  const rafRef = useRef<number | null>(null);

  // ── Inline ref-sync ───────────────────────────────────────────────────────
  // Assigned at render time (no useEffect) so the stable rAF loop (deps:[])
  // always reads the latest prop/state values without triggering restarts.
  const hoveredEntityRef = useRef(hoveredEntity);
  hoveredEntityRef.current = hoveredEntity;

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const selectedEntityStateRef = useRef(selectedEntity);
  selectedEntityStateRef.current = selectedEntity;

  const globeModeRef = useRef(globeMode);
  globeModeRef.current = globeMode;

  const enable3dRef = useRef(enable3d);
  enable3dRef.current = enable3d;

  const mapLoadedRef = useRef(mapLoaded);
  mapLoadedRef.current = mapLoaded;

  const replayModeRef = useRef(replayMode);
  replayModeRef.current = replayMode;

  const aotShapesRef = useRef(aotShapes);
  aotShapesRef.current = aotShapes;

  const cablesDataRef = useRef(cablesData);
  cablesDataRef.current = cablesData;

  const stationsDataRef = useRef(stationsData);
  stationsDataRef.current = stationsData;

  const outagesDataRef = useRef(outagesData);
  outagesDataRef.current = outagesData;

  const towersDataRef = useRef(towersData);
  towersDataRef.current = towersData;

  const auroraDataRef = useRef(auroraData);
  auroraDataRef.current = auroraData;

  const jammingDataRef = useRef(jammingData);
  jammingDataRef.current = jammingData;

  const gdeltDataRef = useRef(gdeltData);
  gdeltDataRef.current = gdeltData;

  const nwsAlertsDataRef = useRef(nwsAlertsData);
  nwsAlertsDataRef.current = nwsAlertsData;

  const gdeltToneThresholdRef = useRef(gdeltToneThreshold);
  gdeltToneThresholdRef.current = gdeltToneThreshold;

  const buoyDataRef = useRef(buoyData);
  buoyDataRef.current = buoyData;

  const ixpDataRef = useRef(ixpData);
  ixpDataRef.current = ixpData;

  const facilityDataRef = useRef(facilityData);
  facilityDataRef.current = facilityData;

  const issPositionRef = useRef(issPosition);
  issPositionRef.current = issPosition;

  const issTrackRef = useRef(issTrack);
  issTrackRef.current = issTrack;

  const worldCountriesDataRef = useRef(worldCountriesData);
  worldCountriesDataRef.current = worldCountriesData;

  const holdingPatternDataRef = useRef(holdingPatternData);
  holdingPatternDataRef.current = holdingPatternData;

  const onCountsUpdateRef = useRef(onCountsUpdate);
  onCountsUpdateRef.current = onCountsUpdate;

  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const onEntitySelectRef = useRef(onEntitySelect);
  onEntitySelectRef.current = onEntitySelect;

  const onEntityLiveUpdateRef = useRef(onEntityLiveUpdate);
  onEntityLiveUpdateRef.current = onEntityLiveUpdate;

  const onFollowModeChangeRef = useRef(onFollowModeChange);
  onFollowModeChangeRef.current = onFollowModeChange;

  const setHoveredEntityRef = useRef(setHoveredEntity);
  setHoveredEntityRef.current = setHoveredEntity;

  const setHoverPositionRef = useRef(setHoverPosition);
  setHoverPositionRef.current = setHoverPosition;

  const setHoveredInfraRef = useRef(setHoveredInfra);
  setHoveredInfraRef.current = setHoveredInfra;

  const setSelectedInfraRef = useRef(setSelectedInfra);
  setSelectedInfraRef.current = setSelectedInfra;

  // Stable overlay hover handler — defined once so setProps doesn't receive a new
  // function reference every frame. Accesses setters via their refs (always current).
  const onOverlayHoverRef = useRef((info: PickingInfo) => {
    if (!info.object) {
      setHoveredEntityRef.current(null);
      setHoverPositionRef.current(null);
    }
  });

  // JS8 station array cache — avoids Array.from(Map.values()) on every frame.
  // Rebuilt only when the Map's size changes (stations join/leave infrequently).
  const js8StationsArrayRef = useRef<import("../types").JS8Station[]>([]);
  const js8StationsSizeRef = useRef<number>(0);

  const countryOutageMap = React.useMemo(() => {
    if (!outagesData || !outagesData.features) return {};
    const map: Record<string, Record<string, unknown>> = {};
    outagesData.features.forEach((f) => {
      const props = f.properties as Record<string, unknown> | null;
      const countryCode = props?.country_code as string | undefined;
      if (countryCode) {
        const current = map[countryCode];
        if (
          !current ||
          ((props?.severity as number) || 0) >
            ((current.severity as number) || 0)
        ) {
          map[countryCode] = props ?? {};
        }
      }
    });
    return map;
  }, [outagesData]);

  const countryOutageMapRef = useRef(countryOutageMap);
  countryOutageMapRef.current = countryOutageMap;

  const [h3Cells, setH3Cells] = React.useState<H3CellData[]>([]);
  const h3CellsRef = useRef(h3Cells);
  h3CellsRef.current = h3Cells;

  useEffect(() => {
    // Only fetch if enabled
    if (!filters?.showH3Coverage) return;

    const fetchCells = async () => {
      try {
        const response = await fetch("/api/debug/h3_cells");
        if (response.ok) {
          const data = await response.json();
          setH3Cells(data);
        }
      } catch (err) {
        console.error("Failed to fetch H3 cells:", err);
      }
    };

    fetchCells();
    const interval = setInterval(fetchCells, 5000);

    return () => clearInterval(interval);
  }, [filters?.showH3Coverage]);

  const [h3RiskCells, setH3RiskCells] = React.useState<H3RiskCellData[]>([]);
  const h3RiskCellsRef = useRef(h3RiskCells);
  h3RiskCellsRef.current = h3RiskCells;

  useEffect(() => {
    if (!filters?.showH3Risk) {
      setH3RiskCells([]);
      return;
    }
    const res = h3RiskResolution ?? 6;
    let cancelled = false;
    const load = async () => {
      const cells = await fetchH3Risk(res);
      if (!cancelled) setH3RiskCells(cells);
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [filters?.showH3Risk, h3RiskResolution]);

  // ── ST-DBSCAN cluster data (Phase 2) ─────────────────────────────────────
  const [clusterData, setClusterData] = React.useState<ClusterInfo[]>([]);
  const clusterDataRef = useRef(clusterData);
  clusterDataRef.current = clusterData;

  useEffect(() => {
    if (!filters?.showClusters) {
      setClusterData([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const center = mapRef.current?.getMap()?.getCenter();
      if (!center) return;
      const h3Cell = latLngToCell(center.lat, center.lng, 7);
      const resp = await fetchClusters(h3Cell);
      if (!cancelled) setClusterData(resp.clusters);
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [filters?.showClusters]);

  useEffect(() => {
    const animate = () => {
      const entities = entitiesRef.current;
      const now = Date.now();
      const dt = Math.min(now - lastFrameTimeRef.current, 100);
      lastFrameTimeRef.current = now;

      const _filters = filtersRef.current;
      const _replayMode = replayModeRef.current;
      const _onEntityLiveUpdate = onEntityLiveUpdateRef.current;

      // ── Entity pass (filter + interpolate) ───────────────────────────────
      let airCount: number;
      let seaCount: number;
      let interpolated: CoTEntity[];
      let staleUids: string[] = [];

      if (_replayMode) {
        const result = processReplayFrame(replayEntitiesRef.current, _filters);
        airCount = result.airCount;
        seaCount = result.seaCount;
        interpolated = result.interpolated;
      } else {
        const result = processEntityFrame(
          entities,
          drStateRef.current,
          visualStateRef.current,
          _filters,
          now,
          dt,
        );
        airCount = result.airCount;
        seaCount = result.seaCount;
        interpolated = result.interpolated;
        staleUids = result.staleUids;

        // Live sidebar update for selected entity (throttled to ~30 fps)
        const currentSelected = selectedEntityRef.current;
        if (
          currentSelected &&
          _onEntityLiveUpdate &&
          Math.floor(now / 33) % 2 === 0
        ) {
          const updatedSelected = interpolated.find(
            (e) => e.uid === currentSelected.uid,
          );
          if (updatedSelected) _onEntityLiveUpdate(updatedSelected);
        }
      }

      // ── Follow mode (post-interpolation camera sync) ──────────────────────
      const currentSelected = selectedEntityRef.current;
      if (mapRef.current) {
        const map = mapRef.current.getMap();
        const isUserInteracting =
          map.dragPan.isActive() ||
          map.scrollZoom.isActive() ||
          map.touchZoomRotate.isActive() ||
          map.dragRotate.isActive();

        // Auto-disable follow mode if user enters interaction
        // Grace period: 3 seconds to allow FlyTo to finish
        const gracePeriodActive =
          Date.now() - lastFollowEnableRef.current < 3000;

        if (isUserInteracting && followModeRef.current && !gracePeriodActive) {
          followModeRef.current = false;
          onFollowModeChangeRef.current?.(false);
        }

        if (followModeRef.current) {
          if (currentSelected) {
            const visual = visualStateRef.current.get(currentSelected.uid);

            if (visual) {
              if (isUserInteracting && !gracePeriodActive) {
                // User is panning/zooming intentionally.
              } else if (map.isEasing()) {
                // Wait for ease
              } else {
                try {
                  const [centerLon, centerLat] = getCompensatedCenter(
                    visual.lat,
                    visual.lon,
                    visual.alt,
                    map,
                  );
                  map.jumpTo({
                    center: [centerLon, centerLat],
                  });
                } catch (e) {
                  console.error("FollowMode jumpTo failed:", e);
                }
              }
            }
          }
        }
      }

      // ── Deferred stale cleanup ────────────────────────────────────────────
      for (const uid of staleUids) {
        const entity = entities.get(uid);
        if (entity) {
          const isShip = entity.type?.includes("S");
          const vc = entity.vesselClassification;
          let prefix = isShip ? "🚢" : "✈️";
          let tags = "";
          let dims = "";

          if (isShip && vc) {
            const cat = vc?.category;
            if (cat === "tanker") {
              prefix = "⛽";
            } else if (cat === "fishing") {
              prefix = "🎣";
            } else if (cat === "pleasure") {
              prefix = "⛵";
            } else if (cat === "military") {
              prefix = "⚓";
            } else if (cat === "cargo") {
              prefix = "🚢";
            } else if (cat === "passenger") {
              prefix = "🚢";
            } else if (cat === "law_enforcement") {
              prefix = "⚓";
            } else if (cat === "tug") {
              prefix = "⛴️";
            }

            if (vc.length && vc.length > 0) {
              dims = ` — ${vc.length}m`;
            }
          } else if (!isShip && entity.classification) {
            const ac = entity.classification;
            if (ac.platform === "helicopter") {
              prefix = "🚁";
            } else if (ac.platform === "drone" || ac.platform === "uav") {
              prefix = "🛸";
            } else if (ac.affiliation === "military") {
              prefix = "🦅";
            } else if (ac.affiliation === "government") {
              prefix = "🏛️";
            } else {
              prefix = "✈️";
            }

            if (ac.icaoType) {
              tags += `[${ac.icaoType}] `;
            } else if (ac.operator) {
              tags += `[${ac.operator.slice(0, 10).toUpperCase()}] `;
            }
          }

          onEventRef.current?.({
            type: "lost",
            message: `${prefix} ${tags}${entity.callsign || uid}${dims}`,
            entityType: isShip ? "sea" : "air",
          });
        }
        entities.delete(uid);
        knownUidsRef.current.delete(uid);
        prevCourseRef.current.delete(uid);
        drStateRef.current.delete(uid);
        visualStateRef.current.delete(uid);
        alertedEmergencyRef?.current.delete(uid);
      }

      // ── Satellite pass (filter + interpolate) ─────────────────────────────
      // processSatelliteFrame filters internally; derive orbitalCount from the
      // result to avoid a second O(n) walk through satellitesRef.
      const filteredSatellites = processSatelliteFrame(
        satellitesRef.current,
        drStateRef.current,
        visualStateRef.current,
        _filters,
        now,
        dt,
      );

      const orbitalCount = filteredSatellites.length;

      if (
        (airCount > 0 ||
          seaCount > 0 ||
          orbitalCount > 0 ||
          (countsRef.current.air === 0 &&
            countsRef.current.sea === 0 &&
            countsRef.current.orbital === 0)) &&
        (countsRef.current.air !== airCount ||
          countsRef.current.sea !== seaCount ||
          countsRef.current.orbital !== orbitalCount)
      ) {
        countsRef.current = {
          air: airCount,
          sea: seaCount,
          orbital: orbitalCount,
        };
        onCountsUpdateRef.current?.({
          air: airCount,
          sea: seaCount,
          orbital: orbitalCount,
        });
      }

      // Live sidebar update for selected satellite
      const _selectedEntityState = selectedEntityStateRef.current;
      if (_selectedEntityState) {
        const updatedSat = filteredSatellites.find(
          (s) => s.uid === _selectedEntityState.uid,
        );
        if (updatedSat) _onEntityLiveUpdate?.(updatedSat);
      }

      // ── Layer composition + overlay update ───────────────────────────────
      const zoom = mapRef.current?.getMap()?.getZoom() ?? 0;

      // Update JS8 stations cache only when the Map size changes
      const currentJs8Size = js8StationsRef?.current.size ?? 0;
      if (currentJs8Size !== js8StationsSizeRef.current) {
        js8StationsArrayRef.current = js8StationsRef
          ? Array.from(js8StationsRef.current.values())
          : [];
        js8StationsSizeRef.current = currentJs8Size;
      }

      const layers = composeAllLayers({
        interpolatedEntities: interpolated,
        filteredSatellites,
        js8Stations: js8StationsArrayRef.current,
        rfSites: rfSitesRef?.current || [],
        h3Cells: h3CellsRef.current,
        h3RiskCells: h3RiskCellsRef.current,
        cablesData: cablesDataRef.current ?? null,
        stationsData: stationsDataRef.current ?? null,
        outagesData: outagesDataRef.current ?? null,
        towersData: towersDataRef.current ?? [],
        worldCountriesData: worldCountriesDataRef.current ?? null,
        countryOutageMap: countryOutageMapRef.current,
        currentSelected,
        hoveredEntity: hoveredEntityRef.current,
        filters: _filters,
        globeMode: !!globeModeRef.current,
        enable3d: enable3dRef.current,
        zoom,
        now,
        ownGrid: ownGridRef?.current || null,
        kiwiNode: kiwiNodeRef?.current || null,
        historyTails: historyTailsRef.current,
        velocityVectors: velocityVectorsRef.current,
        predictedGroundTrack: predictedGroundTrackRef?.current,
        observer: observerRef?.current,
        currentMission: currentMissionRef.current,
        aotShapes: aotShapesRef.current,
        auroraData: auroraDataRef.current,
        jammingData: jammingDataRef.current,
        gdeltData: gdeltDataRef.current,
        nwsAlertsData: nwsAlertsDataRef.current ?? null,
        gdeltToneThreshold: gdeltToneThresholdRef.current,
        buoyData: buoyDataRef.current ?? null,
        ixpData: ixpDataRef.current ?? null,
        facilityData: facilityDataRef.current ?? null,
        issPosition: issPositionRef.current ?? null,
        issTrack: issTrackRef.current ?? [],
        onEntitySelect: onEntitySelectRef.current,
        setHoveredEntity: setHoveredEntityRef.current,
        setHoverPosition: setHoverPositionRef.current,
        setHoveredInfra: setHoveredInfraRef.current || (() => {}),
        setSelectedInfra: setSelectedInfraRef.current || (() => {}),
        historySegments: historySegmentsRef?.current,
        satnogsStations: satnogsStationsRef?.current || [],
        holdingPatternData: holdingPatternDataRef.current,
        clusterData: clusterDataRef.current,
      });

      if (mapLoadedRef.current && overlayRef.current?.setProps) {
        overlayRef.current.setProps({
          layers,
          onHover: onOverlayHoverRef.current,
        });
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
  }, []); // stable — all volatile values accessed via inline-synced refs
}
