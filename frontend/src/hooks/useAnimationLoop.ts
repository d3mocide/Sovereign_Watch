import { useEffect, useRef, MutableRefObject } from "react";
import { CoTEntity, JS8Station, RepeaterStation } from "../types";
import { getCompensatedCenter, maidenheadToLatLon } from "../utils/map/geoUtils";
import { getOrbitalLayers } from "../layers/OrbitalLayer";
import { buildAOTLayers } from "../layers/buildAOTLayers";
import { buildTrailLayers } from "../layers/buildTrailLayers";
import { buildEntityLayers } from "../layers/buildEntityLayers";
import { buildJS8Layers } from "../layers/buildJS8Layers";
import { buildRepeaterLayers } from "../layers/buildRepeaterLayers";
import type { DeadReckoningState } from "./useEntityWorker";
import type { MapboxOverlay } from "@deck.gl/mapbox";
import type { MapRef } from "react-map-gl/maplibre";

interface UseAnimationLoopOptions {
  entitiesRef: MutableRefObject<Map<string, CoTEntity>>;
  satellitesRef: MutableRefObject<Map<string, CoTEntity>>;
  knownUidsRef: MutableRefObject<Set<string>>;
  drStateRef: MutableRefObject<Map<string, DeadReckoningState>>;
  visualStateRef: MutableRefObject<
    Map<string, { lon: number; lat: number; alt: number }>
  >;
  prevCourseRef: MutableRefObject<Map<string, number>>;
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
  filters: {
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
    showSatellites?: boolean;
    showSatGPS?: boolean;
    showSatWeather?: boolean;
    showSatComms?: boolean;
    showSatSurveillance?: boolean;
    showSatOther?: boolean;
    [key: string]: boolean | undefined;
  } | undefined;
  globeMode: boolean | undefined;
  enable3d: boolean;
  mapToken: string;
  mapStyle: string;
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
  repeatersRef?: MutableRefObject<RepeaterStation[]>;
  showRepeaters?: boolean;
}

