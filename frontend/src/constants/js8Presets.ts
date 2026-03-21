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

// ---------------------------------------------------------------------------
// GhostNet-specific data (S2 Underground GhostNet v1.5)
// ---------------------------------------------------------------------------

export interface GhostNetFreqPreset {
  label: string;
  freqKhz: number;
  /** 'usb' for JS8/data, 'lsb' for voice, 'usb' for RTTY (passband decode) */
  mode: 'usb' | 'lsb';
  type: 'weekly' | 'bridge' | 'rtty' | 'voice';
  note: string;
}

/** GhostNet operational frequencies (JS8, RTTY, voice).
 *  Note: 7.107 is NOT the standard JS8 calling frequency — it is GhostNet-specific.
 */
export const GHOSTNET_FREQ_PRESETS: GhostNetFreqPreset[] = [
  // Weekly net — all regions share 7.107 MHz, different UTC windows
  { label: 'GN 40m',   freqKhz: 7107,  mode: 'usb', type: 'weekly', note: 'Weekly nets — Thu (NA 0100Z / AUS 0700Z / EUR 1800Z)' },
  // Data bridges
  { label: 'BRIDGE 20m', freqKhz: 14107, mode: 'usb', type: 'bridge', note: 'Inter-continental data bridges — Saturdays' },
  { label: 'BRIDGE 80m', freqKhz: 3575,  mode: 'usb', type: 'bridge', note: 'NA/EUR–AUS data bridge — Saturdays' },
  // RTTY missed check-in broadcasts
  { label: 'RTTY',     freqKhz: 7077,  mode: 'usb', type: 'rtty',   note: 'Blind broadcast 45.45 baud — Thu (NA 0200Z / AUS 0800Z / EUR 1900Z)' },
  // Emergency voice (last resort)
  { label: 'VOICE',    freqKhz: 7190,  mode: 'lsb', type: 'voice',  note: 'Emergency voice LSB — Thu (NA 0230Z / AUS 0830Z / EUR 1930Z)' },
];

/** GhostNet JS8Call group tags for inbox monitoring and TX targeting. */
export const GHOSTNET_GROUPS = [
  { id: '@GHOSTNET', note: 'General routine traffic' },
  { id: '@GSTFLASH', note: 'FLASH emergency — retransmit immediately by any means' },
  { id: '@ALLCALL',  note: 'Broadcast to all stations' },
] as const;

export type GhostNetGroupId = typeof GHOSTNET_GROUPS[number]['id'];

export interface GhostNetNetEntry {
  region: string;
  day: 'THU' | 'SAT';
  timeUtc: string;
  /** Start hour UTC (for highlighting active window) */
  startHourZ: number;
  /** End hour UTC */
  endHourZ: number;
  band: string;
  js8Khz: number | null;
  rttyKhz: number | null;
  voiceKhz: number | null;
}

/** Full GhostNet weekly schedule (all times UTC). */
export const GHOSTNET_SCHEDULE: GhostNetNetEntry[] = [
  // Thursday — regional check-ins
  { region: 'North America', day: 'THU', timeUtc: '0100–0300Z', startHourZ: 1,  endHourZ: 3,  band: '40m',    js8Khz: 7107,  rttyKhz: 7077, voiceKhz: 7190 },
  { region: 'Australia',     day: 'THU', timeUtc: '0700–0900Z', startHourZ: 7,  endHourZ: 9,  band: '40m',    js8Khz: 7107,  rttyKhz: 7077, voiceKhz: 7190 },
  { region: 'Europe',        day: 'THU', timeUtc: '1800–2000Z', startHourZ: 18, endHourZ: 20, band: '40m',    js8Khz: 7107,  rttyKhz: 7077, voiceKhz: 7190 },
  // Saturday — data bridges
  { region: 'AUS–S.Pacific', day: 'SAT', timeUtc: '0800–1000Z', startHourZ: 8,  endHourZ: 10, band: '20m/40m', js8Khz: 14107, rttyKhz: null, voiceKhz: null },
  { region: 'NA–Australia',  day: 'SAT', timeUtc: '1200–1400Z', startHourZ: 12, endHourZ: 14, band: '20m/80m', js8Khz: 14107, rttyKhz: null, voiceKhz: null },
  { region: 'NA–Europe',     day: 'SAT', timeUtc: '1800–2000Z', startHourZ: 18, endHourZ: 20, band: '20m',    js8Khz: 14107, rttyKhz: null, voiceKhz: null },
  { region: 'EUR–Australia', day: 'SAT', timeUtc: '2000–2200Z', startHourZ: 20, endHourZ: 22, band: '20m/80m', js8Khz: 14107, rttyKhz: null, voiceKhz: null },
];
