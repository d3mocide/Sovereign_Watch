export type TrailPoint = [number, number, number, number, number?]; // [lon, lat, altitude, speed, timestamp?]

/** One continuous segment of a historical track, in deck.gl path format. */
export interface HistorySegment {
  /** [lon, lat, alt_m][] oldest → newest */
  path: [number, number, number][];
  /** true = no ADS-B data in this interval; rendered as a ghost/dashed line */
  isGap: boolean;
}

export type CoTEntity = {
  uid: string;
  lat: number;
  lon: number;
  altitude: number; // Height Above Ellipsoid in meters (0 for ships)
  type: string;
  course: number;
  speed: number;
  vspeed?: number;
  callsign: string;
  time?: number; // Source Timestamp
  lastSeen: number; // Timestamp for staleness check
  trail: TrailPoint[]; // Position history for trail lines
  smoothedTrail?: number[][]; // Pre-calculated Chaikin-smoothed path for performance
  uidHash: number; // Pre-computed phase offset for glow animation (avoids per-frame string ops)
  raw?: string; // Raw JSON payload
  _source?: string; // Data source tag (e.g., "opensky_watchlist") for spatial gate bypass
  detail?: Record<string, unknown>; // For extra properties that might be passed from the worker
  lastSourceTime?: number; // Latest timestamp from source (for ordering)
  classification?: EntityClassification;
  vesselClassification?: VesselClassification;
};

export interface VesselClassification {
  category?: string;
  shipType?: number;
  navStatus?: number;
  hazardous?: boolean;
  stationType?: string;
  flagMid?: number;
  imo?: number;
  callsign?: string;
  destination?: string;
  draught?: number;
  length?: number;
  beam?: number;
}

export interface EntityClassification {
  affiliation?: string;
  platform?: string;
  sizeClass?: string;
  icaoType?: string;
  category?: string;
  dbFlags?: number;
  operator?: string;
  registration?: string;
  description?: string;
  squawk?: string;
  emergency?: string;
  /** ADS-B Navigation Integrity Category (0-11). ≤4 = degraded GPS integrity. */
  nic?: number | null;
  /** ADS-B Navigation Accuracy Category for Position (0-11). ≤6 = degraded GPS accuracy. */
  nacP?: number | null;
}

/** A detected GPS jamming/degradation zone keyed to an H3 hex cell. */
export interface JammingZone {
  h3_index: string;
  centroid_lat: number;
  centroid_lon: number;
  confidence: number;          // 0.0–1.0
  affected_count: number;
  avg_nic: number | null;
  avg_nacp: number | null;
  kp_at_event: number;
  active: boolean;
  assessment: 'jamming' | 'space_weather' | 'mixed' | 'equipment';
  time: string;
}

/** Current space weather status from NOAA SWPC. */
export interface SpaceWeatherStatus {
  kp: number | null;
  kp_fraction?: number | null;
  storm_level: string;          // 'quiet'|'unsettled'|'active'|'G1'–'G5'
  aurora_active: boolean;
  gps_degradation_risk: 'low' | 'moderate' | 'high' | 'unknown';
  time: string | null;
}

/** One entry in the Kp-index history series. */
export interface KpHistoryPoint {
  time: string;
  kp: number;
  storm_level: string;
}

export interface IntelEvent {
  id: string;
  time: Date;
  type: 'new' | 'lost' | 'alert';
  message: string;
  entityType?: 'air' | 'sea' | 'orbital' | 'infra';
  classification?: EntityClassification;
}

export interface MissionLocation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radius_nm: number;
  created_at: string;
}

export interface MissionProps {
  savedMissions: MissionLocation[];
  currentMission: { lat: number; lon: number; radius_nm: number; } | null;
  onSwitchMission: (mission: MissionLocation) => void;
  onDeleteMission: (id: string) => void;
  onPresetSelect: (radius: number) => void;
}

