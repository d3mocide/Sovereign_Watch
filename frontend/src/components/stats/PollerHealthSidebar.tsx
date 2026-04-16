import { Server, Plane, Ship, Rocket, Satellite } from 'lucide-react';
import type { PollerHealth } from './types';

interface Props {
  healthData: PollerHealth[];
}

const STATUS_COLORS: Record<PollerHealth['status'], string> = {
  healthy: 'bg-primary',
  active: 'bg-primary',
  stale: 'bg-alert-amber',
  error: 'bg-error',
  pending: 'bg-tertiary',
  no_data: 'bg-alert-amber',
  no_credentials: 'bg-on-surface-variant',
  unknown: 'bg-on-surface-variant',
};

function pollerIcon(p: PollerHealth) {
  const g = p.group.toLowerCase();
  if (g.includes('aviation')) return <Plane size={14} />;
  if (g.includes('maritime')) return <Ship size={14} />;
  if (g.includes('space')) return <Rocket size={14} />;
  if (g.includes('infra')) return <Satellite size={14} />;
  return <Server size={14} />;
}

export default function PollerHealthSidebar({ healthData }: Props) {
  return (
    <aside className="w-full lg:w-1/3 xl:w-1/5 bg-surface-container-low border-l border-primary/10 overflow-y-auto p-4 space-y-6 custom-scrollbar">
      <div className="space-y-4 font-headline uppercase">
        <div className="flex justify-between items-center border-b border-primary/10 pb-2">
          <h3 className="font-bold text-[10px] tracking-[0.2em] text-primary">CONTAINER_HEALTH</h3>
          <span className="text-[8px] text-primary/40">v2.4.0</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {healthData.map(p => {
            const colorClass = STATUS_COLORS[p.status] ?? 'bg-on-surface-variant';
            return (
              <div
                key={p.id}
                className="bg-surface-container-high/40 p-2 flex flex-col gap-2 border border-primary/5 hover:border-primary/30 transition-all cursor-default group relative overflow-hidden"
              >
                <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${colorClass}`}></div>
                <div className="flex justify-between items-center pl-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-primary opacity-40 group-hover:opacity-100 transition-opacity">
                      {pollerIcon(p)}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[9px] font-black text-on-surface truncate">{p.name}</div>
                      {p.detail ? (
                        <div
                          className="text-[7px] text-on-surface-variant/80 tracking-tight truncate"
                          title={p.detail}
                        >
                          {p.detail}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className={`w-1 h-1 rounded-full ${colorClass} shadow-[0_0_5px_rgba(57,255,20,0.5)]`}></div>
                </div>
                <div className="flex items-center justify-between pl-1">
                  <div className="flex gap-0.5">
                    {p.history && p.history.length > 0
                      ? p.history.map((bit, i) => (
                          <div
                            key={i}
                            className={`w-1 h-1 ${bit === 1 ? 'bg-primary' : p.status === 'error' ? 'bg-error' : 'bg-primary/20'} rounded-[1px] transition-all duration-500`}
                          ></div>
                        ))
                      : Array.from({ length: 12 }).map((_, i) => (
                          <div key={i} className="w-1 h-1 bg-primary/20 rounded-[1px]"></div>
                        ))}
                  </div>
                  <span className="text-[7px] text-on-surface-variant tracking-tighter uppercase">
                    {p.status === 'healthy' ? '100% UP' : p.status === 'no_data' ? 'NO DATA' : p.status.toUpperCase()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
