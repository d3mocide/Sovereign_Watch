import type { LogLevel } from '../../api/metrics';

export interface PollerHealth {
  id: string;
  name: string;
  group: string;
  status: 'healthy' | 'stale' | 'error' | 'pending' | 'no_credentials' | 'unknown' | 'active';
  last_success: number | null;
  last_error_ts: number | null;
  last_error_msg: string | null;
  history?: number[];
}

export interface ActivityData {
  time: string;
  counts: Record<string, number>;
}

export interface TakBreakdown {
  type: string;
  label: string;
  category: string;
  color: string;
  count: number;
}

export interface TakMetrics {
  noise_pct: number;
  efficiency_pct: number;
  total_count: number;
}

export interface TakBreakdownResponse {
  status: string;
  data: TakBreakdown[];
  metrics: TakMetrics;
}

export interface LogEntry {
  ts: string;
  level: LogLevel;
  logger: string;
  msg: string;
}

export interface ThroughputData {
  throughput: Record<string, { kb_per_sec: number; total_bytes: number }>;
  total_bandwidth_mb: number;
}

export interface SensorRadar {
  label: string;
  density: number;
  horizon: number;
}

export interface SensorIntegrityTrend {
  time: string;
  nic: number;
  nacp: number;
}

export interface SensorMetrics {
  radar: SensorRadar[];
  integrity_trends: SensorIntegrityTrend[];
}

export interface FusionMetrics {
  latency_ms: number;
  dedup_efficiency: number;
  storage: {
    total_mb: number;
    velocity_mb_hr: number;
    retention_full_pct: number;
  };
}

export interface ProtocolWatchlistEntry {
  id: string;
  type: string;
  callsign: string;
  affiliation: string;
  speed: number;
  alt: number;
  is_extreme: boolean;
  ts: string;
}

export interface ProtocolIntelligence {
  persistence: { type: string; seconds: number }[];
  watchlist: ProtocolWatchlistEntry[];
}

export type TabName = 'protocol' | 'operations' | 'sensors' | 'audit';
