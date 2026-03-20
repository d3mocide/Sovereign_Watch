import React, { useEffect, useRef, MutableRefObject } from "react";
import { CoTEntity, HistorySegment, JS8Station, RFSite, DRState, VisualState, GroundTrackPoint } from "../types";
import { H3CellData } from "../layers/buildH3CoverageLayer";
import { getCompensatedCenter } from "../utils/map/geoUtils";
import { filterEntity, filterSatellite } from "../utils/filters";
import { interpolatePVB } from "../utils/interpolation";
import { composeAllLayers } from "../layers/composition";
import type { MapboxOverlay } from "@deck.gl/mapbox";
import type { MapRef } from "react-map-gl/maplibre";

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
  cablesData?: any;
  stationsData?: any;
  outagesData?: any;
  towersData?: any[];
  setHoveredInfra?: (info: any) => void;
  setSelectedInfra?: (info: any) => void;
  worldCountriesData?: any;
  globeMode: boolean | undefined;
  enable3d: boolean;
  mapLoaded: boolean;
  replayMode: boolean | undefined;
  onCountsUpdate: ((counts: { air: number; sea: number; orbital: number }) => void) | undefined;
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
  kiwiNodeRef?: MutableRefObject<{ lat: number; lon: number; host: string } | null>;
  showRepeaters?: boolean;
  predictedGroundTrackRef?: MutableRefObject<GroundTrackPoint[]>;
  /** Observer position for the orbital AOI ring. radiusKm is the pass-prediction horizon. */
  observerRef?: MutableRefObject<{ lat: number; lon: number; radiusKm: number } | null>;
  /** Historical track segments loaded by TrackHistoryPanel — rendered as a PathLayer */
  historySegmentsRef?: MutableRefObject<HistorySegment[]>;
}

