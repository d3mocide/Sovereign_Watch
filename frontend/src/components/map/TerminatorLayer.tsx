import { GeoJsonLayer } from '@deck.gl/layers';

interface InlinePolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

interface InlineFeature<G> {
  type: 'Feature';
  geometry: G;
  properties: Record<string, unknown>;
}

interface InlineFeatureCollection<G> {
  type: 'FeatureCollection';
  features: InlineFeature<G>[];
}

/**
 * Deck.gl v9 GeoJsonLayer 'data' type is strict about Promise vs Object.
 * We cast to Internal GeoJSON types to satisfy the interface.
 */
type TerminatorGeoJson = InlineFeatureCollection<InlinePolygon>;

// Helper to compute the terminator GeoJSON polygon
function computeTerminator(date: Date) {
  // Get sun position at lat=0, lon=0 to find declination and right ascension/hour angle
  // suncalc.getPosition(date, lat, lon) returns altitude and azimuth
  // For the sub-solar point:
  // Dec = sun.declination (not directly exposed in getPosition unfortunately, but we can compute it or approximate it)
  // Actually, we can use a standard mathematical approximation for the terminator.

  // Since suncalc doesn't expose raw sub-solar point directly, we calculate it:
  // JD = julian day
  const dayMs = 1000 * 60 * 60 * 24;
  const j0 = 0.0009;

  const timestamp = date.getTime();
  const jdate = timestamp / dayMs + 2440587.5;
  const n = jdate - 2451545.0 + j0;

  // Mean solar anomaly
  const M = (357.5291 + 0.98560028 * n) % 360;
  const M_rad = M * Math.PI / 180;

  // Equation of the center
  const C = 1.9148 * Math.sin(M_rad) + 0.02 * Math.sin(2 * M_rad) + 0.0003 * Math.sin(3 * M_rad);

  // Ecliptic longitude
  const lambda = (M + C + 180 + 102.9372) % 360;
  const lambda_rad = lambda * Math.PI / 180;

  // Declination of the sun
  const declination_rad = Math.asin(Math.sin(lambda_rad) * Math.sin(23.4397 * Math.PI / 180));
  const subSolarLat = declination_rad;

  const subSolarLon_deg = -15 * (date.getUTCHours() - 12 + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600);
  const subSolarLon = subSolarLon_deg * Math.PI / 180;

  // The terminator follows a great circle perpendicular to the sub-solar point
  const coords: number[][] = [];

  // Sample every 1 degree of longitude
  for (let lon_deg = -180; lon_deg <= 180; lon_deg++) {
    const lon = lon_deg * Math.PI / 180;

    // Formula for terminator latitude:
    // tan(lat) = -cos(lon - subSolarLon) / tan(subSolarLat)
    // lat = atan(...)
    const lat = Math.atan(-Math.cos(lon - subSolarLon) / Math.tan(subSolarLat));

    // Convert back to degrees
    coords.push([lon_deg, lat * 180 / Math.PI]);
  }

  // To make a polygon representing the *night* side, we need to connect the terminator
  // to either the north or south pole, depending on season (subSolarLat).
  // If sun is in north hemisphere (subSolarLat > 0), night covers south pole.
  const poleLat = subSolarLat > 0 ? -90 : 90;

  // These two closing edges run along a fixed meridian (lon = ±180) from the
  // terminator curve to the pole. On flat/Mercator maps a single long edge is
  // fine (it renders as a straight vertical line), but on the 3D globe the
  // renderer only bends existing vertices onto the sphere and interpolates
  // linearly *between* them — an edge spanning ~100+ degrees of latitude in
  // one hop becomes a straight chord that cuts across the visible globe
  // instead of following its curvature. Sample every few degrees so the
  // edge hugs the sphere on both projections.
  const LAT_STEP_DEG = 2;
  const lastLat = coords[coords.length - 1][1]; // terminator lat at lon = 180
  const firstLat = coords[0][1]; // terminator lat at lon = -180

  const rampSteps = Math.max(1, Math.round(Math.abs(poleLat - lastLat) / LAT_STEP_DEG));
  for (let i = 1; i <= rampSteps; i++) {
    coords.push([180, lastLat + (poleLat - lastLat) * (i / rampSteps)]);
  }

  // Start this ramp exactly at the pole (i = returnSteps) so the pole-to-pole
  // edge above lands on the same point in 3D at both ends, then step back
  // down to the terminator curve's start.
  const returnSteps = Math.max(1, Math.round(Math.abs(poleLat - firstLat) / LAT_STEP_DEG));
  for (let i = returnSteps; i >= 1; i--) {
    coords.push([-180, firstLat + (poleLat - firstLat) * (i / returnSteps)]);
  }

  // Close the polygon
  coords.push(coords[0]);

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [coords]
        },
        properties: {}
      }
    ]
  } as TerminatorGeoJson;
}

// The terminator only moves meaningfully once per minute, but this function is
// called from per-frame layer composition. Memoize the (360-point) polygon so
// repeat calls within the same minute return the identical GeoJSON object —
// a stable `data` reference also lets deck.gl skip re-uploading attributes.
let cachedMinute = 0;
let cachedGeoJson: TerminatorGeoJson | null = null;

export function getTerminatorLayer(visible: boolean, globeMode = false) {
  // We use Date.now() rounded to nearest minute to avoid constant re-renders
  // For a pure layer creator function, we calculate the current terminator
  const now = new Date();
  now.setSeconds(0, 0);

  if (!cachedGeoJson || cachedMinute !== now.getTime()) {
    cachedMinute = now.getTime();
    cachedGeoJson = computeTerminator(now);
  }
  const terminatorGeoJson = cachedGeoJson;

  return new GeoJsonLayer({
    id: `terminator-layer-${globeMode ? 'globe' : 'merc'}`,
    data: terminatorGeoJson,
    visible: visible,
    getFillColor: [0, 0, 20, 80],
    getLineColor: [100, 100, 200, 60],
    getLineWidth: 1,
    lineWidthMinPixels: 1,
    stroked: true,
    filled: true,
    wrapLongitude: !globeMode,
    // Flat map: depthTest off so the transparent night fill never occludes
    // surface layers (country heat, cables, etc.) beneath it.
    // Globe: depthTest ON — deck.gl's globe depth mask then occludes the
    // far-hemisphere half of the night polygon, which otherwise renders
    // through the planet and shades the wrong side of the visible globe.
    // The small negative bias lifts the near-side fill above the mask
    // (same technique as the aurora oval).
    parameters: (globeMode
      ? { depthTest: true, depthBias: -5.0 }
      : { depthTest: false }) as any,
    // Add updateTriggers if we want it to react to time changes
    updateTriggers: {
      getFillColor: [now.getTime()]
    }
  });
}
