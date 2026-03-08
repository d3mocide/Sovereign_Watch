/**
 * JS8Call standard calling frequencies and operational notes.
 * Sources: js8call-kiwi-research.md, JS8Call community conventions.
 *
 * All frequencies are dial frequencies in kHz (USB mode).
 * JS8Call signal occupies roughly 50–2500 Hz above the dial frequency.
 */

export interface JS8BandPreset {
  label: string;
  freqKhz: number;
  /** Human-readable propagation / usage guidance */
  note: string;
  /** If true, mark as a primary/recommended band in the UI */
  primary?: boolean;
}

export const JS8_BAND_PRESETS: JS8BandPreset[] = [
  { label: '160m', freqKhz: 1842,   note: 'Night regional (≈2 kHz above FT8)' },
  { label: '80m',  freqKhz: 3578,   note: 'Evening/night regional' },
  { label: '40m',  freqKhz: 7078,   note: 'Most consistent activity', primary: true },
  { label: '30m',  freqKhz: 10130,  note: 'Intermittent, high-quality QSOs' },
  { label: '20m',  freqKhz: 14078,  note: 'Active daytime, DX', primary: true },
  { label: '17m',  freqKhz: 18104,  note: 'Experimental/QRP' },
  { label: '15m',  freqKhz: 21078,  note: 'Daytime, solar-dependent' },
  { label: '12m',  freqKhz: 24922,  note: 'Sporadic, solar maximum only' },
  { label: '10m',  freqKhz: 28078,  note: 'Sporadic, solar maximum only' },
  { label: '6m',   freqKhz: 50318,  note: 'VHF, Sporadic-E openings' },
  { label: '2m',   freqKhz: 144178, note: 'VHF local QSOs' },
];

/**
 * JS8Call frame speed modes.
 * SNR thresholds represent minimum signal for reliable decode.
 */
export interface JS8SpeedMode {
  id: 'NORMAL' | 'FAST' | 'TURBO' | 'SLOW';
  label: string;
  frameSec: number;
  /** Minimum SNR (dB) for reliable decode */
  snrThreshold: number;
  note: string;
}

export const JS8_SPEED_MODES: JS8SpeedMode[] = [
  { id: 'SLOW',   label: 'Slow',   frameSec: 30, snrThreshold: -28, note: 'Best for weak signals' },
  { id: 'NORMAL', label: 'Normal', frameSec: 15, snrThreshold: -24, note: 'Standard mode' },
  { id: 'FAST',   label: 'Fast',   frameSec: 10, snrThreshold: -20, note: 'Faster QSOs' },
  { id: 'TURBO',  label: 'Turbo',  frameSec: 6,  snrThreshold: -18, note: 'Strong signals only' },
];

/** Return the SNR threshold for a given speed mode ID */
export function snrThresholdForMode(modeId: JS8SpeedMode['id']): number {
  return JS8_SPEED_MODES.find(m => m.id === modeId)?.snrThreshold ?? -24;
}