export function useAnimationLoop({
  entitiesRef,
  satellitesRef,
  knownUidsRef,
  drStateRef,
  visualStateRef,
  prevCourseRef,
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
}: UseAnimationLoopOptions): void {
  const lastFrameTimeRef = useRef<number>(Date.now());
  const rafRef = useRef<number>();

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
          const isShip = entity.type?.includes("S");

          // Filter
          if (isShip) {
            if (!filters?.showSea) continue;
            if (entity.vesselClassification) {
              const cat = entity.vesselClassification.category;
              if (cat === "cargo" && filters?.showCargo === false) continue;
              if (cat === "tanker" && filters?.showTanker === false) continue;
              if (cat === "passenger" && filters?.showPassenger === false)
                continue;
              if (cat === "fishing" && filters?.showFishing === false) continue;
              if (cat === "military" && filters?.showSeaMilitary === false)
                continue;
              if (
                cat === "law_enforcement" &&
                filters?.showLawEnforcement === false
              )
                continue;
              if (cat === "sar" && filters?.showSar === false) continue;
              if (cat === "tug" && filters?.showTug === false) continue;
              if (cat === "pleasure" && filters?.showPleasure === false)
                continue;
              if (cat === "hsc" && filters?.showHsc === false) continue;
              if (cat === "pilot" && filters?.showPilot === false) continue;
              if (
                (cat === "special" || cat === "unknown") &&
                filters?.showSpecial === false
              )
                continue;
            }
            seaCount++;
          } else {
            if (!filters?.showAir) continue;
            if (entity.classification) {
              const cls = entity.classification;
              if (
                cls.platform === "helicopter" &&
                filters?.showHelicopter === false
              )
                continue;
              if (cls.platform === "drone" && filters?.showDrone === false)
                continue;
              if (
                cls.affiliation === "military" &&
                filters?.showMilitary === false
              )
                continue;
              if (
                cls.affiliation === "government" &&
                filters?.showGovernment === false
              )
                continue;
              if (
                cls.affiliation === "commercial" &&
                filters?.showCommercial === false
              )
                continue;
              if (
                cls.affiliation === "general_aviation" &&
                filters?.showPrivate === false
              )
                continue;
            }
            airCount++;
          }

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
          const threshold = isShip
            ? STALE_THRESHOLD_SEA_MS
            : STALE_THRESHOLD_AIR_MS;

          // Stale check
          if (now - entity.lastSeen > threshold) {
            staleUids.push(uid);
            continue;
          }

          // Filter
          if (isShip) {
            if (!filters?.showSea) continue;
            if (entity.vesselClassification) {
              const cat = entity.vesselClassification.category;
              if (cat === "cargo" && filters?.showCargo === false) continue;
              if (cat === "tanker" && filters?.showTanker === false) continue;
              if (cat === "passenger" && filters?.showPassenger === false)
                continue;
              if (cat === "fishing" && filters?.showFishing === false) continue;
              if (cat === "military" && filters?.showSeaMilitary === false)
                continue;
              if (
                cat === "law_enforcement" &&
                filters?.showLawEnforcement === false
              )
                continue;
              if (cat === "sar" && filters?.showSar === false) continue;
              if (cat === "tug" && filters?.showTug === false) continue;
              if (cat === "pleasure" && filters?.showPleasure === false)
                continue;
              if (cat === "hsc" && filters?.showHsc === false) continue;
              if (cat === "pilot" && filters?.showPilot === false) continue;
              if (
                (cat === "special" || cat === "unknown") &&
                filters?.showSpecial === false
              )
                continue;
            }
            seaCount++;
          } else {
            if (!filters?.showAir) continue;
            if (entity.classification) {
              const cls = entity.classification;
              if (
                cls.platform === "helicopter" &&
                filters?.showHelicopter === false
              )
                continue;
              if (cls.platform === "drone" && filters?.showDrone === false)
                continue;
              if (
                cls.affiliation === "military" &&
                filters?.showMilitary === false
              )
                continue;
              if (
                cls.affiliation === "government" &&
                filters?.showGovernment === false
              )
                continue;
              if (
                cls.affiliation === "commercial" &&
                filters?.showCommercial === false
              )
                continue;
              if (
                cls.affiliation === "general_aviation" &&
                filters?.showPrivate === false
              )
                continue;
            }
            airCount++;
          }

          // Interpolate
          // Projective Velocity Blending (PVB)
          const dr = drStateRef.current.get(uid);

          let targetLat = entity.lat;
          let targetLon = entity.lon;

          if (dr && entity.speed > 0.5) {
            const timeSinceUpdate = now - dr.serverTime;
            const alpha = Math.min(
              Math.max(timeSinceUpdate / dr.expectedInterval, 0),
              1,
            );
            const dtSec = timeSinceUpdate / 1000;

            // 1. Server Projection (Where it should be now based on latest report)
            const R = 6371000;
            const distServer = dr.serverSpeed * dtSec;
            const dLatServer =
              ((distServer * Math.cos(dr.serverCourseRad)) / R) *
              (180 / Math.PI);
            const dLonServer =
              ((distServer * Math.sin(dr.serverCourseRad)) /
                (R * Math.cos((dr.serverLat * Math.PI) / 180))) *
              (180 / Math.PI);

            const serverProjLat = dr.serverLat + dLatServer;
            const serverProjLon = dr.serverLon + dLonServer;

            // 2. Client Projection (Where we were going visually)
            // Blend the velocities for smooth transition
            const blendSpeed =
              dr.blendSpeed + (dr.serverSpeed - dr.blendSpeed) * alpha;

            // Angle blending (taking shortest path)
            let dAngle = dr.serverCourseRad - dr.blendCourseRad;
            while (dAngle <= -Math.PI) dAngle += 2 * Math.PI;
            while (dAngle > Math.PI) dAngle -= 2 * Math.PI;
            const blendCourse = dr.blendCourseRad + dAngle * alpha;

            const distClient = blendSpeed * dtSec;
            const dLatClient =
              ((distClient * Math.cos(blendCourse)) / R) * (180 / Math.PI);
            const dLonClient =
              ((distClient * Math.sin(blendCourse)) /
                (R * Math.cos((dr.blendLat * Math.PI) / 180))) *
              (180 / Math.PI);

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
            // PVB handles smoothness, just filter micro-jitter.
            // FIX #3: Cap smoothDt to 2 frames (33ms). The outer `dt` is
            // already capped at 100ms (to prevent physics explosions after
            // tab-switch), but at dt=100ms the smoothFactor becomes ~0.73,
            // jumping the visual position 73% toward the target in one frame.
            // Using a tighter 33ms cap keeps the lerp gradual regardless of
            // how long the RAF loop was paused.
            const BASE_ALPHA = 0.25;
            const smoothDt = Math.min(dt, 33);
            const smoothFactor = 1 - Math.pow(1 - BASE_ALPHA, smoothDt / 16.67);
            visual.lat = visual.lat + (targetLat - visual.lat) * smoothFactor;
            visual.lon = visual.lon + (targetLon - visual.lon) * smoothFactor;
            visual.alt =
              visual.alt + (entity.altitude - visual.alt) * smoothFactor;
            void speedKts; // unused after speed-based smoothing removed — keep for future
          }

          // Clamp to target if very close (prevent micro-jitter)
          if (
            Math.abs(visual.lat - targetLat) < 0.000001 &&
            Math.abs(visual.lon - targetLon) < 0.000001
          ) {
            visual.lat = targetLat;
            visual.lon = targetLon;
          }

          visualStateRef.current.set(uid, visual);

          const interpolatedEntity: CoTEntity = {
            ...entity,
            lon: visual.lon,
            lat: visual.lat,
            altitude: visual.alt,
            // FIX #4: Normalize to [0, 360]. blendCourseRad can go negative
            // during 0°/360° wraparound (the dAngle normalization keeps it in
            // [-π, π] which maps to [-180°, 180°]). A negative course value
            // passed to getAngle causes incorrect icon rotation direction.
            course: dr
              ? ((dr.blendCourseRad * 180) / Math.PI + 360) % 360
              : entity.course,
          };

          interpolated.push(interpolatedEntity);

          // Update Selected Entity Data (Live Sidebar) - Sync with interpolation
          // This ensures the numbers in the sidebar move in perfect lockstep with the map
          const currentSelected = selectedEntityRef.current;
          if (
            currentSelected &&
            uid === currentSelected.uid &&
            onEntityLiveUpdate
          ) {
            // Throttle to ~30Hz (every 2nd frame) to prevent React render saturation
            // while providing silky smooth numerical updates.
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
                    animate: false,
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
      }

      // Count Orbitals (Satellites)
      for (const [, sat] of satellitesRef.current) {
        if (!filters?.showSatellites) continue;

        const cat = (sat.detail?.category as string)?.toLowerCase() || "";
        if (
          cat.includes("gps") ||
          cat.includes("gnss") ||
          cat.includes("galileo") ||
          cat.includes("beidou") ||
          cat.includes("glonass")
        ) {
          if (filters?.showSatGPS === false) continue;
        } else if (
          cat.includes("weather") ||
          cat.includes("noaa") ||
          cat.includes("meteosat") ||
          cat.includes("fengYun")
        ) {
          if (filters?.showSatWeather === false) continue;
        } else if (
          cat.includes("comms") ||
          cat.includes("communications") ||
          cat.includes("starlink") ||
          cat.includes("iridium") ||
          cat.includes("oneweb") ||
          cat.includes("intelsat")
        ) {
          if (filters?.showSatComms === false) continue;
        } else if (
          cat.includes("surveillance") ||
          cat.includes("military") ||
          cat.includes("isr")
        ) {
          if (filters?.showSatSurveillance === false) continue;
        } else {
          // Everything else (debris, active unclassified, etc.) falls to 'Other'
          if (filters?.showSatOther === false) continue;
        }

        orbitalCount++;
      }

      if (
        countsRef.current.air !== airCount ||
        countsRef.current.sea !== seaCount ||
        countsRef.current.orbital !== orbitalCount
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

      const allSats: CoTEntity[] = Array.from(
        satellitesRef.current.values() as any,
      );
      const filteredSatellites = allSats.filter((sat) => {
        if (!filters?.showSatellites) return false;
        const cat = (sat.detail?.category as string)?.toLowerCase() || "";
        // Match against user-facing category names from the orbital pulse service.
        // Note: 'active' is a Celestrak *group* name, NOT a category filter keyword.
        if (
          cat.includes("gps") ||
          cat.includes("gnss") ||
          cat.includes("galileo") ||
          cat.includes("beidou") ||
          cat.includes("glonass")
        )
          return filters.showSatGPS !== false;
        if (
          cat.includes("weather") ||
          cat.includes("noaa") ||
          cat.includes("meteosat") ||
          cat.includes("fengYun")
        )
          return filters.showSatWeather !== false;
        if (
          cat.includes("comms") ||
          cat.includes("communications") ||
          cat.includes("starlink") ||
          cat.includes("iridium") ||
          cat.includes("oneweb") ||
          cat.includes("intelsat")
        )
          return filters.showSatComms !== false;
        if (
          cat.includes("surveillance") ||
          cat.includes("military") ||
          cat.includes("isr")
        )
          return filters.showSatSurveillance !== false;
        // Everything else (debris, active unclassified, etc.) falls to 'Other'
        return filters.showSatOther !== false;
      });

      const zoom = mapRef.current?.getMap()?.getZoom() ?? 0;

      // JS8 station layers (bearing lines + dots + labels)
      let js8Layers: any[] = [];
      if (js8StationsRef && ownGridRef) {
        const ownGrid = ownGridRef.current;
        let ownLat = 0, ownLon = 0;
        if (ownGrid) [ownLat, ownLon] = maidenheadToLatLon(ownGrid);
        const selectedJS8Callsign =
          selectedEntityRef.current?.type === "js8"
            ? selectedEntityRef.current.callsign
            : null;
        js8Layers = buildJS8Layers(
          Array.from(js8StationsRef.current.values()),
          ownLat,
          ownLon,
          globeMode,
          selectedJS8Callsign,
          onEntitySelect,
          setHoveredEntity,
          setHoverPosition,
          zoom,
        );
      }

      // Repeater infrastructure layers (ham radio repeaters)
      let repeaterLayers: any[] = [];
      if (showRepeaters && repeatersRef && repeatersRef.current.length > 0) {
        repeaterLayers = buildRepeaterLayers(
          repeatersRef.current,
          globeMode,
          onEntitySelect,
          setHoveredEntity,
          setHoverPosition,
          zoom,
        );
      }

      const layers = [
        ...getOrbitalLayers({
          satellites: filteredSatellites,
          selectedEntity: currentSelected,
          hoveredEntity: hoveredEntity,
          now,
          showHistoryTails: historyTailsRef.current,
          projectionMode: globeMode ? "globe" : "mercator",
          onEntitySelect,
          onHover: (entity, x, y) => {
            if (entity) {
              setHoveredEntity(entity);
              setHoverPosition({ x, y });
            } else {
              setHoveredEntity(null);
              setHoverPosition(null);
            }
          },
        }),

        // 0. AOT Boundaries
        ...buildAOTLayers(aotShapes, filters, globeMode),

        // 1. Repeater infrastructure (rendered below entity icons for context)
        ...repeaterLayers,

        // 2-3. Trail layers (history trails, gap bridges, selected trail)
        ...buildTrailLayers(
          interpolated,
          currentSelected,
          globeMode,
          historyTailsRef.current,
        ),

        // 4+. Entity layers (stems, halos, icons, glow, selection ring, velocity vectors)
        ...buildEntityLayers(
          interpolated,
          currentSelected,
          globeMode,
          enable3d,
          velocityVectorsRef.current,
          now,
          onEntitySelect,
          setHoveredEntity,
          setHoverPosition,
          selectedEntity,
        ),

        // 5. JS8 station layers (rendered above entity icons)
        ...js8Layers,
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
  }, [
    onCountsUpdate,
    filters,
    onEvent,
    onEntitySelect,
    mapLoaded,
    enable3d,
    mapToken,
    mapStyle,
    replayMode,
    onEntityLiveUpdate,
    globeMode,
    aotShapes,
    hoveredEntity,
    selectedEntity,
    onFollowModeChange,
    showRepeaters,
  ]);
}
