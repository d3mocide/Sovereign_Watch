import { MutableRefObject, useEffect, useRef } from "react";
import type { EntityClassification } from "../types";
import { CoTEntity, DRState, TrailPoint, VisualState } from "../types";
import {
  chaikinSmooth,
  getBearing,
  getDistanceMeters,
  uidToHash,
} from "../utils/map/geoUtils";

/** Helper to compute or reuse smoothed trail geometry */
const getSmoothedTrail = (trail: TrailPoint[], existing?: CoTEntity) => {
  if (existing?.smoothedTrail && existing.trail === trail) {
    return existing.smoothedTrail;
  }
  return trail.length >= 2
    ? chaikinSmooth(trail.map((p) => [p[0], p[1], p[2]]))
    : [];
};

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
}

const EMERGENCY_SQUAWKS = new Set(["7500", "7600", "7700"]);

function getEmergencyKey(classification?: EntityClassification): string {
  if (classification?.squawk && EMERGENCY_SQUAWKS.has(classification.squawk)) {
    return `squawk:${classification.squawk}`;
  }
  if (
    classification?.emergency &&
    classification.emergency !== "none" &&
    classification.emergency !== ""
  ) {
    return `emergency:${classification.emergency}`;
  }
  return "";
}

function buildAlertMessage(callsign: string, emergencyKey: string): string {
  if (emergencyKey.startsWith("squawk:")) {
    const squawk = emergencyKey.slice(7);
    if (squawk === "7500") return `SQUAWK 7500 — ${callsign} (HIJACK)`;
    if (squawk === "7600") return `SQUAWK 7600 — ${callsign} (Radio Failure)`;
    if (squawk === "7700") return `SQUAWK 7700 — ${callsign} (Emergency)`;
  }
  if (emergencyKey.startsWith("emergency:")) {
    const type = emergencyKey.slice(10);
    return `EMERGENCY — ${callsign}: ${type.toUpperCase()}`;
  }
  return `ALERT — ${callsign}`;
}

// AIS nav status codes that warrant an alert
const DISTRESS_NAV_STATUSES: Record<number, string> = {
  2: "NOT UNDER COMMAND",
  6: "AGROUND",
  14: "AIS-SART DISTRESS",
};

function getMaritimeAlertKey(
  vesselClassification?: import("../types").VesselClassification,
): string {
  const navStatus = vesselClassification?.navStatus;
  if (navStatus !== undefined && navStatus in DISTRESS_NAV_STATUSES) {
    return `navStatus:${navStatus}`;
  }
  return "";
}

function buildMaritimeAlertMessage(callsign: string, alertKey: string): string {
  const code = parseInt(alertKey.slice("navStatus:".length), 10);
  const label = DISTRESS_NAV_STATUSES[code] ?? "MARITIME ALERT";
  return `${label} — ${callsign}`;
}

