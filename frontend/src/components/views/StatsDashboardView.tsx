import { useEffect, useState } from 'react';
import { Bell, Terminal, Settings, ShieldAlert, Download, Cpu } from 'lucide-react';
import {
  fetchSystemMetrics,
  fetchRecentLogs,
  fetchBackupStatus,
  type SystemMetrics,
  type BackupStatus,
} from '../../api/metrics';
import type { PollerHealth, ActivityData, TakBreakdown, LogEntry, TabName, ThroughputData } from '../stats/types';
import ProtocolTab from '../stats/ProtocolTab';
import NetworkingTab from '../stats/NetworkingTab';
import OperationsTab from '../stats/OperationsTab';
import PollerHealthSidebar from '../stats/PollerHealthSidebar';
import LogBar from '../stats/LogBar';

export default function StatsDashboardView() {
  const [healthData, setHealthData] = useState<PollerHealth[]>([]);
  const [activityData, setActivityData] = useState<ActivityData[]>([]);
  const [takBreakdown, setTakBreakdown] = useState<TakBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [throughputData, setThroughputData] = useState<ThroughputData>({ throughput: {}, total_bandwidth_mb: 0 });
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<TabName>('protocol');
  const [alertCount, setAlertCount] = useState(0);
  const [isLogsExpanded, setIsLogsExpanded] = useState(false);

  // Heavy stats: poller health, activity, TAK breakdown (30 s)
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [healthRes, activityRes, takRes, throughputRes] = await Promise.all([
          fetch('/api/config/poller-health'),
          fetch('/api/stats/activity?hours=24'),
          fetch('/api/stats/tak-breakdown'),
          fetch('/api/stats/throughput'),
        ]);
        if (healthRes.ok) setHealthData(await healthRes.json());
        if (activityRes.ok) { const j = await activityRes.json(); setActivityData(j.data ?? []); }
        if (takRes.ok)      { const j = await takRes.json();      setTakBreakdown(j.data ?? []); }
        if (throughputRes.ok) setThroughputData(await throughputRes.json());
      } catch (e) {
        console.error('Dashboard fetch error:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const t  = setInterval(fetchData, 30_000);
    const t2 = setInterval(async () => {
      const res = await fetch('/api/stats/throughput');
      if (res.ok) setThroughputData(await res.json());
    }, 5_000);
    return () => { clearInterval(t); clearInterval(t2); };
  }, []);

  // Operations data: real logs + system metrics + backup status (10 s)
  useEffect(() => {
    const fetchOpsData = async () => {
      try {
        const [newLogs, sysM, backup] = await Promise.all([
          fetchRecentLogs(100),
          fetchSystemMetrics(),
          fetchBackupStatus(),
        ]);
        setLogs(newLogs);
        setSystemMetrics(sysM);
        setBackupStatus(backup);
        setAlertCount(newLogs.filter(l => l.level === 'WARNING' || l.level === 'ERROR' || l.level === 'CRITICAL').length);
      } catch (e) {
        console.error('Operations fetch error:', e);
      }
    };
    fetchOpsData();
    const t = setInterval(fetchOpsData, 10_000);
    return () => clearInterval(t);
  }, []);

  const handleExportCSV = () => {
    if (!activityData.length) return;
    const typesSet = new Set<string>();
    activityData.forEach(d => Object.keys(d.counts).forEach(k => typesSet.add(k)));
    const types = Array.from(typesSet);
    const rows = [
      ['Timestamp', ...types].join(','),
      ...activityData.map(d => [d.time, ...types.map(t => d.counts[t] ?? 0)].join(',')),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sovereign_activity_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'protocol':    return <ProtocolTab takBreakdown={takBreakdown} activityData={activityData} loading={loading} />;
      case 'networking':  return <NetworkingTab healthData={healthData} throughputData={throughputData} />;
      case 'operations':  return <OperationsTab systemMetrics={systemMetrics} logs={logs} backupStatus={backupStatus} />;
    }
  };

  const NAV: { id: TabName; label: string; icon: React.ReactNode }[] = [
    { id: 'protocol',    label: 'PROTOCOL',    icon: <ShieldAlert size={16} /> },
    { id: 'networking',  label: 'NETWORKING',  icon: <Download size={16} /> },
    { id: 'operations',  label: 'OPERATIONS',  icon: <Cpu size={16} /> },
  ];

  return (
    <div className="flex flex-col h-screen bg-[#0e0e0e] text-on-surface font-sans selection:bg-primary selection:text-surface overflow-hidden">
      {/* Header */}
      <header className="bg-[#0e0e0e] shadow-[0_1px_0_0_rgba(57,255,20,0.1)] flex justify-between items-center w-full px-6 h-16 z-50 shrink-0">
        <div className="flex items-center gap-8 font-headline">
          <span className="text-2xl font-black text-primary tracking-tighter uppercase">SOVEREIGN WATCH</span>
          <nav className="hidden md:flex gap-6 items-center">
            <a className="font-headline uppercase tracking-wider text-xs text-[#8eff71]/60 hover:text-primary transition-colors" href="/">TACTICAL MAP</a>
            <a className="font-headline uppercase tracking-wider text-xs text-primary border-b border-primary/50 pb-1" href="/stats">SYSTEM STATS</a>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAlertCount(0)}
            className="p-2 text-primary hover:bg-surface-container-highest transition-all relative group"
          >
            <Bell size={18} />
            {alertCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-error text-surface text-[8px] font-black flex items-center justify-center rounded-full border border-[#0e0e0e] animate-pulse">
                {alertCount}
              </span>
            )}
            <div className="absolute -bottom-8 right-0 bg-[#0e0e0e] border border-primary/20 p-1.5 hidden group-hover:block whitespace-nowrap z-50">
              <p className="text-[8px] text-primary uppercase font-bold tracking-tighter">System Alerts: {alertCount}</p>
            </div>
          </button>
          <button
            onClick={() => setIsLogsExpanded(v => !v)}
            className={`p-2 transition-all group relative ${isLogsExpanded ? 'text-primary bg-primary/10' : 'text-primary hover:bg-surface-container-highest'}`}
          >
            <Terminal size={18} />
            <div className="absolute -bottom-8 right-0 bg-[#0e0e0e] border border-primary/20 p-1.5 hidden group-hover:block whitespace-nowrap z-50">
              <p className="text-[8px] text-primary uppercase font-bold tracking-tighter">Toggle Logs [CTRL+L]</p>
            </div>
          </button>
          <button className="p-2 text-primary hover:bg-surface-container-highest transition-all"><Settings size={18} /></button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left nav sidebar */}
        <aside className="hidden md:flex flex-col h-full py-8 gap-4 bg-[#0e0e0e] w-64 border-r border-primary/10">
          <div className="px-6 mb-4">
            <div className="flex items-center gap-3 p-3 bg-surface-container-low border border-primary/5">
              <div className="w-2 h-2 bg-primary animate-pulse"></div>
              <div>
                <div className="text-primary font-headline font-bold text-xs tracking-widest uppercase">NODE-01</div>
                <div className="text-[#8eff71]/40 text-[10px] tracking-tight uppercase">OPERATIONAL</div>
              </div>
            </div>
          </div>
          <nav className="flex flex-col gap-1 font-headline">
            {NAV.map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-6 py-3 flex items-center gap-4 uppercase tracking-[0.1em] text-[10px] transition-all border-l-4 ${
                  activeTab === id
                    ? 'bg-surface-container-highest text-primary border-primary'
                    : 'text-[#8eff71]/40 hover:text-primary border-transparent hover:bg-surface-container'
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </nav>
          <div className="mt-auto px-6 mb-8 font-headline">
            <button
              onClick={handleExportCSV}
              className="w-full bg-primary text-[#0e0e0e] py-3 font-bold text-[10px] tracking-[0.2em] uppercase hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Download size={14} /> EXPORT TELEMETRY
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden bg-background relative">
          <div className="absolute inset-0 scanline opacity-30 pointer-events-none z-10"></div>
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden border-b border-primary/10 relative z-20">
            {renderTab()}
            <PollerHealthSidebar healthData={healthData} />
          </div>
          <LogBar
            logs={logs}
            nodeCount={healthData.length}
            isExpanded={isLogsExpanded}
            onToggle={() => setIsLogsExpanded(v => !v)}
          />
        </main>
      </div>
    </div>
  );
}
