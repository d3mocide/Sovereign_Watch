import React, { useEffect, useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Activity, Download, Server } from 'lucide-react';

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

export default function StatsDashboardView() {
  const [healthData, setHealthData] = useState<PollerHealth[]>([]);
  const [activityData, setActivityData] = useState<ActivityData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [healthRes, activityRes] = await Promise.all([
          fetch('/api/config/poller-health'),
          fetch('/api/stats/activity?hours=24')
        ]);
        
        if (healthRes.ok) setHealthData(await healthRes.json());
        if (activityRes.ok) {
          const actJson = await activityRes.json();
          setActivityData(actJson.data || []);
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

  const chartOptions = useMemo(() => {
    const times = activityData.map(d => new Date(d.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    
    // Extract unique types across all buckets
    const typesSet = new Set<string>();
    activityData.forEach(d => Object.keys(d.counts).forEach(k => typesSet.add(k)));
    const types = Array.from(typesSet);

    const series = types.map(type => ({
      name: type.toUpperCase(),
      type: 'line',
      smooth: true,
      showSymbol: false,
      areaStyle: { opacity: 0.1 },
      data: activityData.map(d => d.counts[type] || 0)
    }));

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        borderColor: '#0f0',
        textStyle: { color: '#0f0', fontFamily: 'monospace' }
      },
      legend: {
        data: types.map(t => t.toUpperCase()),
        textStyle: { color: '#888' },
        bottom: 0
      },
      grid: { left: '3%', right: '4%', bottom: '15%', top: '5%', containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: times,
        axisLine: { lineStyle: { color: '#333' } },
        axisLabel: { color: '#888' }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#111' } },
        axisLabel: { color: '#888' }
      },
      series
    };
  }, [activityData]);

  const handleExportCSV = () => {
    if (!activityData.length) return;
    
    // Header
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
    healthy: 'text-green-400 bg-green-400/10 border-green-400/30',
    active: 'text-green-400 bg-green-400/10 border-green-400/30',
    stale: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
    error: 'text-red-400 bg-red-400/10 border-red-400/30',
    pending: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
    no_credentials: 'text-gray-500 bg-gray-500/10 border-gray-500/30',
    unknown: 'text-gray-500 bg-gray-500/10 border-gray-500/30'
  };

  return (
    <div className="min-h-screen bg-black text-[#0f0] font-mono p-6">
      <header className="flex justify-between items-center mb-8 border-b border-[#0f0]/20 pb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Activity className="text-[#0f0]" /> 
            SOVEREIGN WATCH // SYSTEM STATS
          </h1>
          <p className="text-sm text-[#0f0]/50 mt-1">15-MINUTE BATCHED TELEMETRY & CONTAINER HEALTH</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 border border-[#0f0]/50 hover:bg-[#0f0]/10 px-4 py-2 rounded text-sm transition-colors"
          >
            <Download size={16} /> EXPORT CSV
          </button>
          <a 
            href="/"
            className="flex items-center gap-2 border border-[#0f0]/50 hover:bg-[#0f0]/10 px-4 py-2 rounded text-sm transition-colors"
          >
            RETURN TO TACTICAL
          </a>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center p-20 animate-pulse text-[#0f0]/50">
          INITIALIZING TELEMETRY...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#111] border border-[#0f0]/20 rounded p-4">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Activity size={18} /> GLOBAL SIGNAL ACTIVITY (24H)
              </h2>
              <div className="h-[400px]">
                {activityData.length > 0 ? (
                  <ReactECharts 
                    option={chartOptions} 
                    style={{ height: '100%', width: '100%' }}
                    onEvents={{
                      click: (params: any) => {
                        console.log("Drill-down triggered for:", params.name, params.seriesName);
                        alert(`Drill-down feature placeholder.\nTime: ${params.name}\nType: ${params.seriesName}\nValue: ${params.value}`);
                      }
                    }}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-[#0f0]/30 border border-dashed border-[#0f0]/20">
                    NO ACTIVITY DATA
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="bg-[#111] border border-[#0f0]/20 rounded p-4">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Server size={18} /> CONTAINER HEALTH
              </h2>
              <div className="flex flex-col gap-3">
                {healthData.map(p => (
                  <div key={p.id} className="flex items-center justify-between border-b border-[#0f0]/10 pb-3 last:border-0 last:pb-0">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-white">{p.name}</span>
                      <span className="text-[10px] text-[#0f0]/50 uppercase">{p.group}</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded border uppercase ${statusColors[p.status] || statusColors.unknown}`}>
                      {p.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