export function useEntityWorker({
  onEvent,
  currentMissionRef,
}: UseEntityWorkerOptions): UseEntityWorkerReturn {
  const entitiesRef = useRef<Map<string, CoTEntity>>(new Map());
  const satellitesRef = useRef<Map<string, CoTEntity>>(new Map());
  const knownUidsRef = useRef<Set<string>>(new Set());
  const drStateRef = useRef<Map<string, DRState>>(new Map());
  const visualStateRef = useRef<Map<string, VisualState>>(new Map());
  const prevCourseRef = useRef<Map<string, number>>(new Map());
  // Tracks the last emitted emergency key per UID to avoid duplicate alerts
  const alertedEmergencyRef = useRef<Map<string, string>>(new Map());
  const workerRef = useRef<Worker | null>(null);
  const watchedIcaosRef = useRef<Set<string>>(new Set());

  // Initial Data Generation (Mock) & Worker Setup
  useEffect(() => {
    // Initialize Worker
    const worker = new Worker(
      new URL("../workers/tak.worker.ts", import.meta.url),
      {
        type: "module",
      },
    );

    // Pass Proto URL (Vite allows importing assets via ?url)
    // We need a way to resolve the proto file URL at runtime.
    // For now, we assume it's served from /tak.proto if we put it in public,
    // OR we try to import it. Let's try the import method if configured, otherwise public.
    // Simplest for now: Assume we will move tak.proto to public folder for easy fetch.
    worker.postMessage({ type: "init", payload: "/tak.proto?v=" + Date.now() });

    const processEntityUpdate = (updateData: unknown) => {
      // Handle Decoded Data from Worker
      const entity = (updateData as { cotEvent?: DecodedCotEvent }).cotEvent; // Based on our proto structure
      if (entity && entity.uid) {
        const existing = entitiesRef.current.get(entity.uid);
        const isNew = !existing && !knownUidsRef.current.has(entity.uid);
        const newLon = entity.lon;
        const newLat = entity.lat;
        const isShip = entity.type?.includes("S");

        // Spatial Filter: Drop entities outside active mission area
        // (Backend should filter, but this cleanup prevents stale data artifacts)
        const mission = currentMissionRef.current;

        // Fast source extraction from raw JSON string — avoids full JSON.parse per update.
        // Watchlist-sourced entities carry _source:"opensky_watchlist" and must bypass
        // the spatial gate so they render globally, not just within the AOR.
        const rawStr = (entity.raw as string) ?? "";
        const isWatchlistSource =
          rawStr.includes('"_source":"opensky_watchlist"') ||
          rawStr.includes('"_source": "opensky_watchlist"');

        // Check if Satellite
        const isSat =
          entity.type === "a-s-K" ||
          (typeof entity.type === "string" && entity.type.indexOf("K") === 4);

        if (isSat) {
          const existing = satellitesRef.current.get(entity.uid);
          const isNew = !existing && !knownUidsRef.current.has(entity.uid);

          const norad_id =
            entity.detail?.norad_id ?? entity.detail?.classification?.norad_id;
          // Category can come from entity.detail.category (direct) OR
          // entity.detail.classification.category (current: API maps classification: meta which contains all sat fields)
          const category =
            entity.detail?.category ??
            (entity.detail?.classification as Record<string, unknown>)
              ?.category;
          const constellation =
            entity.detail?.constellation ??
            (entity.detail?.classification as Record<string, unknown>)
              ?.constellation;
          const period_min =
            entity.detail?.periodMin ??
            (entity.detail?.classification as Record<string, unknown>)
              ?.periodMin;
          const inclination_deg =
            entity.detail?.inclinationDeg ??
            (entity.detail?.classification as Record<string, unknown>)
              ?.inclinationDeg;
          const eccentricity =
            entity.detail?.eccentricity ??
            (entity.detail?.classification as Record<string, unknown>)
              ?.eccentricity;

          // Minimal trail for satellite if needed, but we don't need PVB here for MVP
          // We can just rely on the 30s updates and let it snap.
          let trail: TrailPoint[] = existing?.trail || [];
          const newLat = entity.lat;
          const newLon = entity.lon;

          // Dist check for trail so it doesn't just pile up if it hasn't moved
          const lastTrail = trail[trail.length - 1];
          const distFromLastTrail = lastTrail
            ? getDistanceMeters(lastTrail[1], lastTrail[0], newLat, newLon)
            : Infinity;

          if (distFromLastTrail > 1000) {
            // Only if moved 1km
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
            smoothedTrail: getSmoothedTrail(trail, existing),
            uidHash: existing ? existing.uidHash : uidToHash(entity.uid),
            raw: entity.raw,
          };

          // PVB State Update for Satellites
          const now = Date.now();
          const existingDr = drStateRef.current.get(entity.uid);
          const visual = visualStateRef.current.get(entity.uid);
          const blendLat = visual ? visual.lat : newLat;
          const blendLon = visual ? visual.lon : newLon;

          const lastServerTime = existingDr
            ? existingDr.serverTime
            : now - 5000;
          const timeSinceLast = Math.max(now - lastServerTime, 4000); // Nominal 5s

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

          if (isNew) {
            knownUidsRef.current.add(entity.uid);
            // Satellites are too numerous to emit Intel Feed events per new track.
            // With thousands of sats and huge footprints, virtually all would match,
            // flooding the Intelligence Stream. Suppressed by design.
          }
          // DO NOT CONTINUE TO AIR/SEA processing
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

          // Allow 5% buffer for edge cases, but drop outliers.
          // Bypass for watchlist entities: check both the per-message _source tag
          // (immediate, no sync delay) and the polled watchlist set (covers manual entries).
          const bypassSpatialGate =
            isWatchlistSource ||
            existing?._source === "opensky_watchlist" ||
            watchedIcaosRef.current.has(entity.uid);
          if (distToCenter > maxRadiusM * 1.05 && !bypassSpatialGate) {
            // If it exists, remove it (it moved out of bounds)
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
            return; // Skip update
          }
        }

        // Build trail from existing positions (max 100 points for rich history).
        // Minimum distance gate (30m) prevents multilateration noise between
        // ADS-B source networks from accumulating as zigzag artefacts in the trail.
        // Minimum distance gate (50m) and temporal gate (3s) prevent multilateration noise
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

        // console.log(`Trail check: d=${distFromLastTrail.toFixed(1)}m, t=${timeSinceLastTrail}ms`);

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
        // BUG-015: `currentDr` and `previousDr` were both drStateRef.current.get(entity.uid)
        // — identical lookups before any write. Consolidated to a single `existingDr`
        // variable that serves both the interval calculation and the course-fallback.
        const existingDr = drStateRef.current.get(entity.uid);

        // Capture current visual state as blend origin
        const visual = visualStateRef.current.get(entity.uid);
        const blendLat = visual ? visual.lat : newLat;
        const blendLon = visual ? visual.lon : newLon;

        const classification = entity.detail?.classification as
          | EntityClassification
          | undefined;
        const vesselClassification = entity.detail?.vesselClassification as
          | import("../types").VesselClassification
          | undefined;

        // Calculate interval (clamped to avoid jitter from rapid updates)
        const lastServerTime = existingDr ? existingDr.serverTime : now - 1000;
        const timeSinceLast = Math.max(now - lastServerTime, 800); // Minimum 800ms

        // Prepare new DR state
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
          altitude: entity.hae || 0, // Height Above Ellipsoid in meters (Proto is flat)
          _source: isWatchlistSource
            ? "opensky_watchlist"
            : (existingEntity?._source ?? ""),
          type: entity.type,
          course: entity.detail?.track?.course || 0,
          speed: entity.detail?.track?.speed || 0,
          vspeed: entity.detail?.track?.vspeed || 0,
          callsign,
          // SEPARATION OF CONCERNS:
          // time: The raw source time from the packet
          // lastSourceTime: The newest source time we have accepted (for ordering)
          // lastSeen: The local wall-clock time (for fading/stale checks)
          time: entity.time,
          lastSourceTime: entity.time || existingEntity?.lastSourceTime,
          lastSeen: Date.now(),
          trail,
          smoothedTrail: getSmoothedTrail(trail, existingEntity),
          uidHash: 0, // Will be set below
          raw: entity.raw, // Include raw JSON from parsed proto
          classification: classification
            ? {
                ...existingEntity?.classification,
                ...classification,
                // Priority: keep existing description if new one is missing/empty
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
        } else if (existingDr) {
          // FIX #1 (cont): Use the CAPTURED previous state (existingDr), not a fresh
          // read of drStateRef which was already overwritten above.
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

        // Directly use the computed course. No smoothing (to avoid lag).
        prevCourseRef.current.set(entity.uid, computedCourse);
        stored.course = computedCourse;

        // Track known UIDs and emit new entity event
        if (isNew) {
          knownUidsRef.current.add(entity.uid);

          let prefix = isShip ? "🚢" : "✈️";
          let tags = "";
          let dims = "";

          if (isShip && vesselClassification) {
            const cat = vesselClassification.category;
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

            if (
              vesselClassification.length &&
              vesselClassification.length > 0
            ) {
              dims = ` — ${vesselClassification.length}m`;
            }
          } else if (!isShip && classification) {
            if (classification.platform === "helicopter") {
              prefix = "🚁";
            } else if (
              classification.platform === "drone" ||
              classification.platform === "uav"
            ) {
              prefix = "🛸";
            } else if (classification.affiliation === "military") {
              prefix = "🦅";
            } else if (classification.affiliation === "government") {
              prefix = "🏛️";
            } else {
              prefix = "✈️";
            }

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

        // Emergency alert detection: fire once when emergency state appears or changes
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
            // Emergency cleared — reset tracking so a future emergency triggers again
            alertedEmergencyRef.current.delete(entity.uid);
          }

          // 2. One-time alerts on first detection
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
          // Maritime alert detection
          // 1. AIS distress nav status (can change over time — track state)
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

          // 2. One-time alerts on first detection
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
      }
    };

    worker.onmessage = (event: MessageEvent) => {
      const { type, data, status } = event.data;
      if (type === "status" && status === "ready") {
        // BUG-013: Removed debug console.log — not needed in production
      }
      if (type === "entity_batch") {
        // Process batched entities
        for (const item of data) {
          processEntityUpdate(item);
        }
        return;
      }
      if (type === "entity_update") {
        processEntityUpdate(data);
      }
    };

    workerRef.current = worker;

    // Robust WebSocket URL selection
    const getWsUrl = () => {
      const envUrl = import.meta.env.VITE_API_URL;
      if (envUrl && !envUrl.includes("localhost")) {
        return envUrl.replace("http", "ws") + "/api/tracks/live";
      }
      // Default to proxy-friendly relative URL based on current origin
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${protocol}//${window.location.host}/api/tracks/live`;
    };

    const wsUrl = getWsUrl();

    let ws: WebSocket | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;
    const baseDelay = 1000; // 1 second
    let reconnectTimeout: number | null = null;
    let isCleaningUp = false;

    const connect = () => {
      if (isCleaningUp) return;

      // BUG-013: Removed debug console.log for WebSocket connect attempts
      ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        // BUG-013: Removed debug console.log
        reconnectAttempts = 0; // Reset on successful connection
      };

      ws.onmessage = (event) => {
        if (workerRef.current) {
          workerRef.current.postMessage(
            {
              type: "decode_batch",
              payload: event.data,
            },
            [event.data],
          );
        }
      };

      ws.onerror = () => {
        // Don't log noisy errors - onclose will handle reconnection
      };

      ws.onclose = () => {
        if (isCleaningUp) return;

        // NEW-002: Removed console.log("TAK Stream disconnected") —
        // it fired on every clean disconnect, adding noisy output in production.

        // Exponential backoff: 1s, 2s, 4s, 8s... max 30s
        if (reconnectAttempts < maxReconnectAttempts) {
          const delay = Math.min(
            baseDelay * Math.pow(2, reconnectAttempts),
            30000,
          );
          reconnectAttempts++;
          // console.log(`Reconnecting in ${delay/1000}s...`);
          reconnectTimeout = window.setTimeout(connect, delay);
        } else {
          console.error(
            "Max reconnection attempts reached. Please refresh the page.",
          );
        }
      };
    };

    // Poll the watchlist so watched ICAO24s bypass the spatial gate.
    // Best-effort: failures are silent to avoid noise when the API is starting up.
    const syncWatchlist = async () => {
      try {
        const res = await fetch("/api/watchlist");
        if (res.ok) {
          const entries: Array<{ icao24: string }> = await res.json();
          watchedIcaosRef.current = new Set(
            entries.map((e) => e.icao24.toLowerCase()),
          );
        }
      } catch {
        // intentionally silent
      }
    };
    syncWatchlist();
    const watchlistInterval = window.setInterval(syncWatchlist, 10_000);

    connect();

    return () => {
      isCleaningUp = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      clearInterval(watchlistInterval);
      worker.terminate();
      if (ws) ws.close();
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
  };
}
