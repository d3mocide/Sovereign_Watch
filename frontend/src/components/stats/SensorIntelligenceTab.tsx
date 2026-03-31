import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Activity, Radio, Target, Wind } from 'lucide-react';
import type { SensorMetrics } from './types';

interface Props {
  metrics: SensorMetrics | null;
  loading: boolean;
}

export default function SensorIntelligenceTab({ metrics, loading }: Props) {
  const radarOptions = useMemo(() => {
    if (!metrics?.radar) return null;

    const labels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const densityData = labels.map(l => {
      const match = metrics.radar.find(r => r.label === l);
      return match ? match.density : 0;
    });

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        borderColor: '#39FF14',
        textStyle: { color: '#39FF14', fontFamily: 'monospace', fontSize: 10 }
      },
      radar: {
        indicator: labels.map(l => ({ name: l, max: Math.max(...densityData, 10) })),
        shape: 'circle',
        splitNumber: 4,
        axisName: { color: '#8eff71', fontSize: 10, fontWeight: 'bold' },
        splitLine: { lineStyle: { color: 'rgba(57, 255, 20, 0.2)' } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: 'rgba(57, 255, 20, 0.3)' } }
      },
      series: [{
        type: 'radar',
        data: [{
          value: densityData,
          name: 'Target Density',
          symbol: 'none',
          lineStyle: { width: 2, color: '#39FF14' },
          areaStyle: { color: 'rgba(57, 255, 20, 0.4)' }
        }]
      }]
    };
  }, [metrics]);

  const integrityOptions = useMemo(() => {
    if (!metrics?.integrity_trends) return null;

    const times = metrics.integrity_trends.map(t => 
      new Date(t.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );

    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(0, 0, 0, 0.9)', borderColor: '#39FF14' },
      legend: { textStyle: { color: '#8eff71', fontSize: 10 }, top: 0 },
      grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
      xAxis: {
        type: 'category',
        data: times,
        axisLine: { lineStyle: { color: 'rgba(57, 255, 20, 0.2)' } },
        axisLabel: { color: '#8eff71', opacity: 0.6, fontSize: 9 }
      },
      yAxis: {
        type: 'value',
        min: 0, max: 15,
        splitLine: { lineStyle: { color: 'rgba(57, 255, 20, 0.1)', type: 'dashed' } },
        axisLabel: { color: '#8eff71', opacity: 0.6, fontSize: 9 }
      },
      series: [
        {
          name: 'NIC (Integrity)',
          type: 'line',
          smooth: true,
          showSymbol: false,
          lineStyle: { color: '#39FF14' },
          data: metrics.integrity_trends.map(t => t.nic)
        },
        {
          name: 'NACp (Accuracy)',
          type: 'line',
          smooth: true,
          showSymbol: false,
          lineStyle: { color: '#fb923c' },
          data: metrics.integrity_trends.map(t => t.nacp)
        }
      ]
    };
  }, [metrics]);

  return (
    <div className="flex-1 flex flex-col p-6 min-w-0 overflow-y-auto custom-scrollbar font-headline">
      <div className="flex justify-between items-end pb-4 border-b border-primary/10 mb-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-primary uppercase">SENSOR INTELLIGENCE</h1>
          <p className="text-on-surface-variant text-[10px] mt-1 tracking-widest uppercase">GEOSPATIAL HORIZON & SIGNAL INTEGRITY ANALYTICS</p>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full">
            <Radio size={12} className="text-primary animate-pulse" />
            <span className="text-[10px] font-bold text-primary tracking-widest uppercase">SCANNING BANDS: ACTIVE</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        {/* Tactical Radar */}
        <div className="bg-surface-container p-6 border border-primary/10 flex flex-col min-h-[400px]">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="font-bold text-sm tracking-widest text-primary uppercase flex items-center gap-2">
                <Target size={16} /> Signal Density Radar
              </h3>
              <p className="text-[9px] text-on-surface-variant uppercase">Spatial Distribution by Octant</p>
            </div>
          </div>
          <div className="flex-1 relative">
            {loading ? (
              <div className="h-full flex items-center justify-center animate-pulse text-primary/30 uppercase tracking-widest">Awaiting spatial sync...</div>
            ) : radarOptions ? (
              <ReactECharts option={radarOptions} style={{ height: '100%', width: '100%' }} />
            ) : null}
          </div>
        </div>

        {/* Signal Integrity Trend */}
        <div className="bg-surface-container p-6 border border-primary/10 flex flex-col min-h-[400px]">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="font-bold text-sm tracking-widest text-primary uppercase flex items-center gap-2">
                <Activity size={16} /> Signal Integrity Trend
              </h3>
              <p className="text-[9px] text-on-surface-variant uppercase">NIC/NACP Accuracy Baseline</p>
            </div>
          </div>
          <div className="flex-1 relative">
            {loading ? (
              <div className="h-full flex items-center justify-center animate-pulse text-primary/30 uppercase tracking-widest">Awaiting integrity data...</div>
            ) : integrityOptions ? (
              <ReactECharts option={integrityOptions} style={{ height: '100%', width: '100%' }} />
            ) : null}
          </div>
        </div>
      </div>

      {/* Detection Horizon Legend */}
      <div className="bg-surface-container p-6 border border-primary/10">
        <h3 className="font-bold text-sm tracking-widest text-primary uppercase mb-6 flex items-center gap-2">
          <Wind size={16} /> Detection Horizon Breakdown
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
          {metrics?.radar.map(r => (
            <div key={r.label} className="p-3 bg-surface-container-high border border-primary/5 flex flex-col items-center">
              <span className="text-[10px] text-on-surface-variant font-bold">{r.label}</span>
              <span className="text-xl font-black text-primary">{r.horizon} <span className="text-[10px] font-normal opacity-50">NM</span></span>
              <div className="w-full h-1 bg-surface-container-highest mt-2">
                <div 
                  className="h-full bg-primary transition-all duration-1000" 
                  style={{ width: `${Math.min((r.density/50)*100, 100)}%` }}
                ></div>
              </div>
            </div>
          ))}
          {(!metrics?.radar || metrics.radar.length === 0) && (
            <div className="col-span-full h-20 flex items-center justify-center text-on-surface-variant/30 uppercase text-xs">
              Calculating Effective Range...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
