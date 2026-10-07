import type { ReactNode } from 'react';
import { Activity, Crosshair, Globe, Plane, Satellite, Ship, ShieldAlert, type LucideIcon } from 'lucide-react';

type View = 'TACTICAL' | 'ORBITAL' | 'INTEL' | 'DASHBOARD';
interface MobileOverviewCardProps {
  view: View;
  counts: {air: number; sea: number; orbital: number};
  eventCount?: number;
  alertCount?: number;
  description?: string;
  children?: ReactNode;
}
const titles: Record<View, {label: string; title: string; icon: LucideIcon}> = {
  TACTICAL: {label:'Tactical operations',title:'Air & maritime watch',icon:Crosshair},
  ORBITAL: {label:'Orbital operations',title:'Above the horizon',icon:Satellite},
  INTEL: {label:'Open source intelligence',title:'Global intelligence',icon:Globe},
  DASHBOARD: {label:'Situation overview',title:'Your operational picture',icon:Activity},
};
/** The same live counts as the desktop HUD, with a readable mobile hierarchy. */
export function MobileOverviewCard({view, counts, eventCount = 0, alertCount = 0, description, children}: MobileOverviewCardProps) {
  const {label,title,icon:Icon} = titles[view];
  const metrics = view === 'ORBITAL' ? [{label:'Satellites tracked',value:counts.orbital,icon:Satellite}]
    : view === 'INTEL' ? [{label:'Geolocated events',value:eventCount,icon:Globe}]
    : [{label:'Air tracks',value:counts.air,icon:Plane},{label:'Maritime',value:counts.sea,icon:Ship},
      ...(view === 'DASHBOARD' ? [{label:'Orbital',value:counts.orbital,icon:Satellite},{label:'Active alerts',value:alertCount,icon:ShieldAlert}] : [])];
  return <section className="mobile-overview-card" aria-label={label}>
    <div className="mobile-overview-heading"><div><span className="mobile-eyebrow">{label}</span><h2>{title}</h2></div><Icon size={24} aria-hidden="true" /></div>
    <div className="mobile-overview-metrics">
      {metrics.map(({label:metricLabel,value,icon:MetricIcon}) => <div key={metricLabel} className="mobile-overview-metric">
        <span className="mobile-metric-label"><MetricIcon size={13} aria-hidden="true" />{metricLabel}</span>
        <strong title={value.toLocaleString()}>{value.toLocaleString()}</strong>
      </div>)}
    </div>
    {children}
    {description && <p className="mobile-overview-description">{description}</p>}
  </section>;
}
