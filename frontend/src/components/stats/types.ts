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

export interface LogEntry {
  ts: string;
  level: LogLevel;
  logger: string;
  msg: string;
}

export type TabName = 'ingression' | 'protocol' | 'networking' | 'analysis' | 'operations';

export interface ThroughputData {
  throughput: Record<string, { kb_per_sec: number; total_bytes: number }>;
  total_bandwidth_mb: number;
}
