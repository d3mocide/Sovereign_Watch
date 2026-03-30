import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { ShieldAlert } from 'lucide-react';
import type { TakBreakdown } from './types';

interface Props {
  takBreakdown: TakBreakdown[];
}

export default function ProtocolTab({ takBreakdown }: Props) {
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
