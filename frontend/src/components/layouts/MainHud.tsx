import { Activity, Crosshair, FileText, Globe, Satellite, X } from "lucide-react";
import React, { useEffect, useRef, useState } from 'react';

import { useCompactLayout } from '../../hooks/useCompactLayout';
import { MobileNavigationContext } from './MobileNavigationContext';

interface MainHudProps {
  viewMode?: 'TACTICAL' | 'ORBITAL' | 'INTEL' | 'DASHBOARD' | 'RADIO';
  mobileSummary?: React.ReactNode;
  statusPanel?: React.ReactNode;
  selectionLabel?: string;
  selectionKey?: string;
  onPanelOpen?: () => void;
  overlayOpen?: boolean;
  onOverlayClose?: () => void;
  children?: React.ReactNode;
  leftSidebar?: React.ReactNode;
  rightSidebar?: React.ReactNode;
  topBar?: React.ReactNode;
}

/** Desktop columns become dismissible drawers below the wide-screen breakpoint. */
export const MainHud: React.FC<MainHudProps> = ({ children, leftSidebar, rightSidebar, topBar, onPanelOpen, overlayOpen, onOverlayClose, viewMode, mobileSummary, statusPanel, selectionLabel, selectionKey }) => {
  const [panel, setPanel] = useState<'left' | 'right' | 'status' | null>(null);
  const compact = useCompactLayout();
  const leftLabel = viewMode === 'ORBITAL' ? 'Satellites' : viewMode === 'INTEL' ? 'Threats' : viewMode === 'TACTICAL' ? 'Mission & feeds' : 'Layers & feeds';
  const rightLabel = viewMode === 'INTEL' && !selectionLabel ? 'News' : 'Details';
  const mapView = viewMode === 'TACTICAL' || viewMode === 'ORBITAL' || viewMode === 'INTEL';
  const sheetTouchStart = useRef<number | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const selectedKey = selectionKey ?? selectionLabel;
  const previousSelection = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (compact && selectedKey && selectedKey !== previousSelection.current) {
      setToolsOpen(false);
      setPanel('right');
      onPanelOpen?.();
      requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('#hud-right-panel .hud-panel-close')?.focus());
    } else if (compact && !selectedKey && previousSelection.current) {
      setPanel(current => current === 'right' ? null : current);
    }
    previousSelection.current = selectedKey;
  }, [compact, selectedKey, onPanelOpen]);
  const openPanel = (next: 'left' | 'right' | 'status' | null) => { setToolsOpen(false); onPanelOpen?.(); setPanel(next); };
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setPanel(null); setToolsOpen(false); onOverlayClose?.(); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onOverlayClose]);
  const sheetHeading = (label: string, closeLabel: string) => <div className="hud-panel-heading xl:hidden"
    onTouchStart={event => { sheetTouchStart.current = event.touches[0]?.clientY ?? null; }}
    onTouchEnd={event => { if (sheetTouchStart.current !== null && (event.changedTouches[0]?.clientY ?? 0) - sheetTouchStart.current > 72) setPanel(null); sheetTouchStart.current = null; }}>
    <span className="mobile-sheet-handle" aria-hidden="true" />
    <div><span className="mobile-eyebrow">{viewMode?.toLowerCase() || 'Map'} workspace</span><h2>{label}</h2></div>
    <button className="hud-panel-close" aria-label={closeLabel} onClick={() => setPanel(null)}><X size={20} aria-hidden="true" /></button>
  </div>;
  return (
    <MobileNavigationContext.Provider value={{ toolsOpen, setToolsOpen: (open) => { setToolsOpen(open); setPanel(null); if (open) onPanelOpen?.(); }, closePanels: () => setPanel(null) }}>
    <div data-tools={toolsOpen} data-panel={panel || "map"} data-view={viewMode} className="hud-shell relative h-dvh w-full overflow-hidden bg-tactical-bg font-mono text-mono-base selection:bg-hud-green selection:text-black">
      <div className="hud-viewport">
      {overlayOpen && <button className="absolute inset-0 z-[90] bg-black/50 xl:hidden" aria-label="Close menu" onClick={onOverlayClose} />}
      <div className="absolute inset-0 z-0">{children}</div>
      {!compact && statusPanel}
      {compact && mapView && <div className="mobile-context-strip" style={panel === null ? undefined : {display: 'none'}}>{mobileSummary}</div>}
      <div className="pointer-events-none absolute inset-0 z-[5] bg-grid-pattern opacity-10 mix-blend-screen" />
      <div className="pointer-events-none absolute inset-0 z-[8] bg-noise-pattern opacity-[0.02] mix-blend-overlay" />
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
        <div className="relative z-50 pointer-events-auto shrink-0 border-b border-hud-green/20 bg-black/40 backdrop-blur-md">{topBar}</div>
        <div className="relative flex min-h-0 flex-1 justify-between p-2 xl:p-4">
          {((panel === 'left' && leftSidebar) || (panel === 'right' && rightSidebar) || (panel === 'status' && statusPanel)) && <button className="absolute inset-0 z-10 bg-black/35 pointer-events-auto xl:hidden" aria-label="Close panel" onClick={() => setPanel(null)} />}
          <div id="hud-left-panel" className={`hud-panel left-2 xl:static xl:flex xl:w-[380px] ${panel === 'left' && leftSidebar ? 'flex' : 'hidden'} ${leftSidebar ? 'pointer-events-auto' : 'pointer-events-none'}`}>{sheetHeading(leftLabel, 'Close layers panel')}<div className="hud-panel-content">{leftSidebar}</div></div>
          <div className="flex-1" />
          <div id="hud-right-panel" role={compact && panel === 'right' ? "dialog" : undefined} aria-modal={compact && panel === 'right' ? true : undefined} aria-label={compact && panel === 'right' ? rightLabel : undefined} className={`hud-panel right-2 xl:static xl:flex xl:w-[350px] ${panel === 'right' && rightSidebar ? 'flex' : 'hidden'} ${rightSidebar ? 'pointer-events-auto' : 'pointer-events-none'}`}>{sheetHeading(rightLabel, 'Close details panel')}<div className="hud-panel-content">{rightSidebar}</div></div>
          {compact && panel === 'status' && statusPanel && <div className="hud-panel hud-status-panel right-2 flex pointer-events-auto">
            {sheetHeading('Status', 'Close status panel')}
            <div className="hud-panel-content">{statusPanel}</div>
          </div>}
          {(leftSidebar || rightSidebar || (mapView && statusPanel)) && <div className={`${viewMode ? 'mobile-map-dock' : 'absolute top-2 left-2 z-30 flex gap-2'} pointer-events-auto xl:hidden`} aria-label="Map panels">
            {mapView && <button className="hud-drawer-button" aria-pressed={panel === null} onClick={() => openPanel(null)}><Globe size={17} aria-hidden="true" /><span>Map</span></button>}
            {leftSidebar && <button className="hud-drawer-button" aria-controls="hud-left-panel" aria-expanded={panel === 'left'} onClick={() => openPanel(panel === 'left' ? null : 'left')}>{viewMode === 'ORBITAL' ? <Satellite size={17} aria-hidden="true" /> : viewMode === 'INTEL' ? <Globe size={17} aria-hidden="true" /> : <Crosshair size={17} aria-hidden="true" />}<span>{leftLabel}</span></button>}
            {rightSidebar && <button className="hud-drawer-button" aria-controls="hud-right-panel" aria-expanded={panel === 'right'} onClick={() => openPanel(panel === 'right' ? null : 'right')}><FileText size={17} aria-hidden="true" /><span>{rightLabel}</span>{selectionLabel && <span className="mobile-selection-label">{selectionLabel}</span>}</button>}
            {mapView && statusPanel && <button className="hud-drawer-button" aria-expanded={panel === 'status'} onClick={() => openPanel(panel === 'status' ? null : 'status')}><Activity size={17} aria-hidden="true" /><span>Status</span></button>}
          </div>}
        </div>
      </div>
      </div>
    </div>
    </MobileNavigationContext.Provider>
  );
};
