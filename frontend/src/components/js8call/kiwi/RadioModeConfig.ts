/**
 * Radio Mode Configuration
 *
 * HF band presets, KiwiSDR demodulation modes, mode metadata,
 * WebSocket URL helpers, and signal utility functions.
 */

export const HF_BANDS = [
  { label: "240m", freq: 1100 },
  { label: "160m", freq: 1850 },
  { label: "80m", freq: 3700 },
  { label: "60m", freq: 5330 },
  { label: "40m", freq: 7150 },
  { label: "30m", freq: 10100 },
  { label: "20m", freq: 14200 },
  { label: "17m", freq: 18100 },
  { label: "15m", freq: 21250 },
  { label: "12m", freq: 24940 },
  { label: "10m", freq: 28500 },
  { label: "6m", freq: 50000 },
  { label: "2m", freq: 144000 },
] as const;

export const KIWI_MODES = [
  "usb",
  "lsb",
  "am",
  "amn",
  "amw",
  "sam",
  "cw",
  "cwn",
  "nbfm",
  "drm",
  "iq",
] as const;

import { resolveWebSocketUrl } from "../../../utils/network";

export type KiwiMode = (typeof KIWI_MODES)[number];

export const MODE_INFO: Record<KiwiMode, { label: string; bw: number }> = {
  usb: { label: "USB", bw: 2.7 },
  lsb: { label: "LSB", bw: 2.7 },
  am: { label: "AM", bw: 9.0 },
  amn: { label: "AMN", bw: 5.0 },
  amw: { label: "AMW", bw: 16.0 },
  sam: { label: "SAM", bw: 9.0 },
  cw: { label: "CW", bw: 0.5 },
  cwn: { label: "CWN", bw: 0.3 },
  nbfm: { label: "FM", bw: 16.0 },
  drm: { label: "DRM", bw: 10.0 },
  iq: { label: "IQ", bw: 30.0 },
};

export function getWsBaseUrl(): string {
  return resolveWebSocketUrl(import.meta.env.VITE_JS8_WS_URL, "/js8/ws/js8");
}

export const WS_BASE_URL = getWsBaseUrl();
export const WATERFALL_WS_URL = WS_BASE_URL.replace(/\/ws\/js8$/, "/ws/waterfall");

/**
 * Returns the total waterfall span in kHz for a given KiwiSDR zoom level (0-14).
 * Zoom 0 = ~30,000 kHz, Zoom 5 = ~937.5 kHz, etc.
 */
export function getWideSpan(zoom: number): number {
  return 30000 / Math.pow(2, zoom);
}

/**
 * Converts a dBm signal level to an S-meter reading with display label and colour class.
 */
export function dbmToSmeter(dbm: number): {
  label: string;
  pct: number;
  color: string;
} {
  const pct = Math.min(100, Math.max(0, ((dbm + 127) / 97) * 100));
  let label: string;
  if (dbm >= -73) {
    const over = Math.round(dbm + 73);
    label = `S9+${over}`;
  } else {
    const s = Math.max(0, Math.min(9, Math.round((dbm + 127) / 6)));
    label = `S${s}`;
  }
  const color =
    pct > 70
      ? "text-rose-500"
      : pct > 45
        ? "text-amber-400"
        : "text-emerald-500";
  return { label, pct, color };
}
