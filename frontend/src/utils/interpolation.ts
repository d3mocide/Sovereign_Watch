import { CoTEntity, DRState, VisualState } from "../types";

const R_EARTH = 6371000;
const DEG_PER_RAD = 180 / Math.PI;
const RAD_PER_DEG = Math.PI / 180;
const TWO_PI = 2 * Math.PI;

/**
 * Projective Velocity Blending (PVB)
 * Smooths jitter and predicts position between low-frequency updates.
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
    const timeSinceUpdate = now - dr.serverTime;
    const alpha = Math.min(Math.max(timeSinceUpdate / dr.expectedInterval, 0), 1);
    const dtSec = timeSinceUpdate / 1000;

    // 1. Server Projection (Where it should be now based on latest report)
    const distServer = dr.serverSpeed * dtSec;
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

    const distClient = blendSpeed * dtSec;
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
    const smoothDt = Math.min(dt, 33);
    const smoothFactor = 1 - Math.pow(1 - baseAlpha, smoothDt / 16.67);
    newVisual.lat = visual.lat + (targetLat - visual.lat) * smoothFactor;
    newVisual.lon = visual.lon + (targetLon - visual.lon) * smoothFactor;
    newVisual.alt = visual.alt + (entity.altitude - visual.alt) * smoothFactor;
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
