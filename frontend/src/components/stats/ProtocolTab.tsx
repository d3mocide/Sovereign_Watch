import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Activity, Zap, AlertTriangle, TrendingUp, Crosshair, Globe } from 'lucide-react';
import type { ActivityData, TakBreakdown, TakMetrics, ProtocolIntelligence } from './types';

interface Props {
  takBreakdown: TakBreakdown[];
  activityData: ActivityData[];
  loading: boolean;
  takMetrics: TakMetrics | null;
  intelligence: ProtocolIntelligence | null;
  missionScope?: boolean;
  missionInfo?: { lat: number; lon: number; radius_nm: number } | null;
  onToggleMissionScope?: () => void;
}

export default function ProtocolTab({ takBreakdown, activityData, loading, takMetrics, intelligence, missionScope, missionInfo, onToggleMissionScope }: Props) {
  const totalSignals = takMetrics?.total_count ?? 0;

  const activityChartOptions = useMemo(() => {
    const times = activityData.map(d =>
      new Date(d.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
    const typesSet = new Set<string>();
    activityData.forEach(d => Object.keys(d.counts).forEach(k => typesSet.add(k)));
    const types = Array.from(typesSet);
    
    // Create a mapping for consistent labels between chart and sidebar
    const typeMap = new Map<string, { label: string; color: string }>();
    takBreakdown.forEach(b => typeMap.set(b.type, { label: b.label.toUpperCase(), color: b.color }));

    const series = types.map(type => {
      const info = typeMap.get(type) || { label: type.toUpperCase(), color: '#39FF14' };
      return {
        name: info.label,
        type: 'line',
        smooth: true,
        showSymbol: false,
        areaStyle: {
          opacity: 0.3,
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: info.color },
              { offset: 1, color: 'rgba(57, 255, 20, 0)' },
            ],
          },
        },
        lineStyle: { color: info.color, width: 2 },
        itemStyle: { color: info.color },
        data: activityData.map(d => d.counts[type] ?? 0),
      };
    });

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

  const persistenceOptions = useMemo(() => {
    if (!intelligence?.persistence) return null;
    const sorted = [...intelligence.persistence].sort((a, b) => b.seconds - a.seconds).slice(0, 8);
    
    return {
      backgroundColor: 'transparent',
      grid: { left: '3%', right: '10%', bottom: '3%', top: '3%', containLabel: true },
      xAxis: { 
        type: 'value', 
        axisLabel: { show: false }, 
        splitLine: { show: false }, 
        axisLine: { show: false } 
      },
      yAxis: {
        type: 'category',
        data: sorted.map(p => p.type.split('-').pop()?.toUpperCase() || p.type),
        axisLabel: { color: '#8eff71', fontSize: 9, fontFamily: 'monospace' },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      series: [{
        type: 'bar',
        data: sorted.map(p => p.seconds),
        itemStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [{ offset: 0, color: '#39FF14' }, { offset: 1, color: 'rgba(57, 255, 20, 0.1)' }]
          }
        },
        label: { show: true, position: 'right', color: '#39FF14', fontSize: 9, formatter: '{c}s' }
      }]
    };
  }, [intelligence]);

  return (
    <div className="flex-1 flex flex-col p-6 min-w-0 overflow-y-auto custom-scrollbar font-headline">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-4 border-b border-primary/10 mb-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-primary uppercase">PROTOCOL ARCHITECTURE</h1>
          <p className="text-on-surface-variant text-[10px] mt-1 tracking-widest uppercase">TAK/COT SCHEMA & SIGNAL CLASSIFICATION HIERARCHY</p>
          {missionScope && missionInfo && (
            <div className="flex items-center gap-2 mt-2 px-2 py-1 bg-amber-400/10 border border-amber-400/30 w-fit">
              <Crosshair size={10} className="text-amber-400" />
              <span className="text-[9px] font-bold text-amber-400 tracking-widest uppercase">
                MISSION AOR · {missionInfo.lat.toFixed(2)},{missionInfo.lon.toFixed(2)} · {missionInfo.radius_nm}nm
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 items-end">
          <button
            onClick={onToggleMissionScope}
            title={missionScope ? "Switch to global view" : "Switch to mission-scoped view"}
            className={`flex items-center gap-2 px-3 py-1.5 text-[9px] font-bold tracking-widest uppercase transition-all border ${
              missionScope
                ? 'bg-amber-400/15 border-amber-400/50 text-amber-400 hover:bg-amber-400/25'
                : 'bg-surface-container border-primary/20 text-primary/50 hover:text-primary hover:border-primary/40'
            }`}
          >
            {missionScope ? <Crosshair size={10} /> : <Globe size={10} />}
            {missionScope ? 'MISSION AOR' : 'GLOBAL VIEW'}
          </button>
          <div className="flex gap-6 items-center bg-surface-container p-3 border border-primary/5">
            <div className="text-right">
              <div className="text-[10px] text-on-surface-variant uppercase tracking-widest">Active Signals</div>
              <div className="text-2xl font-bold text-primary">{totalSignals.toLocaleString()}</div>
            </div>
            <div className="w-px h-8 bg-on-surface-variant/20"></div>
            <div className="text-right">
              <div className="text-[10px] text-on-surface-variant uppercase tracking-widest">Signal Noise</div>
              <div className="text-2xl font-bold text-tertiary">{takMetrics?.noise_pct ?? '0.00'}%</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        <div className="bg-surface-container p-6 flex flex-col min-h-[320px] border border-primary/10 relative overflow-hidden xl:col-span-2">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="font-bold text-sm tracking-widest text-primary uppercase flex items-center gap-2">
                <Activity size={16} /> {missionScope ? 'Mission AOR Activity' : 'Global Signal Activity'}
              </h3>
              <p className="text-[9px] text-on-surface-variant uppercase">{missionScope ? 'MISSION-SCOPED: TACTICAL PULSE FREQUENCY' : '24H ARCHIVE: TACTICAL PULSE FREQUENCY'}</p>
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

        <div className="bg-surface-container p-6 border border-primary/10 flex flex-col">
          <h3 className="font-bold text-sm tracking-widest text-primary uppercase mb-4 flex items-center gap-2">
            <TrendingUp size={16} /> Avg Persistence
          </h3>
          <div className="flex-1 relative min-h-[160px]">
            {persistenceOptions ? (
              <ReactECharts option={persistenceOptions} style={{ height: '100%', width: '100%' }} />
            ) : (
              <div className="h-full flex items-center justify-center text-[10px] text-on-surface-variant/40 uppercase">Calculating...</div>
            )}
          </div>
          <p className="text-[8px] text-on-surface-variant/60 uppercase mt-4 text-center tracking-widest">Average Lock duration by Target Type</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="bg-surface-container p-6 border border-primary/10 xl:col-span-2 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-sm tracking-widest text-primary uppercase flex items-center gap-2">
              <Zap size={16} /> Priority Watchlist
            </h3>
            <span className="text-[9px] text-on-surface-variant uppercase">Extreme Behavior Monitoring</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
              {intelligence?.watchlist.map(entry => (
                <div 
                  key={entry.id} 
                  className={`p-3 border flex items-center justify-between transition-all group ${
                    entry.is_extreme 
                      ? 'bg-error/5 border-error/20 hover:bg-error/10' 
                      : 'bg-surface-container-high border-primary/5 hover:border-primary/20'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 ${entry.is_extreme ? 'text-error animate-pulse' : 'text-primary/40'}`}>
                      {entry.is_extreme ? <AlertTriangle size={18} /> : <Activity size={18} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-on-surface uppercase">{entry.callsign}</span>
                        <span className="text-[9px] text-on-surface-variant/60">ID: {entry.id}</span>
                      </div>
                      <div className="flex gap-3 text-[9px] uppercase tracking-tighter">
                        <span className={entry.is_extreme && entry.speed > 600 ? 'text-error font-bold' : 'text-on-surface-variant'}>SPD: {entry.speed}KT</span>
                        <span className={entry.is_extreme && entry.alt > 45000 ? 'text-error font-bold' : 'text-on-surface-variant'}>ALT: {entry.alt}FT</span>
                        <span className="text-primary/40">{entry.affiliation}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-primary/80 font-mono italic">
                      {entry.is_extreme ? 'EXTREME' : 'MONITORING'}
                    </div>
                    <div className="text-[8px] text-on-surface-variant opacity-40">
                      {new Date(entry.ts).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
              {(!intelligence?.watchlist || intelligence.watchlist.length === 0) && (
                <div className="h-40 flex items-center justify-center text-on-surface-variant/30 uppercase text-xs animate-pulse">
                  Scanning for High-Interest Targets...
                </div>
              )}
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
                  <div className="flex justify-between items-center opacity-70">
                    <span className="text-on-surface-variant uppercase tracking-tighter">{tak.type}</span>
                    <span className="text-primary font-mono">{tak.count.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
