import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Activity, Clock3, DatabaseZap, FileSearch } from 'lucide-react';
import type { ClausalizerMetrics } from './types';

interface Props {
  metrics: ClausalizerMetrics | null;
  loading: boolean;
}

export default function ClausalizerTab({ metrics, loading }: Props) {
  const rows5m = metrics?.health.rows_5m ?? {};
  const rows5mTotal = metrics?.health.rows_5m_total ?? 0;

  const timelineOptions = useMemo(() => {
    if (!metrics?.timeline?.length) return null;

    const times = metrics.timeline.map((p) =>
      new Date(p.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    );

    const sourceSet = new Set<string>();
    metrics.timeline.forEach((p) => Object.keys(p.counts).forEach((s) => sourceSet.add(s)));
    const sources = Array.from(sourceSet);

    const colorMap: Record<string, string> = {
      TAK_ADSB: '#39FF14',
      TAK_AIS: '#3b82f6',
      GDELT: '#fb923c',
    };

    const series = sources.map((source) => ({
      name: source,
      type: 'line',
      smooth: true,
      showSymbol: false,
      lineStyle: { color: colorMap[source] ?? '#a3a3a3', width: 2 },
      itemStyle: { color: colorMap[source] ?? '#a3a3a3' },
      data: metrics.timeline.map((p) => p.counts[source] ?? 0),
    }));

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        borderColor: '#39FF14',
        textStyle: { color: '#39FF14', fontFamily: 'monospace', fontSize: 10 },
      },
      legend: {
        data: sources,
        textStyle: { color: '#8eff71', fontSize: 10 },
        top: 0,
      },
      grid: { left: '3%', right: '3%', bottom: '4%', top: '16%', containLabel: true },
      xAxis: {
        type: 'category',
        data: times,
        axisLine: { lineStyle: { color: 'rgba(57, 255, 20, 0.2)' } },
        axisLabel: { color: '#8eff71', opacity: 0.6, fontSize: 9 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: 'rgba(57, 255, 20, 0.1)', type: 'dashed' } },
        axisLabel: { color: '#8eff71', opacity: 0.6, fontSize: 9 },
      },
      series,
    };
  }, [metrics]);

  return (
    <div className="flex-1 flex flex-col p-6 min-w-0 overflow-y-auto custom-scrollbar font-headline">
      <div className="flex justify-between items-end pb-4 border-b border-primary/10 mb-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-primary uppercase">CLAUSALIZER</h1>
          <p className="text-on-surface-variant text-[10px] mt-1 tracking-widest uppercase">PIPELINE HEALTH & CLAUSAL CHAIN ACTIVITY</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-surface-container p-4 border border-primary/10">
          <div className="text-[10px] uppercase tracking-widest text-on-surface-variant flex items-center gap-2"><Activity size={12} /> Rows / 5m</div>
          <div className="text-2xl font-black text-primary mt-2">{rows5mTotal.toLocaleString()}</div>
        </div>
        <div className="bg-surface-container p-4 border border-primary/10">
          <div className="text-[10px] uppercase tracking-widest text-on-surface-variant flex items-center gap-2"><DatabaseZap size={12} /> TAK_ADSB / 5m</div>
          <div className="text-2xl font-black text-primary mt-2">{(rows5m.TAK_ADSB ?? 0).toLocaleString()}</div>
        </div>
        <div className="bg-surface-container p-4 border border-primary/10">
          <div className="text-[10px] uppercase tracking-widest text-on-surface-variant flex items-center gap-2"><DatabaseZap size={12} /> TAK_AIS / 5m</div>
          <div className="text-2xl font-black text-primary mt-2">{(rows5m.TAK_AIS ?? 0).toLocaleString()}</div>
        </div>
        <div className="bg-surface-container p-4 border border-primary/10">
          <div className="text-[10px] uppercase tracking-widest text-on-surface-variant flex items-center gap-2"><DatabaseZap size={12} /> GDELT / 5m</div>
          <div className="text-2xl font-black text-primary mt-2">{(rows5m.GDELT ?? 0).toLocaleString()}</div>
        </div>
        <div className="bg-surface-container p-4 border border-primary/10">
          <div className="text-[10px] uppercase tracking-widest text-on-surface-variant flex items-center gap-2"><Clock3 size={12} /> Last Write</div>
          <div className="text-xs font-mono text-primary mt-2 break-all">{metrics?.health.last_write_at ?? 'N/A'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-surface-container p-6 border border-primary/10 xl:col-span-2 min-h-[380px]">
          <h3 className="font-bold text-sm tracking-widest text-primary uppercase mb-3">Clausal Chain Activity</h3>
          {loading ? (
            <div className="h-[300px] flex items-center justify-center animate-pulse text-primary/30 uppercase tracking-widest">Loading metrics...</div>
          ) : timelineOptions ? (
            <ReactECharts option={timelineOptions} style={{ height: 320, width: '100%' }} />
          ) : (
            <div className="h-[300px] flex items-center justify-center text-on-surface-variant/40 uppercase text-xs">No activity in selected window</div>
          )}
        </div>

        <div className="bg-surface-container p-6 border border-primary/10">
          <h3 className="font-bold text-sm tracking-widest text-primary uppercase mb-4 flex items-center gap-2"><FileSearch size={14} /> Latest Clauses</h3>
          <div className="space-y-2 max-h-[320px] overflow-y-auto custom-scrollbar pr-2">
            {metrics?.latest.map((row) => (
              <div key={`${row.uid}-${row.time}-${row.state_change_reason}`} className="p-2 bg-surface-container-high border border-primary/5">
                <div className="text-[10px] text-primary font-mono break-all">{row.uid}</div>
                <div className="text-[9px] text-on-surface-variant uppercase mt-1">{row.source} | {row.state_change_reason ?? 'UNKNOWN'}</div>
                <div className="text-[9px] text-on-surface-variant/70 mt-1">{row.time ? new Date(row.time).toLocaleTimeString() : 'N/A'}</div>
              </div>
            ))}
            {(!metrics?.latest || metrics.latest.length === 0) && (
              <div className="h-32 flex items-center justify-center text-on-surface-variant/40 uppercase text-xs">No recent clauses</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
