/**
 * buildAuroraLayer — NOAA Auroral Oval visualization layer.
 *
 * Renders the NOAA 1-hour aurora forecast as a ScatterplotLayer of intensity
 * points. Each point's radius and color encode the local aurora probability
 * (0–100%). The result is an organic, shimmering aurora oval on the map.
 *
 * Data source: /api/space-weather/aurora (GeoJSON FeatureCollection)
 * Each feature: Point geometry, property `aurora` (0–100).
 */

import { ScatterplotLayer } from "@deck.gl/layers";

/** Color ramp for aurora intensity:
 *  0–20%  : deep teal-green, very faint
 *  20–50% : bright green
 *  50–80% : cyan-green
 *  80–100%: white-green (peak aurora)
 */
function auroraColor(intensity: number, now: number): [number, number, number, number] {
  // Gentle shimmer: alpha oscillates slightly at 3-second period
  const shimmer = (Math.sin(now / 3000) + 1) / 2; // 0–1

  const t = Math.min(intensity / 100, 1.0);

  // Color interpolation: teal → bright green → cyan-white
  let r: number, g: number, b: number;
  if (t < 0.4) {
    // Dark teal to green
    const s = t / 0.4;
    r = Math.round(0 + s * 30);
    g = Math.round(120 + s * 135);
    b = Math.round(80 - s * 30);
  } else if (t < 0.75) {
    // Green to cyan-green
    const s = (t - 0.4) / 0.35;
    r = Math.round(30 + s * 20);
    g = Math.round(255);
    b = Math.round(50 + s * 80);
  } else {
    // Cyan-green to near-white
    const s = (t - 0.75) / 0.25;
    r = Math.round(50 + s * 180);
    g = 255;
    b = Math.round(130 + s * 100);
  }

  const baseAlpha = 30 + t * 130;
  const alpha = Math.round(baseAlpha + shimmer * 25);

  return [r, g, b, alpha];
}

export function buildAuroraLayer(
  auroraData: any,
  visible: boolean,
  globeMode: boolean,
  now: number,
): any[] {
  if (!visible || !auroraData?.features?.length) return [];

  const features = auroraData.features as Array<{
    geometry: { coordinates: [number, number] };
    properties: { aurora: number };
  }>;

  // Filter to meaningful intensities (≥1% avoids cluttering quiet zones)
  const data = features.filter((f) => (f.properties?.aurora ?? 0) >= 1);

  if (!data.length) return [];

  return [
    new ScatterplotLayer({
      id: `aurora-oval-${globeMode ? "globe" : "merc"}`,
      data,
      getPosition: (d: any) => [
        d.geometry.coordinates[0],
        d.geometry.coordinates[1],
        0,
      ],
      getRadius: (d: any) => {
        // Radius in meters: scale with intensity. At 100% → ~120 km cell radius
        // NOAA aurora grid is roughly 1° × 1°, so points are ~111 km apart.
        // We use a fixed ~55 km (half the grid spacing) so cells tile without gaps.
        const intensity = d.properties?.aurora ?? 0;
        return 55_000 + intensity * 500;
      },
      radiusUnits: "meters",
      getFillColor: (d: any) => auroraColor(d.properties?.aurora ?? 0, now),
      pickable: false,
      wrapLongitude: !globeMode,
      parameters: {
        depthTest: !!globeMode,
        depthBias: globeMode ? -5.0 : 0,
        // Additive blending gives the aurora a natural luminous glow
        blend: true,
        blendFunc: [770, 1], // SRC_ALPHA, ONE (additive)
      },
      updateTriggers: {
        getFillColor: [now],
      },
    }),
  ];
}
