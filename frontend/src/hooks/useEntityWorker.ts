import { MutableRefObject, useEffect, useRef } from "react";
import { buildAlertMessage, getEmergencyKey } from "../alerts/AviationAlertEngine";
import { buildMaritimeAlertMessage, getMaritimeAlertKey } from "../alerts/MaritimeAlertEngine";
import type { EntityClassification } from "../types";
import { CoTEntity, DRState, TrailPoint, VisualState } from "../types";
import {
  getBearing,
  getDistanceMeters,
  uidToHash,
} from "../utils/map/geoUtils";
import { getSmoothedTrail } from "../utils/trailSmoothing";
import { startWorkerProtocol } from "../workers/WorkerProtocol";

const SEA_ENTITY_CACHE_KEY = "tracks:sea:recent";
const SEA_ENTITY_CACHE_TTL_MS = 5 * 60 * 1000;
const SEA_ENTITY_CACHE_WRITE_INTERVAL_MS = 10 * 1000;

type CachedSeaEntity = {
  uid: string;
  lat: number;
  lon: number;
  altitude: number;
  type: string;
  course: number;
  speed: number;
  vspeed?: number;
  callsign: string;
  time?: number;
  lastSourceTime?: number;
  lastSeen: number;
  trail: TrailPoint[];
  raw?: string;
  classification?: EntityClassification;
  vesselClassification?: import("../types").VesselClassification;
};

function isSeaEntity(entity: CoTEntity): boolean {
  return !!entity.type?.includes("S") || !!entity.vesselClassification;
}

function buildSeaSnapshot(entities: Map<string, CoTEntity>): CachedSeaEntity[] {
  const out: CachedSeaEntity[] = [];
  entities.forEach((entity) => {
    if (!isSeaEntity(entity)) return;
    out.push({
      uid: entity.uid,
      lat: entity.lat,
      lon: entity.lon,
      altitude: entity.altitude || 0,
      type: entity.type || "a-n-S",
      course: entity.course || 0,
      speed: entity.speed || 0,
      vspeed: entity.vspeed,
      callsign: entity.callsign || entity.uid,
      time: entity.time,
      lastSourceTime: entity.lastSourceTime,
      lastSeen: entity.lastSeen,
      trail: (entity.trail || []).slice(-40),
      raw: entity.raw,
      classification: entity.classification,
      vesselClassification: entity.vesselClassification,
    });
  });
  return out;
}

