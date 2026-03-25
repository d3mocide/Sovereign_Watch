/**
 * SDR Waterfall Colour Maps
 *
 * Palette definitions, pre-computed colour lookup tables, and the
 * per-pixel colour function used by the WaterfallRenderer.
 */

// Colour map labels (index matches KiwiSDR SET cmap= values)
export const WF_CMAPS = [
  { label: "Kiwi", index: 0 },
  { label: "CSDR", index: 1 },
  { label: "Grey", index: 2 },
  { label: "Linear", index: 3 },
  { label: "Turbo", index: 4 },
  { label: "SdrDx", index: 5 },
] as const;

/**
 * Standard SDR Waterfall Palette Definitions.
 * Each entry is a series of [threshold, R, G, B] stops for interpolation.
 */
const PALETTES: Record<number, [number, number, number, number][]> = {
  // 0: Kiwi (Classic Blue -> Cyan -> Green -> Yellow -> Red -> White)
  0: [
    [0, 0, 0, 40],
    [60, 0, 0, 100],
    [120, 0, 255, 255],
    [165, 0, 255, 0],
    [205, 255, 255, 0],
    [240, 255, 0, 0],
    [255, 255, 255, 255],
  ],
  // 1: CSDR (Blue -> Greenish Cyan -> Pale Yellow)
  1: [
    [0, 0, 0, 0],
    [80, 0, 30, 120],
    [150, 0, 180, 180],
    [210, 180, 220, 100],
    [255, 255, 255, 180],
  ],
  // 2: Grey (Luminance only)
  2: [
    [0, 0, 0, 0],
    [255, 255, 255, 255],
  ],
  // 3: Linear (Deep Violet -> Blue -> Cyan -> Green -> Yellow -> Orange -> Red)
  3: [
    [0, 30, 0, 60],
    [42, 0, 0, 255],
    [84, 0, 255, 255],
    [126, 0, 255, 0],
    [168, 255, 255, 0],
    [210, 255, 128, 0],
    [255, 255, 0, 0],
  ],
  // 4: Turbo (Google's high-contrast perception-balanced palette)
  4: [
    [0, 48, 18, 59],
    [32, 70, 107, 227],
    [64, 40, 188, 235],
    [96, 50, 242, 152],
    [128, 163, 255, 50],
    [160, 238, 180, 40],
    [192, 243, 100, 35],
    [224, 188, 37, 20],
    [255, 122, 4, 3],
  ],
  // 5: SdrDx (High contrast technical: Navy -> Blue -> Royal -> Cyan -> Yellow -> White)
  5: [
    [0, 0, 0, 30],
    [50, 0, 0, 150],
    [100, 65, 105, 225],
    [150, 0, 255, 255],
    [200, 255, 255, 0],
    [255, 255, 255, 255],
  ],
};

/**
 * Pre-computes 256-color lookup tables for each palette.
 */
export const COLOR_TABLES = Object.entries(PALETTES).reduce(
  (acc, [idx, stops]) => {
    const table = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      let upperIdx = stops.findIndex((s) => s[0] >= i);
      if (upperIdx === -1) upperIdx = stops.length - 1;
      const lowerIdx = Math.max(0, upperIdx - 1);

      const [v0, r0, g0, b0] = stops[lowerIdx];
      const [v1, r1, g1, b1] = stops[upperIdx];

      const range = v1 - v0;
      const weight = range === 0 ? 0 : (i - v0) / range;

      table[i * 3] = r0 + (r1 - r0) * weight;
      table[i * 3 + 1] = g0 + (g1 - g0) * weight;
      table[i * 3 + 2] = b0 + (b1 - b0) * weight;
    }
    acc[parseInt(idx)] = table;
    return acc;
  },
  {} as Record<number, Uint8ClampedArray>,
);

/**
 * Returns RGB color from the pre-computed table for the given colormap index.
 */
export function sdrWaterfallColor(
  value: number,
  cmapIndex: number,
): [number, number, number] {
  const table = COLOR_TABLES[cmapIndex] || COLOR_TABLES[0];
  const v = Math.max(0, Math.min(255, Math.round(value)));
  return [table[v * 3], table[v * 3 + 1], table[v * 3 + 2]];
}
