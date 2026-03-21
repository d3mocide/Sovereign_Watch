import { GeoJsonLayer } from '@deck.gl/layers';

interface InlinePolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

interface InlineLineString {
  type: 'LineString';
  coordinates: number[][];
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
type TerminatorLineGeoJson = InlineFeatureCollection<InlineLineString>;

interface TerminatorGeometry {
  nightGeoJson: TerminatorGeoJson;
  twilightLineGeoJson: TerminatorLineGeoJson;
  twilightStripGeoJson: TerminatorGeoJson;
}

// Helper to compute the terminator GeoJSON polygon
function computeTerminator(date: Date): TerminatorGeometry {
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

  // ── Twilight strip: ±2° offset of the terminator line into the night side ──
  // This simulates the civil/nautical twilight penumbra (~200 km wide).
  // We offset each terminator point slightly toward the night pole.
  const nightOffset = subSolarLat > 0 ? -2.0 : 2.0; // degrees toward night pole
  const coordsOffset = coords.map(([lon, lat]) => [lon, Math.max(-89, Math.min(89, lat + nightOffset))]);

  // Twilight strip polygon: terminator line + offset line reversed, closed
  const stripRing = [
    ...coords,
    ...[...coordsOffset].reverse(),
    coords[0],
  ];

  // ── Night polygon ──
  const nightCoords = [...coords];
  if (subSolarLat > 0) {
    nightCoords.push([180, -90]);
    nightCoords.push([-180, -90]);
  } else {
    nightCoords.push([180, 90]);
    nightCoords.push([-180, 90]);
  }
  // Close the polygon
  nightCoords.push(nightCoords[0]);

  return {
    nightGeoJson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [nightCoords] },
          properties: {},
        },
      ],
    } as TerminatorGeoJson,

    // Glowing edge line along the terminator boundary
    twilightLineGeoJson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: {},
        },
      ],
    } as TerminatorLineGeoJson,

    // Twilight strip polygon
    twilightStripGeoJson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [stripRing] },
          properties: {},
        },
      ],
    } as TerminatorGeoJson,
  };
}

export function getTerminatorLayer(visible: boolean) {
  // We use Date.now() rounded to nearest minute to avoid constant re-renders
  // For a pure layer creator function, we calculate the current terminator
  const now = new Date();
  now.setSeconds(0, 0);

  const { nightGeoJson, twilightLineGeoJson, twilightStripGeoJson } = computeTerminator(now);

  return [
    // ── Layer 1: full night-side fill (deep blue, subtle) ──────────────────
    new GeoJsonLayer({
      id: 'terminator-night',
      data: nightGeoJson,
      visible,
      getFillColor: [0, 0, 20, 80],
      getLineColor: [0, 0, 0, 0],
      stroked: false,
      filled: true,
      updateTriggers: { getFillColor: [now.getTime()] },
    }),

    // ── Layer 2: twilight penumbra strip (~200 km wide along terminator) ──
    // Represents civil/nautical twilight — atmospheric scattering zone.
    new GeoJsonLayer({
      id: 'terminator-twilight-strip',
      data: twilightStripGeoJson,
      visible,
      getFillColor: [20, 40, 120, 45],
      getLineColor: [0, 0, 0, 0],
      stroked: false,
      filled: true,
      updateTriggers: { getFillColor: [now.getTime()] },
    }),

    // ── Layer 3: glowing terminator edge line ─────────────────────────────
    // Bright blue-white glow that makes the day/night boundary visually pop.
    new GeoJsonLayer({
      id: 'terminator-edge',
      data: twilightLineGeoJson,
      visible,
      getLineColor: [140, 180, 255, 150],
      getLineWidth: 3,
      lineWidthMinPixels: 1.5,
      stroked: true,
      filled: false,
      updateTriggers: { getLineColor: [now.getTime()] },
    }),
  ];
}
