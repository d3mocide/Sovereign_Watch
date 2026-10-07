import { Activity, Crosshair, FileText, Globe, Headphones, Layers, LayoutDashboard, Newspaper, Radio, Satellite, ShieldAlert, SlidersHorizontal, Users, Volume2, Waves, type LucideIcon } from "lucide-react";
import { useId, useState, type ReactNode } from 'react';

const tabIcons: Record<string, LucideIcon> = {mission:Crosshair,feeds:Activity,layers:Layers,hf:Radio,satellites:Satellite,passes:Satellite,doppler:Activity,overview:Globe,threats:ShieldAlert,countries:Globe,sitrep:FileText,summary:LayoutDashboard,maps:Globe,intel:Newspaper,local:Crosshair,global:Globe,outages:Activity,news:Newspaper,messages:Radio,stations:Users,listen:Headphones,websdr:Globe,waterfall:Waves,tuning:SlidersHorizontal,audio:Volume2};
export interface MobileTab { id: string; label: string; }
interface MobileTabsProps {
  label: string;
  tabs: MobileTab[];
  value: string;
  onChange: (id: string) => void;
}
/** Touch-sized section navigation, with keyboard arrow navigation. */
export function MobileTabs({label, tabs, value, onChange}: MobileTabsProps) {
  return <nav className="mobile-section-tabs" role="tablist" aria-label={label}>
    {tabs.map((tab, index) => { const Icon = tabIcons[tab.id] || Activity; return <button key={tab.id} role="tab" aria-selected={value === tab.id}
      tabIndex={value === tab.id ? 0 : -1} onClick={() => onChange(tab.id)}
      onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
        if (next === null) return;
        event.preventDefault(); onChange(tabs[next].id);
        (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
      }}><Icon size={16} aria-hidden="true" /><span>{tab.label}</span></button>; })}
  </nav>;
}
interface MobileSectionsProps {
  label: string;
  className?: string;
  sections: (MobileTab & {content: ReactNode})[];
}
/** Keep widgets mounted when sections change so their local state survives. */
export function MobileSections({label, className = '', sections}: MobileSectionsProps) {
  const [active, setActive] = useState(sections[0].id);
  const id = useId();
  return <div className={`mobile-sections ${className}`}>
    <MobileTabs label={label} tabs={sections} value={active} onChange={setActive} />
    {sections.map(section => <section key={section.id} id={`${id}-${section.id}`} className="mobile-section" data-active={active === section.id} aria-label={section.label}>
      {section.content}
    </section>)}
  </div>;
}
