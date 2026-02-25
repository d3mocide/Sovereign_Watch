// Helper: Simple Haversine Distance in Meters
export function getDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180; // φ, λ in radians
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Helper: Calculate Rhumb Line Bearing (Mercator straight line)
export function getBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const φ1 = lat1 * toRad;
  const φ2 = lat2 * toRad;
  let Δλ = (lon2 - lon1) * toRad;

  // Project Latitudes (Mercator "stretched" latitude)
  const ψ1 = Math.log(Math.tan(Math.PI / 4 + φ1 / 2));
  const ψ2 = Math.log(Math.tan(Math.PI / 4 + φ2 / 2));
  const Δψ = ψ2 - ψ1;

  // Handle wrapping around the 180th meridian
  if (Math.abs(Δλ) > Math.PI) {
    Δλ = Δλ > 0 ? -(2 * Math.PI - Δλ) : 2 * Math.PI + Δλ;
  }

  const θ = Math.atan2(Δλ, Δψ);
  return (θ * toDeg + 360) % 360;
}

/**
 * Helper: Applies 3D altitude compensation to center the focal point on the icon
 * rather than the ground coordinates.
 */
export function getCompensatedCenter(
  lat: number,
  lon: number,
  alt: number,
  map: any,
): [number, number] {
  const pitch = map.getPitch();
  if (pitch <= 0 || alt <= 0) return [lon, lat];

  const bearing = (map.getBearing() * Math.PI) / 180;
  const pitchRad = (pitch * Math.PI) / 180;

  // Horizontal shift (meters) required to compensate for height projection
  const shiftM = alt * Math.tan(pitchRad);

  // Convert meters to lat/lon degrees
  const R = 6371000;
  const dLat = ((shiftM * Math.cos(bearing)) / R) * (180 / Math.PI);
  const dLon =
    ((shiftM * Math.sin(bearing)) / (R * Math.cos((lat * Math.PI) / 180))) *
    (180 / Math.PI);

  return [lon + dLon, lat + dLat];
}

/** Chaikin's corner-cutting algorithm for smooth trail rendering.
 * Runs `iterations` passes, each replacing every segment with 2 points
 * at 1/4 and 3/4 of the way along it. 2 passes = 4x point density, smooth curves.
 * Altitude (z) is linearly interpolated to match. First/last points are preserved.
 */
export function chaikinSmooth(pts: number[][], iterations = 2): number[][] {
  if (pts.length < 3) return pts; // Can't smooth fewer than 3 points
  let result = pts;
  for (let iter = 0; iter < iterations; iter++) {
    const smoothed: number[][] = [result[0]]; // Keep first point sharp
    for (let i = 0; i < result.length - 1; i++) {
      const p0 = result[i];
      const p1 = result[i + 1];
      smoothed.push([
        0.75 * p0[0] + 0.25 * p1[0],
        0.75 * p0[1] + 0.25 * p1[1],
        0.75 * p0[2] + 0.25 * p1[2],
      ]);
      smoothed.push([
        0.25 * p0[0] + 0.75 * p1[0],
        0.25 * p0[1] + 0.75 * p1[1],
        0.25 * p0[2] + 0.75 * p1[2],
      ]);
    }
    smoothed.push(result[result.length - 1]); // Keep last point sharp
    result = smoothed;
  }
  return result;
}

/**
 * Convert a Maidenhead grid locator (4 or 6 chars) to [lat, lon] decimal degrees.
 * Returns the center of the grid square.
 */
export function maidenheadToLatLon(grid: string): [number, number] {
  if (!grid || grid.length < 4) return [0, 0];
  const g = grid.toUpperCase();
  let lon = (g.charCodeAt(0) - 65) * 20 - 180;
  let lat = (g.charCodeAt(1) - 65) * 10 - 90;
  lon += parseInt(g[2]) * 2;
  lat += parseInt(g[3]);
  if (grid.length >= 6) {
    // Subsquare: a-x, each 5'×2.5'
    lon += (g.charCodeAt(4) - 65) * (5 / 60);
    lat += (g.charCodeAt(5) - 65) * (2.5 / 60);
    lon += 5 / 120; // center of subsquare
    lat += 2.5 / 120;
  } else {
    lon += 1;   // center of 2° square
    lat += 0.5; // center of 1° square
  }
  return [lat, lon];
}

/** Deterministic hash from UID for animation phase offset */
export function uidToHash(uid: string): number {
  if (!uid) return 0;
  let h = 0;
  for (let i = 0; i < uid.length; i++) {
    h += uid.charCodeAt(i);
  }
  return h * 100;
}

// Adaptive Zoom Calculation
export const calculateZoom = (radiusNm: number) => {
  const r = Math.max(1, radiusNm);
  return Math.max(2, 14 - Math.log2(r));
};

export function buildGraticule(stepDeg: number = 30): any {
  const features: any[] = [];
  // Meridians (vertical lines)
  for (let lon = -180; lon <= 180; lon += stepDeg) {
    const coords: [number, number][] = [];
    for (let lat = -90; lat <= 90; lat += 2) coords.push([lon, lat]);
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: {},
    });
  }
  // Parallels (horizontal lines)
  for (let lat = -90; lat <= 90; lat += stepDeg) {
    const coords: [number, number][] = [];
    for (let lon = -180; lon <= 180; lon += 2) coords.push([lon, lat]);
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: {},
    });
  }
  return { type: "FeatureCollection", features };
}
