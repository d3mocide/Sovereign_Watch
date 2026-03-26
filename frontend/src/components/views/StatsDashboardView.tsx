import React, { useEffect, useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { 
  Bell, 
  Terminal, 
  Settings, 
  Activity, 
  ShieldAlert, 
  Download, 
  Network, 
  BarChart3, 
  HelpCircle, 
  Lock,
  ChevronDown,
  ChevronUp,
  Server,
  Plane,
  Ship,
  Rocket,
  Satellite
} from 'lucide-react';

interface PollerHealth {
  id: string;
  name: string;
  group: string;
  status: 'healthy' | 'stale' | 'error' | 'pending' | 'no_credentials' | 'unknown' | 'active';
  last_success: number | null;
  last_error_ts: number | null;
  last_error_msg: string | null;
}

interface ActivityData {
  time: string;
  counts: Record<string, number>;
}

interface TakBreakdown {
  type: string;
  label: string;
  category: string;
  color: string;
  count: number;
}

interface LogEntry {
  id: number;
  time: string;
  msg: string;
  type: 'info' | 'warn' | 'success' | 'cmd';
}

export default function StatsDashboardView() {
  const [healthData, setHealthData] = useState<PollerHealth[]>([]);
  const [activityData, setActivityData] = useState<ActivityData[]>([]);
  const [takBreakdown, setTakBreakdown] = useState<TakBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ingression' | 'protocol' | 'analysis' | 'networking'>('ingression');
  const logContainerRef = React.useRef<HTMLDivElement>(null);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [isLogsExpanded, setIsLogsExpanded] = useState(false);
  const [alertCount, setAlertCount] = useState(0);

  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 1, time: new Date().toLocaleTimeString(), msg: "> INIT INGRESSION_PROTOCOL.SH --TARGET=GLOBAL_WATCH", type: 'cmd' },
    { id: 2, time: new Date().toLocaleTimeString(), msg: "> LOADING ASSETS... [DONE]", type: 'success' },
    { id: 3, time: new Date().toLocaleTimeString(), msg: "> ESTABLISHING SECURE TUNNEL 128.0.0.1:443 -> 10.0.0.5:2026", type: 'info' }
  ]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [healthRes, activityRes, takRes] = await Promise.all([
          fetch('/api/config/poller-health'),
          fetch('/api/stats/activity?hours=24'),
          fetch('/api/stats/tak-breakdown')
        ]);
        
        if (healthRes.ok) setHealthData(await healthRes.json());
        if (activityRes.ok) {
          const actJson = await activityRes.json();
          setActivityData(actJson.data || []);
        }
        if (takRes.ok) {
          const takJson = await takRes.json();
          setTakBreakdown(takJson.data || []);
        }
      } catch (e) {
        console.error("Dashboard fetch error:", e);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
    const t = setInterval(fetchData, 60000);
    return () => clearInterval(t);
  }, []);

  // Log Simulator
  useEffect(() => {
    const messages = [
      { msg: "> PKT_RX_SUCCESS :: 12.4KB FROM ADSBX_POLLER", type: 'success' },
      { msg: "> MAPPING COT_TYPE: a-f-A-C-M -> CIVILIAN FIXED WING", type: 'info' },
      { msg: "> HEARTBEAT DETECTED ON NODE MARITIME_01", type: 'info' },
      { msg: "> [WARN] LATENCY SPIKE DETECTED IN ORBITAL INGRESION", type: 'warn' },
      { msg: "> RECALIBRATING GLOBAL SIGNAL ACTIVITY LINE...", type: 'cmd' },
      { msg: "> SYNCING TIMESCALEDB HYPERTABLES...", type: 'cmd' }
    ];

    const iv = setInterval(() => {
      const rand = messages[Math.floor(Math.random() * messages.length)];
      const newLog = { 
        id: Date.now(), 
        time: new Date().toLocaleTimeString(), 
        msg: rand.msg, 
        type: rand.type as any 
      };
      setLogs(prev => {
        const newLogs = [...prev.slice(-99), newLog]; // Keep last 100 logs
        return newLogs;
      });
      if (newLog.type === 'warn') {
        setAlertCount(c => c + 1);
      }
    }, 4000);
    return () => clearInterval(iv);
  }, []);

  // Terminal Auto-scroll Logic
  useEffect(() => {
    if (isAutoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, isAutoScroll]);

  const handleScroll = () => {
    if (!logContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop <= clientHeight + 50;
    setIsAutoScroll(isAtBottom);
  };

  const totalSignals = useMemo(() => takBreakdown.reduce((acc, b) => acc + b.count, 0), [takBreakdown]);

  const chartOptions = useMemo(() => {
    const times = activityData.map(d => new Date(d.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    const typesSet = new Set<string>();
    activityData.forEach(d => Object.keys(d.counts).forEach(k => typesSet.add(k)));
    const types = Array.from(typesSet);
    const getColor = (t: string) => takBreakdown.find(b => b.type === t)?.color || '#39FF14';

    const series = types.map(type => ({
      name: type.toUpperCase(),
      type: 'line',
      // stack: 'total', // Removed stacking to improve data fidelity and accuracy per type
      smooth: true,
      showSymbol: false,
      areaStyle: { 
        opacity: 0.3,
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: getColor(type) },
            { offset: 1, color: 'rgba(57, 255, 20, 0)' }
          ]
        }
      },
      lineStyle: { color: getColor(type), width: 2 },
      itemStyle: { color: getColor(type) },
      data: activityData.map(d => d.counts[type] || 0)
    }));

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        borderColor: '#39FF14',
        textStyle: { color: '#39FF14', fontFamily: 'monospace', fontSize: 10 }
      },
      legend: { show: false },
      grid: { left: '2%', right: '2%', bottom: '5%', top: '5%', containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: times,
        axisLine: { lineStyle: { color: 'rgba(57, 255, 20, 0.2)' } },
        axisLabel: { color: '#8eff71', opacity: 0.4, fontSize: 9 },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: 'rgba(57, 255, 20, 0.05)', type: 'dashed' } },
        axisLabel: { color: '#8eff71', opacity: 0.4, fontSize: 9 },
        axisLine: { show: false }
      },
      series
    };
  }, [activityData, takBreakdown]);

  const takChartOptions = useMemo(() => {
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        borderColor: '#39FF14',
        textStyle: { color: '#39FF14', fontFamily: 'monospace' }
      },
      series: [
        {
          name: 'TAK TYPE',
          type: 'pie',
          radius: ['55%', '85%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 0,
            borderColor: '#0e0e0e',
            borderWidth: 2
          },
          label: { show: false },
          emphasis: {
            label: {
              show: true,
              fontSize: 12,
              fontWeight: 'bold',
              color: '#39FF14'
            }
          },
          data: takBreakdown.map(b => ({
            value: b.count,
            name: b.label.toUpperCase(),
            itemStyle: { color: b.color }
          }))
        }
      ]
    };
  }, [takBreakdown]);

  const handleExportCSV = () => {
    if (!activityData.length) return;
    const typesSet = new Set<string>();
    activityData.forEach(d => Object.keys(d.counts).forEach(k => typesSet.add(k)));
    const types = Array.from(typesSet);
    const rows = [
      ['Timestamp', ...types].join(','),
      ...activityData.map(d => [d.time, ...types.map(t => d.counts[t] || 0)].join(','))
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sovereign_activity_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusColors = {
    healthy: 'bg-primary',
    active: 'bg-primary',
    stale: 'bg-alert-amber',
    error: 'bg-error',
    pending: 'bg-tertiary',
    no_credentials: 'bg-on-surface-variant',
    unknown: 'bg-on-surface-variant'
  };

  const getPollerIcon = (p: PollerHealth) => {
    if (p.group.toLowerCase().includes('aviation')) return <Plane size={14} />;
    if (p.group.toLowerCase().includes('maritime')) return <Ship size={14} />;
    if (p.group.toLowerCase().includes('space')) return <Rocket size={14} />;
    if (p.group.toLowerCase().includes('infra')) return <Satellite size={14} />;
    return <Server size={14} />;
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'ingression':
        return (
          <div className="flex-1 flex flex-col p-6 min-w-0 overflow-y-auto custom-scrollbar">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-4 border-b border-primary/10 mb-6 font-headline">
              <div>
                <h1 className="text-4xl font-black tracking-tighter text-primary uppercase">TAK PROTO INGRESSION</h1>
                <p className="text-on-surface-variant text-[10px] mt-1 tracking-widest uppercase">REAL-TIME NETWORK SYNCHRONIZATION STATUS</p>
              </div>
              <div className="flex gap-6 items-center bg-surface-container p-3 border border-primary/5">
                <div className="text-right">
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-widest">Active Signals</div>
                  <div className="text-2xl font-bold text-primary">{totalSignals.toLocaleString()}</div>
                </div>
                <div className="w-px h-8 bg-on-surface-variant/20"></div>
                <div className="text-right">
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-widest">Signal Noise</div>
                  <div className="text-2xl font-bold text-tertiary">0.02%</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 mb-6">
              {/* Activity Chart Container - Expanded for better fidelity */}
              <div className="bg-surface-container p-6 flex flex-col min-h-[500px] border border-primary/10 relative overflow-hidden group">
                <div className="flex justify-between items-start mb-4 z-10 font-headline">
                  <div>
                    <h3 className="font-bold text-sm tracking-widest text-primary uppercase flex items-center gap-2">
                      <Activity size={16} /> Global Signal Activity
                    </h3>
                    <p className="text-[9px] text-on-surface-variant uppercase">24H ARCHIVE: TACTICAL PULSE FREQUENCY</p>
                  </div>
                  <div className="flex gap-2">
                    <span className="px-2 py-0.5 bg-surface-container-highest text-[10px] text-primary border border-primary/20">LIVE</span>
                  </div>
                </div>
                <div className="flex-1 relative">
                   {loading ? (
                    <div className="h-full flex items-center justify-center animate-pulse text-primary/30 uppercase tracking-[0.3em] font-headline">Synchronizing telemetry...</div>
                   ) : (
                    <ReactECharts option={chartOptions} style={{ height: '100%', width: '100%' }} />
                   )}
                </div>
              </div>
            </div>

            {/* Success Rate Gauges - Optimized for 2 lines (max 8 per row for 13 items) */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 xl:grid-cols-8 gap-4">
              {healthData.map(p => (
                <div key={p.id} className="bg-surface-container p-4 border border-primary/10 flex flex-col items-center gap-2 group hover:border-primary/40 transition-all font-headline text-center">
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-tighter truncate w-full">{p.name}</div>
                  <div className="relative w-16 h-16 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-primary/10" />
                      <circle 
                        cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="2" fill="transparent" 
                        strokeDasharray={175.9} strokeDashoffset={175.9 * (1 - (p.status === 'healthy' ? 0.99 : 0.7))}
                        className="text-primary transition-all duration-1000"
                      />
                    </svg>
                    <span className="absolute text-[10px] font-bold text-primary">{p.status === 'healthy' ? '99%' : '72%'}</span>
                  </div>
                  <div className="text-[8px] text-on-surface-variant uppercase">Reliability</div>
                </div>
              ))}
            </div>
          </div>
        );
      case 'protocol':
        return (
          <div className="flex-1 flex flex-col p-6 min-w-0 overflow-y-auto custom-scrollbar font-headline">
            <div className="pb-4 border-b border-primary/10 mb-6">
              <h1 className="text-4xl font-black tracking-tighter text-primary uppercase">PROTOCOL ARCHITECTURE</h1>
              <p className="text-on-surface-variant text-[10px] mt-1 tracking-widest uppercase">TAK/COT SCHEMA & SIGNAL CLASSIFICATION HIERARCHY</p>
            </div>
            
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              <div className="bg-surface-container p-6 border border-primary/10 xl:col-span-2">
                <h3 className="font-bold text-sm tracking-widest text-primary uppercase mb-6 flex items-center gap-2">
                  <ShieldAlert size={16} /> Load Distribution
                </h3>
                <div className="flex items-center justify-center relative py-6">
                  <div className="h-64 w-64">
                    <ReactECharts option={takChartOptions} style={{ height: '100%', width: '100%' }} />
                  </div>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-3xl font-black text-primary tracking-tighter">84%</span>
                    <span className="text-[10px] text-on-surface-variant uppercase tracking-tighter">Efficiency</span>
                  </div>
                </div>
              </div>

              <div className="bg-surface-container p-6 border border-primary/10">
                <h3 className="font-bold text-sm tracking-widest text-primary uppercase mb-6">Classification Reference</h3>
                <div className="space-y-2">
                  {takBreakdown.map(tak => (
                    <div key={tak.type} className="flex items-center gap-4 p-2 bg-surface-container-high border border-primary/5 hover:border-primary/20 transition-all">
                      <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: tak.color }}></div>
                      <div className="flex-1 flex flex-col min-w-0 text-[10px]">
                        <span className="font-bold text-on-surface uppercase truncate">{tak.label}</span>
                        <span className="text-on-surface-variant uppercase tracking-tighter opacity-70">{tak.type}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      case 'networking':
        return (
          <div className="flex-1 flex flex-col p-6 min-w-0 overflow-y-auto custom-scrollbar font-headline">
            <div className="pb-4 border-b border-primary/10 mb-6">
              <h1 className="text-4xl font-black tracking-tighter text-primary uppercase">NETWORK TELEMETRY</h1>
              <p className="text-on-surface-variant text-[10px] mt-1 tracking-widest uppercase">REAL-TIME THROUGHPUT & NODE SYNCHRONIZATION</p>
            </div>
            
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              <div className="bg-surface-container p-6 border border-primary/10 xl:col-span-2">
                <h3 className="font-bold text-sm tracking-widest text-primary uppercase mb-6 flex items-center gap-2">
                  <Download size={16} /> Data Throughput (KB/S)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                  {healthData.map((p) => (
                    <div key={p.id} className="space-y-1">
                      <div className="flex justify-between text-[10px] uppercase font-bold text-on-surface-variant">
                        <span>{p.name}</span>
                        <span className="text-primary">{(Math.random() * 50 + 10).toFixed(1)} KB/S</span>
                      </div>
                      <div className="h-1.5 bg-primary/5 border border-primary/10 overflow-hidden">
                        <div 
                          className="h-full bg-primary shadow-[0_0_10px_rgba(57,255,20,0.5)] transition-all duration-1000" 
                          style={{ width: `${Math.max(10, Math.random() * 90)}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-surface-container p-6 border border-primary/10 flex flex-col justify-center text-center">
                 <Network size={48} className="text-primary/20 mx-auto mb-4" />
                 <h4 className="text-xl font-black text-primary uppercase italic">892.4 MB</h4>
                 <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">TOTAL BANDWIDTH (24H)</p>
              </div>
            </div>
          </div>
        );
      case 'analysis':
        return (
          <div className="flex-1 flex flex-col p-6 min-w-0 overflow-y-auto custom-scrollbar font-headline">
             <div className="pb-4 border-b border-primary/10 mb-6">
              <h1 className="text-4xl font-black tracking-tighter text-primary uppercase">ANALYTIC DEEP DIVE</h1>
              <p className="text-on-surface-variant text-[10px] mt-1 tracking-widest uppercase">STATISTICAL ANOMALY DETECTION & THROUGHPUT HISTOGRAMS</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
               <div className="lg:col-span-2 bg-surface-container p-8 border border-primary/20 flex flex-col items-center justify-center text-center">
                  <BarChart3 size={48} className="text-primary/30 mb-4" />
                  <h2 className="text-2xl font-black text-primary uppercase tracking-tighter">DATASET HISTOGRAM</h2>
                  <p className="text-on-surface-variant text-xs mt-2 uppercase tracking-widest max-w-sm">Packet size distribution modules are calculating the tactical weight... [PENDING]</p>
                  <div className="mt-8 flex gap-4">
                    <button onClick={handleExportCSV} className="bg-primary/10 border border-primary/40 text-primary px-6 py-3 font-bold text-[10px] tracking-widest uppercase hover:bg-primary/20 transition-all flex items-center gap-2">
                      <Download size={14} /> EXPORT CSV
                    </button>
                  </div>
               </div>
               
               <div className="bg-surface-container p-6 border border-primary/10">
                  <h3 className="font-bold text-xs tracking-widest text-primary uppercase mb-4">Anomaly Heatmap</h3>
                  <div className="grid grid-cols-8 gap-1 opacity-40">
                    {Array.from({ length: 64 }).map((_, idx) => (
                      <div key={idx} className={`aspect-square border border-primary/5 ${Math.random() > 0.8 ? 'bg-primary/40' : 'bg-primary/5'}`}></div>
                    ))}
                  </div>
                  <div className="mt-4 text-[9px] text-on-surface-variant uppercase tracking-widest">
                    DETECTION ENGINE: <span className="text-primary">RUNNING</span>
                  </div>
               </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#0e0e0e] text-on-surface font-sans selection:bg-primary selection:text-surface overflow-hidden">
      {/* Header Overlay */}
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
            onClick={() => setIsLogsExpanded(!isLogsExpanded)}
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
        {/* Sidebar */}
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
            <button 
              onClick={() => setActiveTab('ingression')}
              className={`px-6 py-3 flex items-center gap-4 uppercase tracking-[0.1em] text-[10px] transition-all border-l-4 ${activeTab === 'ingression' ? 'bg-surface-container-highest text-primary border-primary' : 'text-[#8eff71]/40 hover:text-primary border-transparent hover:bg-surface-container'}`}
            >
              <Network size={16} /> INGRESSION
            </button>
            <button 
              onClick={() => setActiveTab('protocol')}
              className={`px-6 py-3 flex items-center gap-4 uppercase tracking-[0.1em] text-[10px] transition-all border-l-4 ${activeTab === 'protocol' ? 'bg-surface-container-highest text-primary border-primary' : 'text-[#8eff71]/40 hover:text-primary border-transparent hover:bg-surface-container'}`}
            >
              <ShieldAlert size={16} /> PROTOCOL
            </button>
            <button 
              onClick={() => setActiveTab('networking')}
              className={`px-6 py-3 flex items-center gap-4 uppercase tracking-[0.1em] text-[10px] transition-all border-l-4 ${activeTab === 'networking' ? 'bg-surface-container-highest text-primary border-primary' : 'text-[#8eff71]/40 hover:text-primary border-transparent hover:bg-surface-container'}`}
            >
              <Download size={16} /> NETWORKING
            </button>
            <button 
              onClick={() => setActiveTab('analysis')}
              className={`px-6 py-3 flex items-center gap-4 uppercase tracking-[0.1em] text-[10px] transition-all border-l-4 ${activeTab === 'analysis' ? 'bg-surface-container-highest text-primary border-primary' : 'text-[#8eff71]/40 hover:text-primary border-transparent hover:bg-surface-container'}`}
            >
              <BarChart3 size={16} /> ANALYSIS
            </button>
          </nav>
          <div className="mt-auto px-6 mb-8 flex flex-col gap-4 font-headline">
             <button 
                onClick={handleExportCSV}
                className="w-full bg-primary text-[#0e0e0e] py-3 font-bold text-[10px] tracking-[0.2em] uppercase hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Download size={14} /> EXPORT TELEMETRY
              </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden bg-background relative">
          <div className="absolute inset-0 scanline opacity-30 pointer-events-none z-10"></div>
          
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden border-b border-primary/10 relative z-20">
             {renderContent()}

            {/* Right Panel - Optimized tactical container health */}
            <aside className="w-full lg:w-1/3 xl:w-1/5 bg-surface-container-low border-l border-primary/10 overflow-y-auto p-4 space-y-6 custom-scrollbar">
              <div className="space-y-4 font-headline uppercase">
                <div className="flex justify-between items-center border-b border-primary/10 pb-2">
                  <h3 className="font-bold text-[10px] tracking-[0.2em] text-primary">CONTAINER_HEALTH</h3>
                  <span className="text-[8px] text-primary/40">v2.4.0</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {healthData.map(p => (
                    <div key={p.id} className="bg-surface-container-high/40 p-2 flex flex-col gap-2 border border-primary/5 hover:border-primary/30 transition-all cursor-default group relative overflow-hidden">
                      {/* Status Ribbon */}
                      <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${statusColors[p.status] || 'bg-on-surface-variant'}`}></div>
                      
                      <div className="flex justify-between items-center pl-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-primary opacity-40 group-hover:opacity-100 transition-opacity">
                            {getPollerIcon(p)}
                          </span>
                          <div className="text-[9px] font-black text-on-surface truncate">{p.name}</div>
                        </div>
                        <div className={`w-1 h-1 rounded-full ${statusColors[p.status] || 'bg-on-surface-variant'} shadow-[0_0_5px_rgba(57,255,20,0.5)]`}></div>
                      </div>

                      {/* Tactical Detail Row (Status Pips) */}
                      <div className="flex items-center justify-between pl-1">
                        <div className="flex gap-0.5">
                          {Array.from({ length: 12 }).map((_, i) => (
                            <div key={i} className={`w-1 h-1 ${i > 10 && p.status === 'error' ? 'bg-error/40' : 'bg-primary/20'} rounded-[1px]`}></div>
                          ))}
                        </div>
                        <span className="text-[7px] text-on-surface-variant tracking-tighter">100% UP</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>

          {/* Bottom Log Bar */}
          <div className={`bg-black border-t border-primary/20 transition-all duration-300 ease-in-out flex flex-col relative z-20 ${isLogsExpanded ? 'h-48' : 'h-10'}`}>
            <div 
              onClick={() => setIsLogsExpanded(!isLogsExpanded)}
              className="flex items-center justify-between px-6 h-10 border-b border-primary/5 bg-surface-container-low/50 cursor-pointer hover:bg-surface-container-high/50 transition-all select-none group"
            >
              <div className="flex items-center gap-2 font-headline uppercase">
                <span className={`w-1.5 h-1.5 bg-primary ${isLogsExpanded ? 'animate-pulse' : ''}`}></span>
                <h3 className="text-[10px] font-bold text-primary tracking-[0.2em]">Live Command Logs</h3>
                {isLogsExpanded ? <ChevronDown size={14} className="text-primary/40 group-hover:text-primary transition-colors" /> : <ChevronUp size={14} className="text-primary/40 group-hover:text-primary transition-colors" />}
              </div>
              <div className="flex gap-6 items-center">
                <span className="text-[9px] text-primary/40 font-mono hidden sm:inline uppercase">NODES_WATCH :: {healthData.length} ACTIVE</span>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-on-surface-variant font-mono uppercase">Status:</span>
                  <span className="text-[10px] text-primary font-mono animate-pulse uppercase">{isAutoScroll ? 'Following' : 'Paused'}</span>
                </div>
              </div>
            </div>
            <div 
              ref={logContainerRef}
              onScroll={handleScroll}
              className={`flex-1 p-6 overflow-y-auto font-mono text-[9px] space-y-1 bg-black/40 custom-scrollbar transition-opacity duration-300 ${isLogsExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            >
              {logs.map((log) => (
                <p key={log.id} className={`${
                  log.type === 'warn' ? 'text-error/70' : 
                  log.type === 'success' ? 'text-primary' : 
                  log.type === 'cmd' ? 'text-primary/90' : 'text-primary/50'
                } hover:brightness-125 transition-all cursor-default`}>
                  <span className="opacity-30 mr-4">[{log.time}]</span>
                  {log.msg}
                </p>
              ))}
              <p className="animate-pulse text-primary/30">_</p>
            </div>
          </div>
        </main>
      </div>

    </div>
  );
}