/** Returns true if the satellite should be visible given the current filters. */

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
  showRepeaters,
  predictedGroundTrackRef,
  observerRef,
  currentMissionRef,
  worldCountriesData,
  historySegmentsRef,
}: UseAnimationLoopOptions): void {
  const lastFrameTimeRef = useRef<number>(0);
  useEffect(() => {
    lastFrameTimeRef.current = Date.now();
  }, []);

  const rafRef = useRef<number>();

  const countryOutageMap = React.useMemo(() => {
    if (!outagesData || !outagesData.features) return {};
    const map: Record<string, any> = {};
    outagesData.features.forEach((f: any) => {
      const countryCode = f.properties?.country_code;
      if (countryCode) {
        const current = map[countryCode];
        if (!current || (f.properties?.severity || 0) > (current.severity || 0)) {
          map[countryCode] = f.properties;
        }
      }
    });
    return map;
  }, [outagesData]);

  // Optional: Add H3 Coverage State in the hook
  const [h3Cells, setH3Cells] = React.useState<H3CellData[]>([]);

  useEffect(() => {
    // Only fetch if enabled
    if (!filters?.showH3Coverage) return;

    const fetchCells = async () => {
      try {
        const response = await fetch('/api/debug/h3_cells');
        if (response.ok) {
          const data = await response.json();
          setH3Cells(data);
        }
      } catch (err) {
        console.error('Failed to fetch H3 cells:', err);
      }
    };

    fetchCells();
    const interval = setInterval(fetchCells, 5000);

    return () => clearInterval(interval);
  }, [filters?.showH3Coverage]);

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
      let orbitalCount = 0;
      const staleUids: string[] = [];
      const interpolated: CoTEntity[] = [];

      if (replayMode) {
        // REPLAY MODE: Render static snapshots from parent
        for (const [, entity] of replayEntitiesRef.current) {
          const entityType = filterEntity(entity, filters);
          if (!entityType) continue;
          if (entityType === 'sea') seaCount++;
          else airCount++;
          interpolated.push(entity);
        }
      } else {
        for (const [uid, entity] of entities) {
          const isShip = entity.type?.includes("S");
          const threshold = isShip
            ? STALE_THRESHOLD_SEA_MS
            : STALE_THRESHOLD_AIR_MS;

          // Stale check
          if (now - entity.lastSeen > threshold) {
            staleUids.push(uid);
            continue;
          }

          // Filter
          const entityType = filterEntity(entity, filters);
          if (!entityType) continue;
          if (entityType === 'sea') seaCount++;
          else airCount++;

          // Interpolate
          const dr = drStateRef.current.get(uid);
          const visual = visualStateRef.current.get(uid);
          
          const { visual: newVisual, interpolatedEntity } = interpolatePVB(
            entity,
            dr,
            visual,
            now,
            dt
          );

          visualStateRef.current.set(uid, newVisual);
          interpolated.push(interpolatedEntity);

          // Update Selected Entity Data (Live Sidebar) - Sync with interpolation
          const currentSelected = selectedEntityRef.current;
          if (
            currentSelected &&
            uid === currentSelected.uid &&
            onEntityLiveUpdate
          ) {
            if (Math.floor(now / 33) % 2 === 0) {
              onEntityLiveUpdate(interpolatedEntity);
            }
          }
        }
      }

      // FOLLOW MODE: Imperative Sync in Animation Loop (Post-Interpolation)
      // This ensures the camera moves EXACTLY with the interpolated selection
      // Preventing "rubber banding" or jitter.
      // Executed ONCE per frame, not per entity.
      const currentSelected = selectedEntityRef.current;
      if (mapRef.current) {
        const map = mapRef.current.getMap();
        const isUserInteracting =
          map.dragPan.isActive() ||
          map.scrollZoom.isActive() ||
          map.touchZoomRotate.isActive() ||
          map.dragRotate.isActive();

        // 1. Auto-disable follow mode if user enters interaction
        // Grace period: 3 seconds to allow FlyTo to finish
        const gracePeriodActive =
          Date.now() - lastFollowEnableRef.current < 3000;

        if (isUserInteracting && followModeRef.current && !gracePeriodActive) {
          // console.log("User interaction detected - Disabling Follow Mode", ...);
          followModeRef.current = false;
          onFollowModeChange?.(false);
        }

        // 2. Execute Follow Mode (if valid)
        if (followModeRef.current) {
          if (currentSelected) {
            const visual = visualStateRef.current.get(currentSelected.uid);

            if (visual) {
              if (isUserInteracting && !gracePeriodActive) {
                // User is panning/zooming intentionally.
              } else if (map.isEasing()) {
                // Wait for ease
              } else {
                // DO IT
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

      // Deferred stale cleanup (don't delete during iteration)
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

          onEvent?.({
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

      // Count Orbitals (Satellites)
      for (const [, sat] of satellitesRef.current) {
        if (filterSatellite(sat, filters)) orbitalCount++;
      }

      if (
        (airCount > 0 || seaCount > 0 || orbitalCount > 0 || (countsRef.current.air === 0 && countsRef.current.sea === 0 && countsRef.current.orbital === 0)) &&
        (countsRef.current.air !== airCount ||
          countsRef.current.sea !== seaCount ||
          countsRef.current.orbital !== orbitalCount)
      ) {
        countsRef.current = {
          air: airCount,
          sea: seaCount,
          orbital: orbitalCount,
        };
        onCountsUpdate?.({
          air: airCount,
          sea: seaCount,
          orbital: orbitalCount,
        });
      }

      // 4. Update Layers

      const filteredSatellites: CoTEntity[] = [];
      for (const [uid, sat] of satellitesRef.current.entries()) {
        if (!filterSatellite(sat, filters)) continue;

        const dr = drStateRef.current.get(uid);
        const visual = visualStateRef.current.get(uid);

        const { visual: newVisual, interpolatedEntity } = interpolatePVB(
          sat,
          dr,
          visual,
          now,
          dt
        );

        visualStateRef.current.set(uid, newVisual);
        filteredSatellites.push(interpolatedEntity);

        // Live Sidebar Update
        if (selectedEntity?.uid === uid) {
          onEntityLiveUpdate?.(interpolatedEntity);
        }
      }

      const zoom = mapRef.current?.getMap()?.getZoom() ?? 0;

      const layers = composeAllLayers({
        interpolatedEntities: interpolated,
        filteredSatellites,
        js8Stations: js8StationsRef ? Array.from(js8StationsRef.current.values()) : [],
        rfSites: rfSitesRef?.current || [],
        h3Cells,
        cablesData,
        stationsData,
        outagesData,
        towersData,
        worldCountriesData,
        countryOutageMap,
        currentSelected,
        hoveredEntity,
        filters,
        globeMode: !!globeMode,
        enable3d,
        zoom,
        now,
        ownGrid: ownGridRef?.current || null,
        kiwiNode: kiwiNodeRef?.current || null,
        historyTails: historyTailsRef.current,
        velocityVectors: velocityVectorsRef.current,
        predictedGroundTrack: predictedGroundTrackRef?.current,
        observer: observerRef?.current,
        currentMission: currentMissionRef.current,
        aotShapes,
        onEntitySelect,
        setHoveredEntity,
        setHoverPosition,
        setHoveredInfra: setHoveredInfra || (() => {}),
        setSelectedInfra: setSelectedInfra || (() => {}),
        historySegments: historySegmentsRef?.current,
      });

      if (mapLoaded && overlayRef.current?.setProps) {
        overlayRef.current.setProps({ 
          layers,
          onHover: (info: any) => {
            if (!info.object) {
              setHoveredEntity(null);
              setHoverPosition(null);
            }
          }
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
  }, [
    onCountsUpdate,
    filters,
    onEvent,
    onEntitySelect,
    mapLoaded,
    enable3d,
    replayMode,
    onEntityLiveUpdate,
    globeMode,
    aotShapes,
    hoveredEntity,
    selectedEntity,
    onFollowModeChange,
    showRepeaters,
    cablesData,
    stationsData,
    outagesData,
    towersData,
    worldCountriesData,
  ]);
}
