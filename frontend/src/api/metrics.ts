/**
 * Metrics API client — wraps the Operations dashboard endpoints:
 *   GET /api/metrics/system       (Ops-02: host vitals + Redis + Kafka lag)
 *   GET /api/logs/recent          (Ops-01: structured log stream)
 *   GET /api/metrics/backup-status (Ops-03: TimescaleDB chunk stats + backup)
 */

// ── System Metrics ─────────────────────────────────────────────────────────

export interface MemoryStats {
  total_gb: number;
  used_gb: number;
  percent: number;
}

export interface DiskStats {
  total_gb: number;
  used_gb: number;
  percent: number;
}

export interface IOStats {
  read_mb: number;
  write_mb: number;
}

export interface NetIOStats {
  sent_mb: number;
  recv_mb: number;
}

export interface RedisHealth {
  used_memory_mb: number;
  connected_clients: number;
  hit_rate_pct: number;
  evicted_keys: number;
}

export interface KafkaGroupLag {
  total_lag: number;
  severity: 'ok' | 'amber' | 'red';
  topics: Record<string, number>;
}

export interface SystemMetrics {
  cpu_percent: number | null;
  cpu_per_core: number[];
  memory: MemoryStats | null;
  disk: DiskStats | null;
  disk_io: IOStats | null;
  net_io: NetIOStats | null;
  temperatures: Record<string, number[]> | null;
  redis: RedisHealth | null;
  kafka_lag: Record<string, KafkaGroupLag> | null;
}

export async function fetchSystemMetrics(): Promise<SystemMetrics> {
  const res = await fetch('/api/metrics/system');
  if (!res.ok) throw new Error(`System metrics fetch failed (${res.status})`);
  return res.json();
}

// ── Log Entries ────────────────────────────────────────────────────────────

export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  logger: string;
  msg: string;
}

export interface RecentLogsResponse {
  status: string;
  logs: LogEntry[];
}

export async function fetchRecentLogs(
  limit = 100,
  level?: LogLevel
): Promise<LogEntry[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (level) params.set('level', level);
  const res = await fetch(`/api/logs/recent?${params}`);
  if (!res.ok) throw new Error(`Log fetch failed (${res.status})`);
  const data: RecentLogsResponse = await res.json();
  return data.logs ?? [];
}

// ── Backup Status ──────────────────────────────────────────────────────────

export interface BackupRun {
  ts: string;
  status: 'success' | 'error';
  file: string;
  size_bytes: number;
  duration_s: number;
  error: string | null;
}

export interface BackupStatus {
  status: string;
  db_size_mb: number | null;
  chunk_count: number | null;
  oldest_chunk_time: string | null;
  retention_hours: number;
  backup: BackupRun | null;
}

export async function fetchBackupStatus(): Promise<BackupStatus> {
  const res = await fetch('/api/metrics/backup-status');
  if (!res.ok) throw new Error(`Backup status fetch failed (${res.status})`);
  return res.json();
}