function writeSeaSnapshot(entities: Map<string, CoTEntity>): void {
  try {
    const payload = {
      savedAt: Date.now(),
      entities: buildSeaSnapshot(entities),
    };
    localStorage.setItem(SEA_ENTITY_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore browser storage failures.
  }
}

function restoreSeaSnapshot(
  entitiesRef: MutableRefObject<Map<string, CoTEntity>>,
  knownUidsRef: MutableRefObject<Set<string>>,
): number {
  try {
    const raw = localStorage.getItem(SEA_ENTITY_CACHE_KEY);
    if (!raw) return 0;

    const parsed = JSON.parse(raw) as {
      savedAt?: number;
      entities?: CachedSeaEntity[];
    };

    if (!parsed.savedAt || Date.now() - parsed.savedAt > SEA_ENTITY_CACHE_TTL_MS) {
      localStorage.removeItem(SEA_ENTITY_CACHE_KEY);
      return 0;
    }

    const cached = Array.isArray(parsed.entities) ? parsed.entities : [];
    let restored = 0;
    for (const c of cached) {
      if (!c?.uid) continue;
      if (entitiesRef.current.has(c.uid)) continue;

      const revived: CoTEntity = {
        uid: c.uid,
        lat: c.lat,
        lon: c.lon,
        altitude: c.altitude || 0,
        type: c.type || "a-n-S",
        course: c.course || 0,
        speed: c.speed || 0,
        vspeed: c.vspeed,
        callsign: c.callsign || c.uid,
        time: c.time,
        lastSourceTime: c.lastSourceTime,
        // Give restored targets a fresh grace window after browser refresh.
        lastSeen: Date.now(),
        trail: Array.isArray(c.trail) ? c.trail : [],
        smoothedTrail: undefined,
        uidHash: uidToHash(c.uid),
        raw: c.raw,
        classification: c.classification,
        vesselClassification: c.vesselClassification,
      };

      entitiesRef.current.set(c.uid, revived);
      knownUidsRef.current.add(c.uid);
      restored += 1;
    }
    return restored;
  } catch {
    return 0;
  }
}

interface DecodedCotEvent {
  uid: string;
  lat: number;
  lon: number;
  hae?: number;
  type?: string;
  raw?: string;
  time?: number;
  detail?: {
    track?: { speed?: number; course?: number; vspeed?: number };
    contact?: { callsign?: string };
    classification?: Record<string, unknown>;
    vesselClassification?: import("../types").VesselClassification;
    norad_id?: number;
    category?: string;
    constellation?: string;
    periodMin?: number;
    inclinationDeg?: number;
    eccentricity?: number;
  };
}

interface UseEntityWorkerOptions {
  onEvent:
    | ((event: {
        type: "new" | "lost" | "alert";
        message: string;
        entityType?: "air" | "sea" | "orbital";
        classification?: EntityClassification;
      }) => void)
    | undefined;
  onWsMessage: ((data: any) => void) | undefined;
  currentMissionRef: MutableRefObject<{
    lat: number;
    lon: number;
    radius_nm: number;
  } | null>;
}

interface UseEntityWorkerReturn {
  entitiesRef: MutableRefObject<Map<string, CoTEntity>>;
  satellitesRef: MutableRefObject<Map<string, CoTEntity>>;
  knownUidsRef: MutableRefObject<Set<string>>;
  drStateRef: MutableRefObject<Map<string, DRState>>;
  visualStateRef: MutableRefObject<Map<string, VisualState>>;
  prevCourseRef: MutableRefObject<Map<string, number>>;
  alertedEmergencyRef: MutableRefObject<Map<string, string>>;
  watchedIcaosRef: MutableRefObject<Set<string>>;
  streamConnectedRef: MutableRefObject<boolean>;
}

export function useEntityWorker({
  onEvent,
  onWsMessage,
  currentMissionRef,
}: UseEntityWorkerOptions): UseEntityWorkerReturn {
  const entitiesRef = useRef<Map<string, CoTEntity>>(new Map());
  const satellitesRef = useRef<Map<string, CoTEntity>>(new Map());
  const knownUidsRef = useRef<Set<string>>(new Set());
  const drStateRef = useRef<Map<string, DRState>>(new Map());
  const visualStateRef = useRef<Map<string, VisualState>>(new Map());
  const prevCourseRef = useRef<Map<string, number>>(new Map());
  const alertedEmergencyRef = useRef<Map<string, string>>(new Map());
  const workerRef = useRef<Worker | null>(null);
  const watchedIcaosRef = useRef<Set<string>>(new Set());
  const streamConnectedRef = useRef<boolean>(true);
  const lastStreamStateRef = useRef<boolean>(true);
  const lastSeaCacheWriteRef = useRef<number>(0);

  useEffect(() => {
    const restoredSea = restoreSeaSnapshot(entitiesRef, knownUidsRef);
    if (restoredSea > 0) {
      onEvent?.({
        type: "new",
        message: `MARITIME CACHE RESTORED — ${restoredSea} track${restoredSea === 1 ? "" : "s"}`,
        entityType: "sea",
      });
    }

    const processEntityUpdate = (updateData: unknown) => {
      const entity = (updateData as { cotEvent?: DecodedCotEvent }).cotEvent;
      if (!entity?.uid) return;

      const existing = entitiesRef.current.get(entity.uid);
      const isNew = !existing && !knownUidsRef.current.has(entity.uid);
      const newLon = entity.lon;
      const newLat = entity.lat;
      const isShip = entity.type?.includes("S");

      const mission = currentMissionRef.current;

      const rawStr = (entity.raw as string) ?? "";
      const isWatchlistSource =
        rawStr.includes('"_source":"opensky_watchlist"') ||
        rawStr.includes('"_source": "opensky_watchlist"');

      const isSat =
        entity.type === "a-s-K" ||
        (typeof entity.type === "string" && entity.type.indexOf("K") === 4);

      if (isSat) {
        const existingSat = satellitesRef.current.get(entity.uid);
        const isNewSat = !existingSat && !knownUidsRef.current.has(entity.uid);

        const norad_id =
          entity.detail?.norad_id ?? entity.detail?.classification?.norad_id;
        const category =
          entity.detail?.category ??
          (entity.detail?.classification as Record<string, unknown>)?.category;
        const constellation =
          entity.detail?.constellation ??
          (entity.detail?.classification as Record<string, unknown>)
            ?.constellation;
        const period_min =
          entity.detail?.periodMin ??
          (entity.detail?.classification as Record<string, unknown>)?.periodMin;
        const inclination_deg =
          entity.detail?.inclinationDeg ??
          (entity.detail?.classification as Record<string, unknown>)
            ?.inclinationDeg;
        const eccentricity =
          entity.detail?.eccentricity ??
          (entity.detail?.classification as Record<string, unknown>)
            ?.eccentricity;

        let trail: TrailPoint[] = existingSat?.trail || [];
        const lastTrail = trail[trail.length - 1];
        const distFromLastTrail = lastTrail
          ? getDistanceMeters(lastTrail[1], lastTrail[0], newLat, newLon)
          : Infinity;

        if (distFromLastTrail > 1000) {
          trail = [
            ...trail,
            [
              newLon,
              newLat,
              entity.hae || 0,
              entity.detail?.track?.speed || 0,
              Date.now(),
            ] as TrailPoint,
          ].slice(-100);
        }

        const newSat: CoTEntity = {
          ...entity,
          type: entity.type || "a-s-K",
          lon: newLon,
          lat: newLat,
          altitude: entity.hae || 0,
          course: entity.detail?.track?.course || 0,
          speed: entity.detail?.track?.speed || 0,
          callsign: entity.detail?.contact?.callsign?.trim() || entity.uid,
          detail: {
            ...entity.detail,
            norad_id,
            category,
            constellation,
            period_min,
            inclination_deg,
            eccentricity,
          },
          lastSeen: Date.now(),
          time: entity.time,
          trail,
          smoothedTrail: getSmoothedTrail(trail, existingSat),
          uidHash: existingSat ? existingSat.uidHash : uidToHash(entity.uid),
          raw: entity.raw,
        };

        const now = Date.now();
        const existingDr = drStateRef.current.get(entity.uid);
        const visual = visualStateRef.current.get(entity.uid);
        const blendLat = visual ? visual.lat : newLat;
        const blendLon = visual ? visual.lon : newLon;
        const lastServerTime = existingDr ? existingDr.serverTime : now - 5000;
        const timeSinceLast = Math.max(now - lastServerTime, 4000);

        drStateRef.current.set(entity.uid, {
          serverLat: newLat,
          serverLon: newLon,
          serverSpeed: entity.detail?.track?.speed || 0,
          serverCourseRad:
            ((entity.detail?.track?.course || 0) * Math.PI) / 180,
          serverTime: now,
          blendLat,
          blendLon,
          blendSpeed: existingDr
            ? existingDr.serverSpeed
            : entity.detail?.track?.speed || 0,
          blendCourseRad: existingDr
            ? existingDr.serverCourseRad
            : ((entity.detail?.track?.course || 0) * Math.PI) / 180,
          expectedInterval: timeSinceLast,
        });

        satellitesRef.current.set(entity.uid, newSat);

        if (isNewSat) {
          knownUidsRef.current.add(entity.uid);
          // Satellites are too numerous to emit Intel Feed events per new track.
          // With thousands of sats and huge footprints, virtually all would match,
          // flooding the Intelligence Stream. Suppressed by design.
        }
        return;
      }

      if (mission) {
        const distToCenter = getDistanceMeters(
          newLat,
          newLon,
          mission.lat,
          mission.lon,
        );
        const maxRadiusM = mission.radius_nm * 1852;

        const bypassSpatialGate =
          isWatchlistSource ||
          existing?._source === "opensky_watchlist" ||
          watchedIcaosRef.current.has(entity.uid);
        if (distToCenter > maxRadiusM * 1.05 && !bypassSpatialGate) {
          if (existing) {
            entitiesRef.current.delete(entity.uid);
            knownUidsRef.current.delete(entity.uid);
            alertedEmergencyRef.current.delete(entity.uid);
            onEvent?.({
              type: "lost",
              message: `${isShip ? "🚢" : "✈️"} ${existing.callsign || entity.uid} (Out of Range)`,
              entityType: isShip ? "sea" : "air",
              classification: existing.classification,
            });
          }
          return;
        }
      }

      // Trail accumulation
      const MIN_TRAIL_DIST_M = 50;
      const MIN_TRAIL_INTERVAL_MS = 3000;

      let trail: TrailPoint[] = existing?.trail || [];
      const lastTrail = trail[trail.length - 1];
      const distFromLastTrail = lastTrail
        ? getDistanceMeters(lastTrail[1], lastTrail[0], newLat, newLon)
        : Infinity;
      const timeSinceLastTrail =
        lastTrail && lastTrail[4] != null
          ? Date.now() - lastTrail[4]
          : Infinity;

      if (
        distFromLastTrail > MIN_TRAIL_DIST_M &&
        timeSinceLastTrail > MIN_TRAIL_INTERVAL_MS
      ) {
        const speed = entity.detail?.track?.speed || 0;
        trail = [
          ...trail,
          [newLon, newLat, entity.hae || 0, speed, Date.now()] as TrailPoint,
        ].slice(-100);
      }

      const callsign = entity.detail?.contact?.callsign?.trim() || entity.uid;

      const existingEntity = entitiesRef.current.get(entity.uid);
      if (existingEntity && existingEntity.lastSourceTime && entity.time) {
        if (existingEntity.lastSourceTime >= entity.time) {
          return;
        }
      }

      const now = Date.now();
      const existingDr = drStateRef.current.get(entity.uid);
      const visual = visualStateRef.current.get(entity.uid);
      const blendLat = visual ? visual.lat : newLat;
      const blendLon = visual ? visual.lon : newLon;

      const classification = entity.detail?.classification as
        | EntityClassification
        | undefined;
      const vesselClassification = entity.detail?.vesselClassification as
        | import("../types").VesselClassification
        | undefined;

      const lastServerTime = existingDr ? existingDr.serverTime : now - 1000;
      const timeSinceLast = Math.max(now - lastServerTime, 800);

      drStateRef.current.set(entity.uid, {
        serverLat: newLat,
        serverLon: newLon,
        serverSpeed: entity.detail?.track?.speed || 0,
        serverCourseRad:
          ((entity.detail?.track?.course || 0) * Math.PI) / 180,
        serverTime: now,
        blendLat,
        blendLon,
        blendSpeed: existingDr
          ? existingDr.serverSpeed
          : entity.detail?.track?.speed || 0,
        blendCourseRad: existingDr
          ? existingDr.serverCourseRad
          : ((entity.detail?.track?.course || 0) * Math.PI) / 180,
        expectedInterval: timeSinceLast,
      });

      entitiesRef.current.set(entity.uid, {
        uid: entity.uid,
        lat: newLat,
        lon: newLon,
        altitude: entity.hae || 0,
        _source: isWatchlistSource
          ? "opensky_watchlist"
          : (existingEntity?._source ?? ""),
        type: entity.type,
        course: entity.detail?.track?.course || 0,
        speed: entity.detail?.track?.speed || 0,
        vspeed: entity.detail?.track?.vspeed || 0,
        callsign,
        time: entity.time,
        lastSourceTime: entity.time || existingEntity?.lastSourceTime,
        lastSeen: Date.now(),
        trail,
        smoothedTrail: getSmoothedTrail(trail, existingEntity),
        uidHash: 0,
        raw: entity.raw,
        classification: classification
          ? {
              ...existingEntity?.classification,
              ...classification,
              description:
                classification.description ||
                existingEntity?.classification?.description ||
                "",
              operator:
                classification.operator ||
                existingEntity?.classification?.operator ||
                "",
              registration:
                classification.registration ||
                existingEntity?.classification?.registration ||
                "",
            }
          : existingEntity?.classification,
        vesselClassification:
          vesselClassification || existingEntity?.vesselClassification,
      } as CoTEntity);

      if (isShip) {
        const nowMs = Date.now();
        if (
          nowMs - lastSeaCacheWriteRef.current >=
          SEA_ENTITY_CACHE_WRITE_INTERVAL_MS
        ) {
          writeSeaSnapshot(entitiesRef.current);
          lastSeaCacheWriteRef.current = nowMs;
        }
      }

      const stored = entitiesRef.current.get(entity.uid)!;
      if (stored.uidHash == null || stored.uidHash === 0) {
        stored.uidHash = uidToHash(entity.uid);
      }

      // Kinematic bearing from trail history
      const rawCourse = entity.detail?.track?.course ?? 0;
      let computedCourse = rawCourse;

      if (trail && trail.length >= 2) {
        const last = trail[trail.length - 1];
        const prev = trail[trail.length - 2];
        const dist = getDistanceMeters(prev[1], prev[0], last[1], last[0]);
        if (dist > 2.0) {
          computedCourse = getBearing(prev[1], prev[0], last[1], last[0]);
        }
      } else if (existingDr) {
        const dist = getDistanceMeters(
          existingDr.serverLat,
          existingDr.serverLon,
          newLat,
          newLon,
        );
        if (dist > 2.0) {
          computedCourse = getBearing(
            existingDr.serverLat,
            existingDr.serverLon,
            newLat,
            newLon,
          );
        }
      }

      prevCourseRef.current.set(entity.uid, computedCourse);
      stored.course = computedCourse;

      // New entity event
      if (isNew) {
        knownUidsRef.current.add(entity.uid);

        let prefix = isShip ? "🚢" : "✈️";
        let tags = "";
        let dims = "";

        if (isShip && vesselClassification) {
          const cat = vesselClassification.category;
          if (cat === "tanker") prefix = "⛽";
          else if (cat === "fishing") prefix = "🎣";
          else if (cat === "pleasure") prefix = "⛵";
          else if (cat === "military") prefix = "⚓";
          else if (cat === "cargo") prefix = "🚢";
          else if (cat === "passenger") prefix = "🚢";
          else if (cat === "law_enforcement") prefix = "⚓";
          else if (cat === "tug") prefix = "⛴️";

          if (vesselClassification.length && vesselClassification.length > 0) {
            dims = ` — ${vesselClassification.length}m`;
          }
        } else if (!isShip && classification) {
          if (classification.platform === "helicopter") prefix = "🚁";
          else if (
            classification.platform === "drone" ||
            classification.platform === "uav"
          )
            prefix = "🛸";
          else if (classification.affiliation === "military") prefix = "🦅";
          else if (classification.affiliation === "government") prefix = "🏛️";
          else prefix = "✈️";

          if (classification.icaoType) {
            tags += `[${classification.icaoType}] `;
          } else if (classification.operator) {
            tags += `[${classification.operator.slice(0, 10).toUpperCase()}] `;
          }
        }

        onEvent?.({
          type: "new",
          message: `${prefix} ${tags}${callsign}${dims}`,
          entityType: isShip ? "sea" : "air",
          classification:
            isShip && vesselClassification
              ? { ...classification, category: vesselClassification.category }
              : classification,
        });
      }

      // Alert detection
      if (!isShip) {
        const emergencyKey = getEmergencyKey(classification);
        const lastAlerted = alertedEmergencyRef.current.get(entity.uid) ?? "";
        if (emergencyKey && emergencyKey !== lastAlerted) {
          alertedEmergencyRef.current.set(entity.uid, emergencyKey);
          onEvent?.({
            type: "alert",
            message: buildAlertMessage(callsign, emergencyKey),
            entityType: "air",
            classification,
          });
        } else if (!emergencyKey && lastAlerted) {
          alertedEmergencyRef.current.delete(entity.uid);
        }

        if (isNew && classification) {
          if (classification.affiliation === "military") {
            onEvent?.({
              type: "alert",
              message: `MILITARY AIRCRAFT — ${callsign}`,
              entityType: "air",
            });
          }
          if (
            classification.platform === "drone" ||
            classification.platform === "uav"
          ) {
            onEvent?.({
              type: "alert",
              message: `UAS DETECTED — ${callsign}`,
              entityType: "air",
            });
          }
        }
      } else {
        const maritimeAlertKey = getMaritimeAlertKey(vesselClassification);
        const lastMaritimeAlert =
          alertedEmergencyRef.current.get(entity.uid) ?? "";
        if (maritimeAlertKey && maritimeAlertKey !== lastMaritimeAlert) {
          alertedEmergencyRef.current.set(entity.uid, maritimeAlertKey);
          onEvent?.({
            type: "alert",
            message: buildMaritimeAlertMessage(callsign, maritimeAlertKey),
            entityType: "sea",
          });
        } else if (
          !maritimeAlertKey &&
          lastMaritimeAlert.startsWith("navStatus:")
        ) {
          alertedEmergencyRef.current.delete(entity.uid);
        }

        if (isNew && vesselClassification) {
          if (vesselClassification.hazardous) {
            onEvent?.({
              type: "alert",
              message: `HAZ CARGO — ${callsign}`,
              entityType: "sea",
            });
          }
          if (vesselClassification.category === "military") {
            onEvent?.({
              type: "alert",
              message: `MILITARY VESSEL — ${callsign}`,
              entityType: "sea",
            });
          }
        }
      }
    };

    const cleanupProtocol = startWorkerProtocol({
      workerRef,
      watchedIcaosRef,
      onEntityUpdate: processEntityUpdate,
      onWsMessage,
      onSocketStateChange: (state) => {
        streamConnectedRef.current = state.connected;

        if (lastStreamStateRef.current !== state.connected) {
          lastStreamStateRef.current = state.connected;
          if (!state.connected) {
            onEvent?.({
              type: "alert",
              message:
                state.reason === "auth_failed"
                  ? "TRACK STREAM AUTH FAILED — re-authenticating..."
                  : "TRACK STREAM DISCONNECTED — reconnecting...",
            });
          } else {
            onEvent?.({
              type: "new",
              message: "TRACK STREAM RECONNECTED",
            });
          }
        }
      },
    });

    return () => {
      writeSeaSnapshot(entitiesRef.current);
      cleanupProtocol();
    };
  }, [onEvent]);

  return {
    entitiesRef,
    satellitesRef,
    knownUidsRef,
    drStateRef,
    visualStateRef,
    prevCourseRef,
    alertedEmergencyRef,
    watchedIcaosRef,
    streamConnectedRef,
  };
}
