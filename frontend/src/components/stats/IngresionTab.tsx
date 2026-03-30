import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Activity } from 'lucide-react';
import type { PollerHealth, ActivityData, TakBreakdown } from './types';

interface Props {
  healthData: PollerHealth[];
  activityData: ActivityData[];
  takBreakdown: TakBreakdown[];
  loading: boolean;
}

export default function IngresionTab({ healthData, activityData, takBreakdown, loading }: Props) {
  const totalSignals = useMemo(
    () => takBreakdown.reduce((acc, b) => acc + b.count, 0),
    [takBreakdown]
  );

  const chartOptions = useMemo(() => {
    const times = activityData.map(d =>
      new Date(d.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
    const typesSet = new Set<string>();
    activityData.forEach(d => Object.keys(d.counts).forEach(k => typesSet.add(k)));
    const types = Array.from(typesSet);
    const getColor = (t: string) => takBreakdown.find(b => b.type === t)?.color ?? '#39FF14';

    const series = types.map(type => ({
      name: type.toUpperCase(),
      type: 'line',
      smooth: true,
      showSymbol: false,
      areaStyle: {
        opacity: 0.3,
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: getColor(type) },
            { offset: 1, color: 'rgba(57, 255, 20, 0)' },
          ],
        },
      },
      lineStyle: { color: getColor(type), width: 2 },
      itemStyle: { color: getColor(type) },
      data: activityData.map(d => d.counts[type] ?? 0),
    }));

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        borderColor: '#39FF14',
        textStyle: { color: '#39FF14', fontFamily: 'monospace', fontSize: 10 },
      },
      legend: { show: false },
      grid: { left: '2%', right: '2%', bottom: '5%', top: '5%', containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: times,
        axisLine: { lineStyle: { color: 'rgba(57, 255, 20, 0.2)' } },
        axisLabel: { color: '#8eff71', opacity: 0.4, fontSize: 9 },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: 'rgba(57, 255, 20, 0.05)', type: 'dashed' } },
        axisLabel: { color: '#8eff71', opacity: 0.4, fontSize: 9 },
        axisLine: { show: false },
      },
      series,
    };
  }, [activityData, takBreakdown]);

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
              <div className="h-full flex items-center justify-center animate-pulse text-primary/30 uppercase tracking-[0.3em] font-headline">
                Synchronizing telemetry...
              </div>
            ) : (
              <ReactECharts option={chartOptions} style={{ height: '100%', width: '100%' }} />
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 xl:grid-cols-8 gap-4">
        {healthData.map(p => (
          <div key={p.id} className="bg-surface-container p-4 border border-primary/10 flex flex-col items-center gap-2 group hover:border-primary/40 transition-all font-headline text-center">
            <div className="text-[10px] text-on-surface-variant uppercase tracking-tighter truncate w-full">{p.name}</div>
            <div className="relative w-16 h-16 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-primary/10" />
                <circle
                  cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="2" fill="transparent"
                  strokeDasharray={175.9}
                  strokeDashoffset={175.9 * (1 - (p.status === 'healthy' ? 0.99 : 0.7))}
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
}
