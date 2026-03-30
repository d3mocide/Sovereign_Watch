import { useState } from 'react';
import { Cpu, Terminal, Database } from 'lucide-react';
import type { SystemMetrics, LogLevel, BackupStatus } from '../../api/metrics';
import type { LogEntry } from './types';

interface Props {
  systemMetrics: SystemMetrics | null;
  logs: LogEntry[];
  backupStatus: BackupStatus | null;
}

export default function OperationsTab({ systemMetrics, logs, backupStatus }: Props) {
  const [logFilter, setLogFilter] = useState<LogLevel | null>(null);

  const filteredLogs = logFilter === null ? logs : logs.filter(l => l.level === logFilter);

  return (
    <div className="flex-1 flex flex-col p-6 min-w-0 overflow-y-auto custom-scrollbar font-headline gap-6">
      <div className="pb-4 border-b border-primary/10">
        <h1 className="text-4xl font-black tracking-tighter text-primary uppercase">OPERATIONS CENTER</h1>
        <p className="text-on-surface-variant text-[10px] mt-1 tracking-widest uppercase">
          SYSTEM VITALS · LIVE LOGS · DATABASE & BACKUP STATUS
        </p>
      </div>

      {/* Panel 1: System Vitals (Ops-02) */}
      <div className="bg-surface-container p-6 border border-primary/10">
        <h3 className="font-bold text-sm tracking-widest text-primary uppercase mb-4 flex items-center gap-2">
          <Cpu size={16} /> System Vitals
        </h3>
        {systemMetrics ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {/* CPU */}
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] uppercase text-on-surface-variant">
                <span>CPU Usage</span>
                <span className="text-primary">{systemMetrics.cpu_percent?.toFixed(1) ?? '--'}%</span>
              </div>
              <div className="h-2 bg-primary/5 border border-primary/10 overflow-hidden">
                <div
                  className="h-full bg-primary shadow-[0_0_10px_rgba(57,255,20,0.5)] transition-all duration-500"
                  style={{ width: `${systemMetrics.cpu_percent ?? 0}%` }}
                ></div>
              </div>
              {systemMetrics.cpu_per_core.length > 0 && (
                <div className="grid grid-cols-8 gap-0.5 mt-1">
                  {systemMetrics.cpu_per_core.map((c, i) => (
                    <div key={i} title={`Core ${i}: ${c}%`} className="h-3 bg-primary/5 border border-primary/10 overflow-hidden">
                      <div className="h-full bg-primary/70 transition-all duration-500" style={{ width: `${c}%` }}></div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Memory */}
            {systemMetrics.memory && (
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] uppercase text-on-surface-variant">
                  <span>Memory</span>
                  <span className="text-primary">
                    {systemMetrics.memory.used_gb} / {systemMetrics.memory.total_gb} GB ({systemMetrics.memory.percent}%)
                  </span>
                </div>
                <div className="h-2 bg-primary/5 border border-primary/10 overflow-hidden">
                  <div
                    className="h-full bg-primary shadow-[0_0_10px_rgba(57,255,20,0.5)] transition-all duration-500"
                    style={{ width: `${systemMetrics.memory.percent}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Disk */}
            {systemMetrics.disk && (
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] uppercase text-on-surface-variant">
                  <span>Disk</span>
                  <span className="text-primary">
                    {systemMetrics.disk.used_gb} / {systemMetrics.disk.total_gb} GB ({systemMetrics.disk.percent}%)
                  </span>
                </div>
                <div className="h-2 bg-primary/5 border border-primary/10 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 shadow-[0_0_10px_rgba(57,255,20,0.5)] ${
                      systemMetrics.disk.percent > 90
                        ? 'bg-error'
                        : systemMetrics.disk.percent > 75
                        ? 'bg-alert-amber'
                        : 'bg-primary'
                    }`}
                    style={{ width: `${systemMetrics.disk.percent}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Redis Health */}
            {systemMetrics.redis && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase text-on-surface-variant mb-2 font-bold">Redis Health</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div className="flex justify-between text-[10px]"><span className="text-on-surface-variant">Memory</span><span className="text-primary">{systemMetrics.redis.used_memory_mb} MB</span></div>
                  <div className="flex justify-between text-[10px]"><span className="text-on-surface-variant">Clients</span><span className="text-primary">{systemMetrics.redis.connected_clients}</span></div>
                  <div className="flex justify-between text-[10px]"><span className="text-on-surface-variant">Hit Rate</span><span className="text-primary">{systemMetrics.redis.hit_rate_pct}%</span></div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-on-surface-variant">Evicted</span>
                    <span className={systemMetrics.redis.evicted_keys > 0 ? 'text-alert-amber' : 'text-primary'}>
                      {systemMetrics.redis.evicted_keys}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Kafka Lag */}
            {systemMetrics.kafka_lag &&
              Object.entries(systemMetrics.kafka_lag).map(([group, lag]) => (
                <div key={group} className="space-y-1 xl:col-span-2">
                  <div className="flex justify-between text-[10px] uppercase text-on-surface-variant mb-2 font-bold">
                    <span>Kafka Lag: {group}</span>
                    <span
                      className={
                        lag.severity === 'ok'
                          ? 'text-primary'
                          : lag.severity === 'amber'
                          ? 'text-alert-amber'
                          : 'text-error'
                      }
                    >
                      {lag.total_lag.toLocaleString()} msgs [{lag.severity.toUpperCase()}]
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-x-6 gap-y-1">
                    {Object.entries(lag.topics).map(([topic, topicLag]) => (
                      <div key={topic} className="flex justify-between text-[10px]">
                        <span className="text-on-surface-variant truncate">{topic.replace('_raw', '')}</span>
                        <span className={topicLag > 500 ? 'text-alert-amber' : 'text-primary'}>{topicLag.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

            {/* Temperatures */}
            {systemMetrics.temperatures && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase text-on-surface-variant mb-2 font-bold">Temperatures</div>
                {Object.entries(systemMetrics.temperatures).map(([sensor, temps]) => (
                  <div key={sensor} className="flex justify-between text-[10px]">
                    <span className="text-on-surface-variant">{sensor}</span>
                    <span
                      className={
                        Math.max(...temps) > 80
                          ? 'text-error'
                          : Math.max(...temps) > 70
                          ? 'text-alert-amber'
                          : 'text-primary'
                      }
                    >
                      {Math.max(...temps)}°C
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-on-surface-variant text-[10px] uppercase animate-pulse">Loading system metrics...</div>
        )}
      </div>

      {/* Panel 2: Live Log Terminal (Ops-01) */}
      <div className="bg-surface-container border border-primary/10 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-primary/10">
          <h3 className="font-bold text-sm tracking-widest text-primary uppercase flex items-center gap-2">
            <Terminal size={16} /> Live System Logs
          </h3>
          <div className="flex gap-2">
            {(['ALL', 'WARNING', 'ERROR'] as const).map(f => (
              <button
                key={f}
                onClick={() => setLogFilter(f === 'ALL' ? null : (f as LogLevel))}
                className={`px-2 py-1 text-[9px] uppercase tracking-widest border transition-all ${
                  (f === 'ALL' && logFilter === null) || logFilter === f
                    ? 'bg-primary/10 border-primary/40 text-primary'
                    : 'border-primary/10 text-on-surface-variant hover:border-primary/20'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="h-56 overflow-y-auto font-mono text-[9px] p-4 space-y-1 bg-black/40 custom-scrollbar">
          {filteredLogs.slice(0, 200).map((log, idx) => (
            <p
              key={`${log.ts}-${idx}`}
              className={`hover:brightness-125 transition-all cursor-default ${
                log.level === 'ERROR' || log.level === 'CRITICAL'
                  ? 'text-red-400/70'
                  : log.level === 'WARNING'
                  ? 'text-yellow-400/80'
                  : 'text-primary/60'
              }`}
            >
              <span className="opacity-30 mr-4">[{new Date(log.ts).toLocaleTimeString()}]</span>
              <span
                className={`mr-2 text-[8px] ${
                  log.level === 'ERROR' || log.level === 'CRITICAL'
                    ? 'text-red-400'
                    : log.level === 'WARNING'
                    ? 'text-yellow-400'
                    : 'text-primary/40'
                }`}
              >
                [{log.level}]
              </span>
              {log.msg}
            </p>
          ))}
          {filteredLogs.length === 0 && (
            <p className="text-on-surface-variant/40 uppercase text-[9px] animate-pulse">
              {logs.length === 0 ? 'Waiting for log entries...' : `No ${logFilter} entries`}
            </p>
          )}
          <p className="animate-pulse text-primary/30">_</p>
        </div>
      </div>

      {/* Panel 3: Database & Backup (Ops-03) */}
      <div className="bg-surface-container p-6 border border-primary/10">
        <h3 className="font-bold text-sm tracking-widest text-primary uppercase mb-4 flex items-center gap-2">
          <Database size={16} /> Database & Backup
        </h3>
        {backupStatus ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <div className="text-[10px] text-on-surface-variant uppercase mb-2 font-bold">TimescaleDB Status</div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px]"><span className="text-on-surface-variant uppercase">Database Size</span><span className="text-primary">{backupStatus.db_size_mb?.toFixed(1) ?? '--'} MB</span></div>
                <div className="flex justify-between text-[10px]"><span className="text-on-surface-variant uppercase">Active Chunks</span><span className="text-primary">{backupStatus.chunk_count ?? '--'}</span></div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-on-surface-variant uppercase">Oldest Data</span>
                  <span className="text-primary text-right">
                    {backupStatus.oldest_chunk_time ? new Date(backupStatus.oldest_chunk_time).toLocaleString() : 'No data'}
                  </span>
                </div>
                <div className="flex justify-between text-[10px]"><span className="text-on-surface-variant uppercase">Retention Policy</span><span className="text-primary">{backupStatus.retention_hours}h rolling</span></div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="text-[10px] text-on-surface-variant uppercase mb-2 font-bold">Last Backup Run</div>
              {backupStatus.backup ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-on-surface-variant uppercase">Status</span>
                    <span className={backupStatus.backup.status === 'success' ? 'text-primary' : 'text-error'}>
                      {backupStatus.backup.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px]"><span className="text-on-surface-variant uppercase">Run Time</span><span className="text-primary">{new Date(backupStatus.backup.ts).toLocaleString()}</span></div>
                  <div className="flex justify-between text-[10px]"><span className="text-on-surface-variant uppercase">File Size</span><span className="text-primary">{(backupStatus.backup.size_bytes / 1024 / 1024).toFixed(1)} MB</span></div>
                  <div className="flex justify-between text-[10px]"><span className="text-on-surface-variant uppercase">Duration</span><span className="text-primary">{backupStatus.backup.duration_s}s</span></div>
                  {backupStatus.backup.error && (
                    <div className="text-[9px] text-error mt-2 font-mono">{backupStatus.backup.error}</div>
                  )}
                </div>
              ) : (
                <p className="text-on-surface-variant text-[10px] uppercase">No backup on record</p>
              )}
              <div className="mt-4 p-3 bg-surface-container-high border border-primary/5">
                <p className="text-[9px] text-on-surface-variant uppercase tracking-widest">Run backup:</p>
                <code className="text-[9px] text-primary font-mono mt-1 block">
                  python backend/scripts/backup_timescale.py --keep 7
                </code>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-on-surface-variant text-[10px] uppercase animate-pulse">Loading database stats...</div>
        )}
      </div>
    </div>
  );
}
