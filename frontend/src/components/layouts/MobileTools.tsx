import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { MapFilters } from '../../types';
import { LayerVisibilityControls } from '../widgets/LayerVisibilityControls';
import { LayerFilters } from '../widgets/LayerFilters';
import { SystemSettingsWidget } from '../widgets/SystemSettingsWidget';
import { SystemHealthWidget } from '../widgets/SystemHealthWidget';

interface ToolAction {
  label: string;
  active?: boolean;
  onClick: () => void;
}
interface MobileToolsProps {
  onClose: () => void;
  filters: Record<string, boolean | string | number | string[]>;
  onFilterChange: (key: string, value: boolean | string | number | string[]) => void;
  actions: ToolAction[];
}

export function MobileTools({onClose, filters, onFilterChange, actions}: MobileToolsProps) {
  const [tab, setTab] = useState('Layers');
  const id = useId();
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const tabs = ['Layers', 'Display', 'System'];
  const content = <>
    <button className="mobile-tools-scrim" aria-label="Dismiss tools" onClick={onClose} />
    <div ref={dialog} tabIndex={-1} className="mobile-tools-sheet" id="mobile-map-tools" role="dialog" aria-modal="true" aria-label="Tools"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
        if (event.key !== 'Tab') return;
        const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button, input, select, a[href], [tabindex="0"]') ?? [])].filter(el => el.getClientRects().length && !el.hasAttribute('disabled'));
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
      }}>
      <header><div><span className="mobile-eyebrow">Map workspace</span><h2>Tools</h2></div><button aria-label="Close tools" onClick={onClose}><X size={20} aria-hidden="true" /></button></header>
      <div className="mobile-tools-tabs" role="tablist" aria-label="Tools sections">
        {tabs.map((label, index) => <button key={label} id={`${id}-${label}`} role="tab" aria-selected={tab === label} aria-controls={`${id}-content`} tabIndex={tab === label ? 0 : -1} onClick={() => setTab(label)} onKeyDown={event => {
          if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          setTab(tabs[next]); document.getElementById(`${id}-${tabs[next]}`)?.focus();
        }}>{label}</button>)}
      </div>
      <div className="mobile-tools-content" id={`${id}-content`} role="tabpanel" aria-labelledby={`${id}-${tab}`}>
        {tab === 'Layers' && <div className="mobile-tools-layer-menu">
          <LayerVisibilityControls filters={filters as unknown as MapFilters} onFilterChange={onFilterChange} />
          <LayerFilters filters={{...filters,showAir:filters.showAir===true,showSea:filters.showSea===true,showSatellites:filters.showSatellites===true}} onFilterChange={onFilterChange} />
        </div>}
        {tab === 'Display' && <div className="mobile-tools-actions">{actions.map(action => <button key={action.label} onClick={action.onClick} aria-pressed={action.active}><span>{action.label}</span><span>{action.active === undefined ? 'Open' : action.active ? 'On' : 'Off'}</span></button>)}</div>}
        {tab === 'System' && <div className="mobile-tools-system"><h3>Preferences & watchlist</h3><SystemSettingsWidget inline isOpen onClose={onClose} filters={filters} onFilterChange={onFilterChange} /><h3>Health & data streams</h3><SystemHealthWidget inline isOpen onClose={onClose} /></div>}
      </div>
    </div>
  </>;
  const root = document.querySelector('.hud-viewport');
  return root ? createPortal(content, root) : content;
}
