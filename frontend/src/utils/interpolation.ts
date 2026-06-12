import { CoTEntity, DRState, VisualState } from "../types";

const R_EARTH = 6371000;
const DEG_PER_RAD = 180 / Math.PI;
const RAD_PER_DEG = Math.PI / 180;
const TWO_PI = 2 * Math.PI;
const METERS_PER_DEG = 111320;

/**
 * Projective Velocity Blending (PVB)
 * Smooths jitter and predicts position between low-frequency updates.
 *
 * Two distinct time anchors:
 *  - dr.serverTime — the epoch the position was computed/measured at. The
 *    server projection runs from here, so data that arrives seconds late
 *    (sweep chunking, Kafka, WS) is immediately extrapolated to "now"
 *    instead of being rendered persistently behind its true position.
 *  - dr.blendTime — when the update was received. Blend progress (alpha)
 *    and the client-side continuation projection run from here.
 */
export function interpolatePVB(
  entity: CoTEntity,
  dr: DRState | undefined,
  visual: VisualState | undefined,
  now: number,
  dt: number,
  baseAlpha = 0.25,
): { visual: VisualState; interpolatedEntity: CoTEntity } {
  let targetLat = entity.lat;
  let targetLon = entity.lon;

  if (dr && entity.speed > 0.5) {
    const timeSinceUpdate = Math.max(now - dr.blendTime, 0);
    const alpha = Math.min(Math.max(timeSinceUpdate / dr.expectedInterval, 0), 1);

    // 1. Server Projection (Where it should be now based on latest report)
    const dtServerSec = Math.max(now - dr.serverTime, 0) / 1000;
    const distServer = dr.serverSpeed * dtServerSec;
    const dLatServer = ((distServer * Math.cos(dr.serverCourseRad)) / R_EARTH) * DEG_PER_RAD;
    const dLonServer = ((distServer * Math.sin(dr.serverCourseRad)) / (R_EARTH * Math.cos(dr.serverLat * RAD_PER_DEG))) * DEG_PER_RAD;

    const serverProjLat = dr.serverLat + dLatServer;
    const serverProjLon = dr.serverLon + dLonServer;

    // 2. Client Projection (Where we were going visually)
    const blendSpeed = dr.blendSpeed + (dr.serverSpeed - dr.blendSpeed) * alpha;

    // Angle blending (taking shortest path)
    let dAngle = dr.serverCourseRad - dr.blendCourseRad;
    while (dAngle <= -Math.PI) dAngle += TWO_PI;
    while (dAngle > Math.PI) dAngle -= TWO_PI;
    const blendCourse = dr.blendCourseRad + dAngle * alpha;

    const dtClientSec = timeSinceUpdate / 1000;
    const distClient = blendSpeed * dtClientSec;
    const dLatClient = ((distClient * Math.cos(blendCourse)) / R_EARTH) * DEG_PER_RAD;
    const dLonClient = ((distClient * Math.sin(blendCourse)) / (R_EARTH * Math.cos(dr.blendLat * RAD_PER_DEG))) * DEG_PER_RAD;

    const clientProjLat = dr.blendLat + dLatClient;
    const clientProjLon = dr.blendLon + dLonClient;

    // 3. Final Target (Blend projections)
    targetLat = clientProjLat + (serverProjLat - clientProjLat) * alpha;
    targetLon = clientProjLon + (serverProjLon - clientProjLon) * alpha;
  }

  const newVisual = visual
    ? { ...visual }
    : { lat: targetLat, lon: targetLon, alt: entity.altitude };

  if (visual) {
    // Teleport guard: if the target has moved further than this entity could
    // plausibly traverse in ~3 update intervals (stale anchor replaced after
    // a stall, source correction, antimeridian crossing), snap in a single
    // frame instead of racing the visual across the map. The raw longitude
    // delta is deliberately NOT wrapped: an antimeridian crossing should snap
    // to the other side, never smooth the long way around the globe.
    const intervalSec = (dr?.expectedInterval ?? 5000) / 1000;
    const snapThresholdDeg = Math.max(
      2,
      ((entity.speed || 0) * intervalSec * 3) / METERS_PER_DEG,
    );
    if (
      Math.abs(targetLat - visual.lat) > snapThresholdDeg ||
      Math.abs(targetLon - visual.lon) > snapThresholdDeg
    ) {
      newVisual.lat = targetLat;
      newVisual.lon = targetLon;
      newVisual.alt = entity.altitude;
    } else {
      const smoothDt = Math.min(dt, 33);
      const smoothFactor = 1 - Math.pow(1 - baseAlpha, smoothDt / 16.67);
      newVisual.lat = visual.lat + (targetLat - visual.lat) * smoothFactor;
      newVisual.lon = visual.lon + (targetLon - visual.lon) * smoothFactor;
      newVisual.alt = visual.alt + (entity.altitude - visual.alt) * smoothFactor;
    }
  }

  // Clamp to target if very close (prevent micro-jitter)
  if (
    Math.abs(newVisual.lat - targetLat) < 0.000001 &&
    Math.abs(newVisual.lon - targetLon) < 0.000001
  ) {
    newVisual.lat = targetLat;
    newVisual.lon = targetLon;
  }

  const interpolatedEntity: CoTEntity = {
    ...entity,
    lon: newVisual.lon,
    lat: newVisual.lat,
    altitude: newVisual.alt,
    course: dr
      ? (dr.blendCourseRad * DEG_PER_RAD + 360) % 360
      : entity.course,
  };

  return { visual: newVisual, interpolatedEntity };
}
