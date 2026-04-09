import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Zap, Database, Activity, HardDrive, BarChart3, Clock } from 'lucide-react';
import type { FusionMetrics } from './types';

interface Props {
  metrics: FusionMetrics | null;
  loading: boolean;
}

export default function FusionAuditTab({ metrics, loading }: Props) {
  const defaultMetrics: FusionMetrics = metrics || {
    latency_ms: 145.0,
    dedup_efficiency: 88.4,
    storage: {
      total_mb: 1420.5,
      velocity_mb_hr: 14.2,
      retention_full_pct: 2.8
    }
  };

  const storageOptions = useMemo(() => {
    // 24h straight-line estimate based on current measured ingest velocity.
    const base = defaultMetrics.storage.total_mb;
    const vel = defaultMetrics.storage.velocity_mb_hr;
    const data = Array.from({ length: 24 }, (_, i) => base + (vel * i));
    const hours = Array.from({ length: 24 }, (_, i) => `${i}H`);

    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(0, 0, 0, 0.9)', borderColor: '#39FF14' },
      grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
      xAxis: {
        type: 'category',
        data: hours,
        axisLine: { lineStyle: { color: 'rgba(57, 255, 20, 0.2)' } },
        axisLabel: { color: '#8eff71', opacity: 0.4, fontSize: 8 }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: 'rgba(57, 255, 20, 0.05)', type: 'dashed' } },
        axisLabel: { color: '#8eff71', opacity: 0.4, fontSize: 8, formatter: (v: number) => `${(v/1024).toFixed(1)}G` }
      },
      series: [{
        name: 'Forecasted Storage',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { type: 'dashed', color: '#39FF14', opacity: 0.4 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(57, 255, 20, 0.1)' }, { offset: 1, color: 'transparent' }]
          }
        },
        data: data
      }]
    };
  }, [defaultMetrics]);

  const formatStorage = (mb: number): string => {
    if (mb >= 1024 * 1024) return `${(mb / (1024 * 1024)).toFixed(2)} TB`;
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(2)} MB`;
  };

  const formatVelocity = (mbPerHour: number): string => {
    if (mbPerHour >= 1024) return `~${(mbPerHour / 1024).toFixed(2)} GB/HR`;
    return `~${mbPerHour.toFixed(2)} MB/HR`;
  };

  return (
    <div className="flex-1 flex flex-col p-6 min-w-0 overflow-y-auto custom-scrollbar font-headline">
      <div className="flex justify-between items-end pb-4 border-b border-primary/10 mb-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-primary uppercase">FUSION AUDIT</h1>
          <p className="text-on-surface-variant text-[10px] mt-1 tracking-widest uppercase">INTELLIGENCE PIPELINE INTEGRITY & STORAGE VELOCITY</p>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2 px-3 py-1 bg-primary/5 border border-primary/10 rounded-full">
            <Clock size={12} className="text-primary" />
            <span className="text-[10px] font-bold text-primary tracking-widest uppercase">PIPELINE HEARTBEAT: NOMINAL</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Latency Gauge */}
        <div className="bg-surface-container p-6 border border-primary/10 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-4 left-4 flex gap-2 items-center">
            <Zap size={14} className="text-primary" />
            <span className="text-[10px] text-primary font-bold uppercase tracking-widest">End-to-End Latency</span>
          </div>
          <div className="mt-8 flex flex-col items-center">
            <div className="relative w-32 h-16 overflow-hidden">
              <div className="absolute top-0 left-0 w-32 h-32 border-8 border-surface-container-highest rounded-full"></div>
              <div 
                className={`absolute top-0 left-0 w-32 h-32 border-8 rounded-full border-t-primary border-l-primary transition-all duration-1000 rotate-[${Math.min(45 + (defaultMetrics.latency_ms/10), 225)}deg]`}
              ></div>
            </div>
            <div className="text-center mt-2">
              <span className="text-3xl font-black text-primary">{defaultMetrics.latency_ms}</span>
              <span className="text-xs text-on-surface-variant ml-1 uppercase">MS</span>
            </div>
          </div>
        </div>

        {/* Deduplication Analytics */}
        <div className="bg-surface-container p-6 border border-primary/10 flex flex-col justify-center relative">
          <div className="absolute top-4 left-4 flex gap-2 items-center">
            <Activity size={14} className="text-primary" />
            <span className="text-[10px] text-primary font-bold uppercase tracking-widest">Deduplication Efficiency</span>
          </div>
          <div className="mt-6">
            <div className="flex justify-between items-end mb-2">
              <span className="text-2xl font-black text-primary">{defaultMetrics.dedup_efficiency}%</span>
              <span className="text-[10px] text-on-surface-variant uppercase mb-1">Compression Ratio</span>
            </div>
            <div className="h-2 bg-surface-container-highest w-full rounded-full overflow-hidden border border-primary/10">
              <div 
                className="h-full bg-primary shadow-[0_0_10px_#39FF14] transition-all duration-1000" 
                style={{ width: `${defaultMetrics.dedup_efficiency}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Storage Cap */}
        <div className="bg-surface-container p-6 border border-primary/10 flex flex-col justify-center relative">
          <div className="absolute top-4 left-4 flex gap-2 items-center">
            <Database size={14} className="text-primary" />
            <span className="text-[10px] text-primary font-bold uppercase tracking-widest">Retention Burn Rate</span>
          </div>
          <div className="mt-6">
            <div className="flex justify-between items-end mb-2">
              <span className="text-2xl font-black text-primary">{defaultMetrics.storage.retention_full_pct}%</span>
              <span className="text-[10px] text-on-surface-variant uppercase mb-1">50GB Quota</span>
            </div>
            <div className="h-2 bg-surface-container-highest w-full rounded-full overflow-hidden border border-primary/10">
              <div 
                className="h-full bg-tertiary transition-all duration-1000" 
                style={{ width: `${Math.min(100, defaultMetrics.storage.retention_full_pct)}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Storage Forecast */}
        <div className="bg-surface-container p-6 border border-primary/10 flex flex-col min-h-[300px]">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="font-bold text-sm tracking-widest text-primary uppercase flex items-center gap-2">
                <BarChart3 size={16} /> Tracks Projection (24H)
              </h3>
              <p className="text-[9px] text-on-surface-variant uppercase">Linear Estimate For Tracks Ingest Velocity</p>
            </div>
          </div>
          <div className="flex-1 relative">
            {loading ? (
              <div className="h-full flex items-center justify-center animate-pulse text-primary/30 uppercase tracking-widest">Calculating trajectory...</div>
            ) : (
              <ReactECharts option={storageOptions} style={{ height: '100%', width: '100%' }} />
            )}
          </div>
        </div>

        {/* System Health / Vitals */}
        <div className="bg-surface-container p-6 border border-primary/10 flex flex-col">
          <h3 className="font-bold text-sm tracking-widest text-primary uppercase mb-6 flex items-center gap-2">
            <HardDrive size={16} /> Tracks Storage Stats
          </h3>
          <div className="space-y-4">
             <div className="flex justify-between items-center p-3 bg-surface-container-high border border-primary/5">
                <span className="text-[10px] text-on-surface-variant uppercase">Tracks Footprint</span>
               <span className="text-sm font-bold text-primary font-mono">{formatStorage(defaultMetrics.storage.total_mb)}</span>
             </div>
             <div className="flex justify-between items-center p-3 bg-surface-container-high border border-primary/5">
                <span className="text-[10px] text-on-surface-variant uppercase">Ingest Velocity</span>
               <span className="text-sm font-bold text-primary font-mono">{formatVelocity(defaultMetrics.storage.velocity_mb_hr)}</span>
             </div>
             <div className="flex justify-between items-center p-3 bg-surface-container-high border border-primary/5">
                <span className="text-[10px] text-on-surface-variant uppercase">Cleanup Cycles</span>
                <span className="text-sm font-bold text-primary font-mono">15m Polling</span>
             </div>
             <div className="flex justify-between items-center p-3 bg-error/5 border border-error/20">
                <span className="text-[10px] text-error uppercase font-bold">Retention Cap</span>
                <span className="text-sm font-bold text-error font-mono">72 HOURS (72/72)</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
