import { Network, Download } from 'lucide-react';
import type { PollerHealth, ThroughputData } from './types';

interface Props {
  healthData: PollerHealth[];
  throughputData: ThroughputData;
}

export default function NetworkingTab({ healthData, throughputData }: Props) {
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
            {healthData.map(p => {
              const metrics = throughputData.throughput[p.id] ?? { kb_per_sec: 0, total_bytes: 0 };
              const rate = metrics.kb_per_sec;
              const percentage = Math.min(100, (rate / 512) * 100);
              return (
                <div key={p.id} className="space-y-1">
                  <div className="flex justify-between text-[10px] uppercase font-bold text-on-surface-variant">
                    <span>{p.name}</span>
                    <span className="text-primary">{rate.toFixed(1)} KB/S</span>
                  </div>
                  <div className="h-1.5 bg-primary/5 border border-primary/10 overflow-hidden">
                    <div
                      className="h-full bg-primary shadow-[0_0_10px_rgba(57,255,20,0.5)] transition-all duration-500"
                      style={{ width: `${Math.max(2, percentage)}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-surface-container p-6 border border-primary/10 flex flex-col justify-center text-center">
          <Network size={48} className="text-primary/20 mx-auto mb-4" />
          <h4 className="text-xl font-black text-primary uppercase italic">
            {throughputData.total_bandwidth_mb > 1024
              ? `${(throughputData.total_bandwidth_mb / 1024).toFixed(2)} GB`
              : `${throughputData.total_bandwidth_mb.toFixed(1)} MB`}
          </h4>
          <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">TOTAL BANDWIDTH (24H)</p>
        </div>
      </div>
    </div>
  );
}