export interface MapActions {
  flyTo: (lat: number, lon: number, zoom?: number) => void;
  fitBounds: (bounds: [[number, number], [number, number]]) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  searchLocal: (query: string) => CoTEntity[];
  onEntityLiveUpdate?: (entity: CoTEntity) => void;
}

export interface JS8Station {
  callsign: string;
  grid: string;
  lat: number;
  lon: number;
  snr: number;
  freq?: number;
  distance_km?: number;
  distance_mi?: number;
  bearing_deg?: number;
  ts_unix: number;
  timestamp?: string;
}

export interface JS8LogEntry {
  id: string;
  type: string;
  from?: string;
  to?: string;
  text?: string;
  snr?: number;
  timestamp?: string;
}

export interface JS8StatusLine {
  callsign: string;
  grid: string;
  freq: string;
}

export interface KiwiConfig {
  host: string;
  port: number;
  freq: number;
  mode: string;
  password?: string;
}

export interface KiwiNode {
  host: string;
  port: number;
  lat: number;
  lon: number;
  freq_min_khz: number;
  freq_max_khz: number;
  users: number;
  num_ch: number;
  distance_km: number;
  sq?: number;
  snr?: number;
}

export interface WebSDRNode {
  url: string;          // Full HTTP URL e.g. http://websdr.ewi.utwente.nl:8901/
  name: string;         // Operator callsign / name
  location: string;     // City/country
  lat: number;
  lon: number;
  bands: string[];      // e.g. ["hf", "2m", "70cm"]
  freq_min_khz: number;
  freq_max_khz: number;
  users: number;
  distance_km: number;
}

export type RFService = 'ham' | 'gmrs' | 'public_safety' | 'noaa_nwr';
export type RFMode = 'FM' | 'DMR' | 'P25' | 'D-Star' | 'Fusion' | 'NXDN' | 'TETRA';
export type EmcommFlag = 'ARES' | 'RACES' | 'SKYWARN' | 'CERT' | 'WICEN';

export interface RFSite {
  id: string;
  source: string;
  site_id: string;
  service: RFService;
  callsign: string | null;
  name: string | null;
  lat: number;
  lon: number;
  output_freq: number | null;
  input_freq: number | null;
  tone_ctcss: number | null;
  tone_dcs: string | null;
  modes: RFMode[];
  use_access: string;
  status: string;
  city: string | null;
  state: string | null;
  country: string;
  emcomm_flags: EmcommFlag[];
  meta: Record<string, unknown>;
}

export interface PassPoint {
  t: string;
  az: number;
  el: number;
  slant_range_km: number;
}

export interface PassResult {
  norad_id: string;
  name: string;
  category: string;
  aos: string;
  tca: string;
  los: string;
  max_elevation: number;
  aos_azimuth: number;
  los_azimuth: number;
  duration_seconds: number;
  points: PassPoint[];
}

export interface MapFilters {
  showAir: boolean;
  showSea: boolean;
  showHelicopter: boolean;
  showMilitary: boolean;
  showGovernment: boolean;
  showCommercial: boolean;
  showPrivate: boolean;
  showAurora: boolean;
  showSatNOGS: boolean;
  [key: string]: boolean;
}

export interface SatNOGSStation {
  id: number;
  name: string;
  status: string;
  lat: number;
  lon: number;
  altitude: number;
}

/** A parsed FCC tower record returned by /api/infra/towers */
export interface Tower {
  id: string;
  fccId: string;
  type: string;
  owner: string;
  status: string;
  heightM: number;
  elevationM: number;
  coordinates: [number, number];
}

export interface DRState {
  serverLat: number;
  serverLon: number;
  serverSpeed: number;
  serverCourseRad: number;
  serverTime: number;
  blendLat: number;
  blendLon: number;
  blendSpeed: number;
  blendCourseRad: number;
  expectedInterval: number;
}

export interface VisualState {
  lon: number;
  lat: number;
  alt: number;
}

export interface GroundTrackPoint {
  lat: number;
  lon: number;
  alt?: number;
}
