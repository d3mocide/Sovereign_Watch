import React, { useEffect, useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Activity, Download, Server, Database, Info } from 'lucide-react';

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

export default function StatsDashboardView() {
  const [healthData, setHealthData] = useState<PollerHealth[]>([]);
  const [activityData, setActivityData] = useState<ActivityData[]>([]);
  const [takBreakdown, setTakBreakdown] = useState<TakBreakdown[]>([]);
  const [loading, setLoading] = useState(true);

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

  const chartOptions = useMemo(() => {
    const times = activityData.map(d => new Date(d.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    
    // Extract unique types across all buckets
    const typesSet = new Set<string>();
    activityData.forEach(d => Object.keys(d.counts).forEach(k => typesSet.add(k)));
    const types = Array.from(typesSet);

    // Map colors from breakdown if available
    const getColor = (t: string) => takBreakdown.find(b => b.type === t)?.color || '#888';

    const series = types.map(type => ({
      name: type.toUpperCase(),
      type: 'line',
      stack: 'total',
      smooth: true,
      showSymbol: false,
      areaStyle: { opacity: 0.2 },
      lineStyle: { color: getColor(type) },
      itemStyle: { color: getColor(type) },
      data: activityData.map(d => d.counts[type] || 0)
    }));

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        borderColor: '#0f0',
        textStyle: { color: '#0f0', fontFamily: 'monospace', fontSize: 10 }
      },
      legend: {
        data: types.map(t => t.toUpperCase()),
        textStyle: { color: '#888', fontSize: 10 },
        bottom: 0,
        type: 'scroll'
      },
      grid: { left: '3%', right: '4%', bottom: '20%', top: '5%', containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: times,
        axisLine: { lineStyle: { color: '#333' } },
        axisLabel: { color: '#888', fontSize: 10 }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#111' } },
        axisLabel: { color: '#888', fontSize: 10 }
      },
      series
    };
  }, [activityData, takBreakdown]);

  const takChartOptions = useMemo(() => {
    return {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        borderColor: '#0f0',
        textStyle: { color: '#0f0', fontFamily: 'monospace' }
      },
      series: [
        {
          name: 'TAK TYPE',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 4,
            borderColor: '#111',
            borderWidth: 2
          },
          label: { show: false },
          emphasis: {
            label: {
              show: true,
              fontSize: 12,
              fontWeight: 'bold',
              color: '#0f0'
            }
          },
          labelLine: { show: false },
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
    <div className="flex flex-col h-screen bg-black text-[#0f0] font-mono overflow-hidden">
      <header className="flex justify-between items-center p-6 border-b border-[#0f0]/20 bg-black z-10">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Activity className="text-[#0f0]" /> 
            SOVEREIGN WATCH // SYSTEM STATS
          </h1>
          <p className="text-sm text-[#0f0]/50 mt-1">15-MINUTE BATCHED TELEMETRY & SYSTEM HEALTH</p>
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

      <main className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-[#0f0]/20">
        {loading ? (
          <div className="flex items-center justify-center p-20 animate-pulse text-[#0f0]/50">
            INITIALIZING TELEMETRY...
          </div>
        ) : (
          <div className="space-y-6 max-w-[1600px] mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <div className="bg-[#111] border border-[#0f0]/20 rounded p-4 h-full">
                  <h2 className="text-lg font-bold mb-4 flex items-center gap-2 uppercase tracking-tighter">
                    <Activity size={18} /> Global Signal Activity (24H)
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
              
              <div className="bg-[#111] border border-[#0f0]/20 rounded p-4">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 uppercase tracking-tighter">
                  <Server size={18} /> Container Health
                </h2>
                <div className="flex flex-col gap-3">
                  {healthData.map(p => (
                    <div key={p.id} className="flex items-center justify-between border-b border-[#0f0]/10 pb-3 last:border-0 last:pb-0">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-white uppercase">{p.name}</span>
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-[#111] border border-[#0f0]/20 rounded p-4">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 uppercase tracking-tighter">
                  <Database size={18} /> TAK Protocol Breakdown
                </h2>
                <div className="h-[250px]">
                  <ReactECharts option={takChartOptions} style={{ height: '100%', width: '100%' }} />
                </div>
              </div>

              <div className="lg:col-span-2 bg-[#111] border border-[#0f0]/20 rounded p-4">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 uppercase tracking-tighter">
                  <Info size={18} /> CoT Hierarchical Reference Guide
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {takBreakdown.map(tak => (
                    <div key={tak.type} className="flex items-center gap-3 p-2 rounded bg-white/5 border border-white/5 hover:border-[#0f0]/30 transition-all group">
                      <div className="w-1.5 h-10 rounded-full" style={{ backgroundColor: tak.color }}></div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-bold text-white uppercase">{tak.label}</span>
                          <span className="text-[10px] font-mono text-[#0f0]/70">{tak.count.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px] uppercase opacity-50 font-mono">
                          <span>{tak.type}</span>
                          <span className="bg-white/10 px-1 rounded">{tak.category}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
