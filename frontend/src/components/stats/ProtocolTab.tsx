import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Activity, ShieldAlert } from 'lucide-react';
import type { ActivityData, TakBreakdown } from './types';

interface Props {
  takBreakdown: TakBreakdown[];
  activityData: ActivityData[];
  loading: boolean;
}

export default function ProtocolTab({ takBreakdown, activityData, loading }: Props) {
  const totalSignals = useMemo(
    () => takBreakdown.reduce((acc, b) => acc + b.count, 0),
    [takBreakdown]
  );

  const activityChartOptions = useMemo(() => {
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

  const takChartOptions = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: { show: false },
    series: [
      {
        name: 'TAK TYPE',
        type: 'pie',
        radius: ['50%', '80%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 0, borderColor: '#0e0e0e', borderWidth: 2 },
        label: {
          show: false,
          position: 'outside',
          color: '#39FF14',
          fontFamily: 'monospace',
          formatter: '{b}: {c} ({d}%)',
        },
        labelLine: { show: false, lineStyle: { color: 'rgba(57, 255, 20, 0.3)' } },
        emphasis: {
          label: { show: true, fontSize: 14, fontWeight: 'bold', color: '#39FF14', position: 'outside' },
          labelLine: { show: true },
        },
        data: takBreakdown.map(b => ({
          value: b.count,
          name: b.label.toUpperCase(),
          itemStyle: { color: b.color },
        })),
      },
    ],
  }), [takBreakdown]);

  return (
    <div className="flex-1 flex flex-col p-6 min-w-0 overflow-y-auto custom-scrollbar font-headline">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-4 border-b border-primary/10 mb-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-primary uppercase">PROTOCOL ARCHITECTURE</h1>
          <p className="text-on-surface-variant text-[10px] mt-1 tracking-widest uppercase">TAK/COT SCHEMA & SIGNAL CLASSIFICATION HIERARCHY</p>
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

      <div className="bg-surface-container p-6 flex flex-col min-h-[320px] border border-primary/10 mb-8 relative overflow-hidden">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-bold text-sm tracking-widest text-primary uppercase flex items-center gap-2">
              <Activity size={16} /> Global Signal Activity
            </h3>
            <p className="text-[9px] text-on-surface-variant uppercase">24H ARCHIVE: TACTICAL PULSE FREQUENCY</p>
          </div>
          <span className="px-2 py-0.5 bg-surface-container-highest text-[10px] text-primary border border-primary/20">LIVE</span>
        </div>
        <div className="flex-1 relative">
          {loading ? (
            <div className="h-full flex items-center justify-center animate-pulse text-primary/30 uppercase tracking-[0.3em]">
              Synchronizing telemetry...
            </div>
          ) : (
            <ReactECharts option={activityChartOptions} style={{ height: '100%', width: '100%', minHeight: '240px' }} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="bg-surface-container p-6 border border-primary/10 xl:col-span-2">
          <h3 className="font-bold text-sm tracking-widest text-primary uppercase mb-6 flex items-center gap-2">
            <ShieldAlert size={16} /> Load Distribution
          </h3>
          <div className="flex items-center justify-center relative py-6">
            <div className="h-[400px] w-full">
              <ReactECharts option={takChartOptions} style={{ height: '100%', width: '100%' }} />
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-5xl font-black text-primary tracking-tighter">84%</span>
              <span className="text-xs text-on-surface-variant uppercase tracking-[0.2em] font-bold">Efficiency</span>
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
}
