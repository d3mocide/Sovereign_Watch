import React, { useState, useEffect } from 'react';
import { CoTEntity } from '../../types';
import { Compass } from '../widgets/Compass';
import { PolarPlotWidget } from '../widgets/PolarPlotWidget';
import { Crosshair, Map as MapIcon, Network, Radio, Shield, Terminal } from 'lucide-react';
import { TimeTracked } from './TimeTracked';
import { PayloadInspector } from '../widgets/PayloadInspector';
import { AnalysisWidget } from '../widgets/AnalysisWidget';
import { useMissionLocation } from '../../hooks/useMissionLocation';
import { usePassPredictions } from '../../hooks/usePassPredictions';
import { satAzEl } from '../../utils/map/geoUtils';

export const NAV_STATUS_MAP: Record<number, string> = {
  0: 'Under way using engine',
  1: 'At anchor',
  2: 'Not under command',
  3: 'Restricted maneuverability',
  4: 'Constrained by draught',
  5: 'Moored',
  6: 'Aground',
  7: 'Engaged in fishing',
  8: 'Under way sailing',
  14: 'AIS-SART active',
  15: 'Not defined'
};

export const SHIP_TYPE_MAP: Record<number, string> = {
  30: 'Fishing vessel',
  35: 'Military operations',
  37: 'Pleasure craft',
  52: 'Tug',
  55: 'Law enforcement',
  60: 'Passenger ship',
  70: 'Cargo ship',
  80: 'Tanker'
};

// ---------------------------------------------------------------------------
// Satellite-specific inspector section (hooks isolated here to avoid
// violating Rules of Hooks in the main component's conditional branches)
// ---------------------------------------------------------------------------

function formatCountdown(isoTarget: string, now: number): string {
  const delta = Math.round((new Date(isoTarget).getTime() - now) / 1000);
  if (Math.abs(delta) < 5) return 'NOW';
  const sign = delta < 0 ? 'T+' : 'T-';
  const abs = Math.abs(delta);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  if (h > 0) return `${sign}${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${sign}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function SatelliteInspectorSection({ entity }: { entity: CoTEntity }) {
  const { lat: obsLat, lon: obsLon } = useMissionLocation();
  const [now, setNow] = useState(Date.now());

  // Prefer detail.norad_id; fall back to parsing from uid string e.g. "SAT-40044"
  const noradIdStr =
    entity.detail?.norad_id
      ? String(entity.detail.norad_id)
      : (entity.uid?.replace?.(/^SAT-/i, '') ?? '');

  const { passes } = usePassPredictions(obsLat, obsLon, {
    noradIds: noradIdStr ? [noradIdStr] : [],
    hours: 6,
    skip: !noradIdStr,
  });

  // Tick every second for live az/el and countdown
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Live az/el from current entity position
  const altKm = (entity.altitude || 0) / 1000;
  const { az, el, rangeKm } = altKm > 0
    ? satAzEl(obsLat, obsLon, entity.lat, entity.lon, altKm)
    : { az: 0, el: -90, rangeKm: 0 };

  // Next upcoming pass
  const nextPass = passes.find(p => new Date(p.los).getTime() > now);

  const inclination = entity.detail?.inclinationDeg != null
    ? Number(entity.detail.inclinationDeg).toFixed(2) + '°'
    : '---';
  const eccentricity = entity.detail?.eccentricity != null
    ? Number(entity.detail.eccentricity).toFixed(5)
    : '---';

  // Build polar pass shape from next pass points
  const polarPass = nextPass && nextPass.points?.length > 0
    ? {
      points: nextPass.points.map((pt, i) => ({
        azimuth: pt.az,
        elevation: pt.el,
        time: pt.t,
        isAos: i === 0,
        isTca: pt.t === nextPass.tca,
        isLos: i === nextPass.points.length - 1,
      })),
    }
    : undefined;

  return (
    <section className="space-y-1 pt-2">
      <h3 className="text-[10px] text-white/50 font-bold pb-1">Orbital_Parameters</h3>

      {/* Inclination / Eccentricity */}
      <div className="grid grid-cols-2 gap-4 text-mono-xs font-medium">
        <div className="flex justify-between border-b border-white/5 pb-1">
          <span className="text-white/30">INC:</span>
          <span className="text-purple-300 tabular-nums">{inclination}</span>
        </div>
        <div className="flex justify-between border-b border-white/5 pb-1">
          <span className="text-white/30">ECC:</span>
          <span className="text-white/70 tabular-nums">{eccentricity}</span>
        </div>
      </div>

      {/* Live Az / El / Range */}
      {altKm > 0 && (
        <div className="grid grid-cols-3 gap-2 text-mono-xs font-medium">
          <div className="flex justify-between border-b border-white/5 pb-1">
            <span className="text-white/30">AZ:</span>
            <span className="text-purple-300 tabular-nums">{az.toFixed(1)}°</span>
          </div>
          <div className="flex justify-between border-b border-white/5 pb-1">
            <span className="text-white/30">EL:</span>
            <span className={`tabular-nums ${el >= 10 ? 'text-hud-green' : 'text-white/50'}`}>{el.toFixed(1)}°</span>
          </div>
          <div className="flex justify-between border-b border-white/5 pb-1">
            <span className="text-white/30">RNG:</span>
            <span className="text-white/70 tabular-nums">{Math.round(rangeKm).toLocaleString()} km</span>
          </div>
        </div>
      )}

      {/* Next pass countdown */}
      {nextPass && (
        <div className="mt-1 px-2 py-1.5 rounded bg-purple-400/5 border border-purple-400/20 flex items-center justify-between">
          <span className="text-[8px] text-purple-400/60 font-bold tracking-widest uppercase">Next Pass</span>
          <div className="flex gap-3 text-[10px] font-mono">
            <div className="flex items-center gap-1">
              <span className="text-[7px] text-white/30 uppercase">AOS:</span>
              <span className="text-white/80">{formatCountdown(nextPass.aos, now)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[7px] text-white/30 uppercase">TCA:</span>
              <span className="text-purple-300">{nextPass.max_elevation.toFixed(0)}°</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[7px] text-white/30 uppercase">DUR:</span>
              <span className="text-white/80">{Math.round(nextPass.duration_seconds / 60)}m</span>
            </div>
          </div>
        </div>
      )}

      {/* Pass Geometry polar plot — fills remaining sidebar space */}
      <div className="mt-1 flex-1 min-h-0 border border-white/10 rounded overflow-hidden" style={{ minHeight: 200 }}>
        <PolarPlotWidget pass={polarPass} />
      </div>
    </section>
  );
}

interface SidebarRightProps {
  entity: CoTEntity | null;
  onClose: () => void;
  onCenterMap?: () => void;
}

export const SidebarRight: React.FC<SidebarRightProps> = ({
  entity,
  onClose,
  onCenterMap
}) => {
  const [showInspector, setShowInspector] = useState(false);

  // Reset inspector when entity changes
  useEffect(() => {
    setShowInspector(false);
  }, [entity?.uid]);

  if (!entity) return null;

  // ── JS8Call radio station ───────────────────────────────────────────────
  if (entity.type === 'js8') {
    const snr = entity.detail?.snr as number | undefined;
    const grid = entity.detail?.grid as string | undefined;
    const distKm = entity.detail?.distance_km as number | undefined;
    const bearingDeg = entity.detail?.bearing_deg as number | undefined;
    const freq = entity.detail?.freq as number | undefined;

    function snrClass(v: number | undefined): string {
      if (v == null) return 'text-white/40';
      if (v >= -10) return 'text-emerald-400';
      if (v >= -18) return 'text-yellow-400';
      return 'text-red-400';
    }

    return (
      <div className="pointer-events-auto flex flex-col h-auto max-h-full overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
        {/* Header */}
        <div className="p-3 border border-b-0 border-indigo-400/30 bg-gradient-to-br from-indigo-400/20 to-indigo-400/5 backdrop-blur-md rounded-t-sm">
          <div className="flex justify-between items-start">
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Radio size={14} className="text-indigo-400 shrink-0" />
                <span className="text-[10px] font-bold tracking-[.3em] text-white/40">HF_RADIO_CONTACT</span>
              </div>
              <h2 className="text-mono-xl font-bold tracking-tighter text-indigo-300 drop-shadow-[0_0_8px_currentColor] mb-2">
                {entity.callsign}
              </h2>
              <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
                <h3 className="text-mono-sm font-bold text-white/90">JS8CALL STATION</h3>
                <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">Grid:</span>
                    <span className="text-white/80">{grid || 'UNKNOWN'}</span>
                  </div>
                  {freq != null && (
                    <div className="flex gap-2">
                      <span className="text-white/30 w-16">Freq:</span>
                      <span className="text-white/80">{(freq / 1000).toFixed(3)} kHz</span>
                    </div>
                  )}
                </div>
              </section>
            </div>
            <button onClick={onClose} aria-label="Close details" title="Close details" className="p-1 text-white/30 hover:text-white transition-colors shrink-0 focus-visible:ring-1 focus-visible:ring-hud-green outline-none">x</button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); onCenterMap?.(); }}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-b from-hud-green/30 to-hud-green/10 hover:from-hud-green/40 hover:to-hud-green/20 border border-hud-green/50 py-1.5 rounded text-[10px] font-bold tracking-widest text-hud-green transition-all active:scale-[0.98]"
            >
              <Crosshair size={12} />
              CENTER_VIEW
            </button>
          </div>
        </div>

        {/* Signal data body */}
        <div className="overflow-y-auto min-h-0 shrink border-x border-tactical-border bg-black/30 backdrop-blur-md p-3 space-y-3 scrollbar-none font-mono">
          <section className="space-y-2">
            <h3 className="text-[10px] text-white/50 font-bold">Signal_Data</h3>
            <div className="space-y-1 text-mono-xs font-medium">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span className="text-white/30">SNR:</span>
                  <span className={`tabular-nums font-bold ${snrClass(snr)}`}>
                    {snr != null ? `${snr > 0 ? '+' : ''}${snr} dB` : '---'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span className="text-white/30">BRG:</span>
                  <span className="text-white tabular-nums">
                    {bearingDeg != null ? `${Math.round(bearingDeg)}°` : '---'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span className="text-white/30">DIST:</span>
                  <span className="text-white tabular-nums">
                    {distKm != null ? `${distKm} km` : '---'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span className="text-white/30">GRID:</span>
                  <span className="text-white tabular-nums">{grid || '---'}</span>
                </div>
              </div>
            </div>
            <div className="pt-1 flex justify-center opacity-80">
              <Compass heading={bearingDeg ?? 0} size={180} accentColor="indigo-400" />
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="p-3 border border-t-0 border-tactical-border bg-black/40 backdrop-blur-md rounded-b-sm flex flex-col gap-2">
          <div className="flex gap-2 w-full">
            <AnalysisWidget uid={entity.uid} accentColor="text-indigo-400" compactMode={true} />
            <button
              onClick={() => setShowInspector(true)}
              className="flex-1 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded group transition-all"
            >
              <div className="flex items-center justify-between px-3">
                <span className="text-[10px] font-bold tracking-[.2em] text-white/30 group-hover:text-white/60">RAW_PAYLOAD</span>
                <Terminal size={12} className="text-white/20" />
              </div>
            </button>
          </div>
          {/* Compact Metadata Footer */}
          <div className="flex items-center justify-between text-[8px] font-mono text-white/30 pt-1 border-t border-white/5">
            <span>SIG: <span className="text-hud-green/70">JS8CALL_HF</span></span>
            <span><TimeTracked lastSeen={entity.lastSeen} /></span>
          </div>
        </div>
      </div>
    );
  }
  // ── end JS8 branch ─────────────────────────────────────────────────────────

  // ── Repeater Infrastructure branch ───────────────────────────────────────────────
  if (entity.type === 'repeater') {
    const detail = entity.detail || {};

    // Format frequencies
    const formatFreq = (mhz?: string | number) => mhz ? `${Number(mhz).toFixed(4)} MHz` : 'UNKNOWN';
    const offset = (detail.input_freq && detail.frequency)
      ? ((Number(detail.input_freq) - Number(detail.frequency)) > 0 ? `+${(Number(detail.input_freq) - Number(detail.frequency)).toFixed(2)}` : (Number(detail.input_freq) - Number(detail.frequency)).toFixed(2))
      : 'SIMPLEX';

    return (
      <div className="pointer-events-auto flex flex-col h-auto max-h-full overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
        {/* Header */}
        <div className="p-3 border border-b-0 border-teal-400/30 bg-gradient-to-br from-teal-400/20 to-teal-400/5 backdrop-blur-md rounded-t-sm">
          <div className="flex justify-between items-start">
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Radio size={14} className="text-teal-400 shrink-0" />
                <span className="text-[10px] font-bold tracking-[.3em] text-white/40">RF_INFRASTRUCTURE</span>
              </div>
              <h2 className="text-mono-xl font-bold tracking-tighter text-teal-300 drop-shadow-[0_0_8px_currentColor] mb-2 truncate" title={entity.callsign}>
                {entity.callsign}
              </h2>
              <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
                <h3 className="text-mono-sm font-bold text-white/90">
                  {String(detail.use || 'REPEATER').toUpperCase()}
                </h3>
                <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">City:</span>
                    <span className="text-white/80">{String(detail.city || 'UNKNOWN')}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">State:</span>
                    <span className="text-white/80">{String(detail.state || 'UNKNOWN')}</span>
                  </div>
                </div>
              </section>
            </div>
            <button onClick={onClose} aria-label="Close details" title="Close details" className="p-1 text-white/30 hover:text-white transition-colors shrink-0 focus-visible:ring-1 focus-visible:ring-hud-green outline-none">x</button>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); onCenterMap?.(); }}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-b from-hud-green/30 to-hud-green/10 hover:from-hud-green/40 hover:to-hud-green/20 border border-hud-green/50 py-1.5 rounded text-[10px] font-bold tracking-widest text-hud-green transition-all active:scale-[0.98]"
            >
              <Crosshair size={12} />
              CENTER_VIEW
            </button>
          </div>
        </div>

        {/* Signal data body */}
        <div className="overflow-y-auto min-h-0 shrink border-x border-tactical-border bg-black/30 backdrop-blur-md p-3 space-y-3 scrollbar-none font-mono">
          <section className="space-y-2">
            <h3 className="text-[10px] text-white/50 font-bold">RF_Parameters</h3>
            <div className="space-y-1 text-mono-xs font-medium">
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">OUTPUT:</span>
                <span className="text-teal-400 tabular-nums font-bold">{formatFreq(detail.frequency as number)}</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">OFFSET:</span>
                <span className="text-white tabular-nums">{offset} MHz</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">CTCSS/PL:</span>
                <span className="text-amber-400 tabular-nums">{String(detail.ctcss || 'NONE')}</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">MODES:</span>
                <span className="text-purple-400 truncate" title={String(detail.modes || 'FM')}>
                  {String(detail.modes || 'FM').toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">STATUS:</span>
                <span className={`tabular-nums ${String(detail.status).toLowerCase().includes('on-air') ? 'text-hud-green' : 'text-slate-400'}`}>
                  {String(detail.status || 'UNKNOWN').toUpperCase()}
                </span>
              </div>
            </div>

            <div className="flex gap-4 text-mono-xs mt-3 pt-2 border-t border-white/5">
              <div className="flex gap-2">
                <span className="text-white/30">LAT:</span>
                <span className="text-white tabular-nums">{entity.lat.toFixed(6)}°</span>
              </div>
              <div className="flex gap-2">
                <span className="text-white/30">LON:</span>
                <span className="text-white tabular-nums">{entity.lon.toFixed(6)}°</span>
              </div>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="p-3 border border-t-0 border-tactical-border bg-black/40 backdrop-blur-md rounded-b-sm flex flex-col gap-2">
          <div className="flex gap-2 w-full">
            <AnalysisWidget uid={entity.uid} accentColor="text-teal-400" compactMode={true} />
            <button
              onClick={() => setShowInspector(true)}
              className="flex-1 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded group transition-all"
            >
              <div className="flex items-center justify-between px-3">
                <span className="text-[10px] font-bold tracking-[.2em] text-white/30 group-hover:text-white/60">RAW_PAYLOAD</span>
                <Terminal size={12} className="text-white/20" />
              </div>
            </button>
          </div>
          {/* Compact Metadata Footer */}
          <div className="flex items-center justify-between text-[8px] font-mono text-white/30 pt-1 border-t border-white/5">
            <span>SRC: <span className="text-teal-400/70">REPEATERBOOK_API</span></span>
            <span><TimeTracked lastSeen={entity.lastSeen} /></span>
          </div>
        </div>
      </div>
    );
  }
  // ── Infrastructure branch (Cables & Stations) ──────────────────────────────────
  if (entity.type === 'infra') {
    const detail = entity.detail || {};
    const props = detail.properties || {};
    const isStation = detail.geometry?.type === 'Point';

    return (
      <div className="pointer-events-auto flex flex-col h-auto max-h-full overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
        {/* Header */}
        <div className="p-3 border border-b-0 border-cyan-400/30 bg-gradient-to-br from-cyan-400/20 to-cyan-400/5 backdrop-blur-md rounded-t-sm">
          <div className="flex justify-between items-start">
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Network size={14} className="text-cyan-400 shrink-0" />
                <span className="text-[10px] font-bold tracking-[.3em] text-white/40">UNDERSEA_INFRASTRUCTURE</span>
              </div>
              <h2 className="text-mono-xl font-bold tracking-tighter text-cyan-300 drop-shadow-[0_0_8px_currentColor] mb-2 truncate" title={entity.callsign}>
                {entity.callsign}
              </h2>
              <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
                <h3 className="text-mono-sm font-bold text-white/90">
                  {isStation ? 'LANDING STATION' : 'SUBMARINE CABLE'}
                </h3>
                <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">{isStation ? 'Country:' : 'Status:'}</span>
                    <span className="text-white/80">{String(props.country || props.status || 'ACTIVE')}</span>
                  </div>
                  {!isStation && props.rfs && (
                    <div className="flex gap-2">
                      <span className="text-white/30 w-16">RFS:</span>
                      <span className="text-white/80">{props.rfs}</span>
                    </div>
                  )}
                </div>
              </section>
            </div>
            <button onClick={onClose} aria-label="Close details" title="Close details" className="p-1 text-white/30 hover:text-white transition-colors shrink-0 focus-visible:ring-1 focus-visible:ring-hud-green outline-none">x</button>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); onCenterMap?.(); }}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-b from-hud-green/30 to-hud-green/10 hover:from-hud-green/40 hover:to-hud-green/20 border border-hud-green/50 py-1.5 rounded text-[10px] font-bold tracking-widest text-hud-green transition-all active:scale-[0.98]"
            >
              <Crosshair size={12} />
              CENTER_VIEW
            </button>
          </div>
        </div>

        {/* Signal data body */}
        <div className="overflow-y-auto min-h-0 shrink border-x border-tactical-border bg-black/30 backdrop-blur-md p-3 space-y-3 scrollbar-none font-mono">
          <section className="space-y-2">
            <h3 className="text-[10px] text-white/50 font-bold">Infrastructure_Specs</h3>
            <div className="space-y-1 text-mono-xs font-medium">
              {!isStation && (
                <>
                  <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                    <span className="text-white/30">LENGTH:</span>
                    <span className="text-cyan-400 tabular-nums font-bold">
                      {props.length_km ? `${Number(props.length_km).toLocaleString()} km` : 'VARIES'}
                    </span>
                  </div>
                  <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                    <span className="text-white/30">CAPACITY:</span>
                    <span className="text-white tabular-nums">{props.capacity || 'TBD'}</span>
                  </div>
                </>
              )}
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">OWNERS:</span>
                <span className="text-amber-400 truncate" title={props.owners || 'CONSORTIUM'}>
                  {props.owners || 'CONSORTIUM'}
                </span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">ID:</span>
                <span className="text-white/50">{props.id || 'N/A'}</span>
              </div>
            </div>

            <div className="flex gap-4 text-mono-xs mt-3 pt-2 border-t border-white/5">
              <div className="flex gap-2">
                <span className="text-white/30">LAT:</span>
                <span className="text-white tabular-nums">{entity.lat.toFixed(6)}°</span>
              </div>
              <div className="flex gap-2">
                <span className="text-white/30">LON:</span>
                <span className="text-white tabular-nums">{entity.lon.toFixed(6)}°</span>
              </div>
            </div>
          </section>

          <div className="h-px bg-white/5 w-full my-2" />

          {props.landing_points && (
            <section className="space-y-1">
              <h3 className="text-[10px] text-white/50 font-bold pb-1 text-cyan-400">Landing_Points</h3>
              <div className="text-[10px] text-white/70 leading-relaxed font-mono bg-white/5 p-2 rounded border border-white/10">
                {props.landing_points}
              </div>
            </section>
          )}

          {props.cables && isStation && (
            <section className="space-y-1">
              <h3 className="text-[10px] text-white/50 font-bold pb-1 text-cyan-400">Connected_Cables</h3>
              <div className="text-[10px] text-white/70 leading-relaxed font-mono bg-white/5 p-2 rounded border border-white/10">
                {props.cables}
              </div>
            </section>
          )}

        </div>

        {/* Footer */}
        <div className="p-3 border border-t-0 border-tactical-border bg-black/40 backdrop-blur-md rounded-b-sm flex flex-col gap-2">
          <div className="flex gap-2 w-full">
            <AnalysisWidget uid={entity.uid} accentColor="text-cyan-400" compactMode={true} />
            <button
              onClick={() => setShowInspector(true)}
              className="flex-1 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded group transition-all"
            >
              <div className="flex items-center justify-between px-3">
                <span className="text-[10px] font-bold tracking-[.2em] text-white/30 group-hover:text-white/60">RAW_PAYLOAD</span>
                <Terminal size={12} className="text-white/20" />
              </div>
            </button>
          </div>
          {/* Compact Metadata Footer */}
          <div className="flex items-center justify-between text-[8px] font-mono text-white/30 pt-1 border-t border-white/5">
            <span>SRC: <span className="text-cyan-400/70">SUBMARINE_MAP_API</span></span>
            <span><TimeTracked lastSeen={entity.lastSeen} /></span>
          </div>
        </div>
      </div>
    );
  }

  const isShip = entity.type.includes('S');
  const isSat = entity.type === 'a-s-K' || entity.type.indexOf('K') === 4;

  let accentColor = 'text-air-accent';
  let accentBase = 'air-accent';
  let accentBg = 'bg-gradient-to-br from-air-accent/20 to-air-accent/5';
  let accentBorder = 'border-air-accent/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]';

  if (isSat) {
    accentColor = 'text-purple-400';
    accentBase = 'purple-400';
    accentBg = 'bg-gradient-to-br from-purple-400/20 to-purple-400/5';
    accentBorder = 'border-purple-400/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]';
  } else if (isShip) {
    accentColor = 'text-sea-accent';
    accentBase = 'sea-accent';
    accentBg = 'bg-gradient-to-br from-sea-accent/20 to-sea-accent/5';
    accentBorder = 'border-sea-accent/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]';
  }

  if (showInspector) {
    return (
      <div className="pointer-events-auto h-full animate-in slide-in-from-right duration-500 w-full">
        <PayloadInspector entity={entity} onClose={() => setShowInspector(false)} />
      </div>
    );
  }

  return (
    <div className="pointer-events-auto flex flex-col h-auto max-h-full overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
      {/* 1. Target Identity Header */}
      <div className={`p-3 border border-b-0 ${accentBorder} ${accentBg} backdrop-blur-md rounded-t-sm relative`}>
        {/* Glass Reflection Shine */}


        <div className="relative z-10 flex justify-between items-start gap-2">
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Shield size={14} className={accentColor} />
              <span className="text-[10px] font-bold tracking-[.3em] text-white/40">IDENTIFIED_TARGET</span>
              {entity.classification && !isShip && (
                <div className="flex gap-1.5">
                  {entity.classification.affiliation && (
                    // Suppress 'general_aviation' affiliation if platform is helicopter/drone to avoid clutter
                    !(entity.classification.affiliation === 'general_aviation' &&
                      ['helicopter', 'drone'].includes(entity.classification.platform || '')) && (
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wider ${['military', 'government'].includes(entity.classification.affiliation) ? 'bg-[#FF8800]/20 text-[#FF8800] border border-[#FF8800]/30' :
                        'bg-white/10 text-white/60 border border-white/20'
                        }`}>
                        {entity.classification.affiliation.toUpperCase()}
                      </span>
                    )
                  )}
                  {['helicopter', 'drone'].includes(entity.classification.platform || '') && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wider bg-[#FF8800]/20 text-[#FF8800] border border-[#FF8800]/30">
                      {entity.classification.platform!.toUpperCase()}
                    </span>
                  )}
                </div>
              )}
              {isShip && entity.vesselClassification?.category && (
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wider ${['sar', 'military', 'law_enforcement'].includes(entity.vesselClassification.category) ? 'bg-[#FF8800]/20 text-[#FF8800] border border-[#FF8800]/30' :
                  entity.vesselClassification.category === 'cargo' ? 'bg-green-500/20 text-green-500 border border-green-500/30' :
                    entity.vesselClassification.category === 'tanker' ? 'bg-red-500/20 text-red-500 border border-red-500/30' :
                      entity.vesselClassification.category === 'passenger' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                        'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  }`}>
                  {entity.vesselClassification.category.toUpperCase()}
                </span>
              )}
            </div>
            <h2 className={`text-mono-xl font-bold tracking-tighter ${accentColor} drop-shadow-[0_0_8px_currentColor] mb-2`}>
              {entity.callsign}
            </h2>

            {/* Aircraft Info Box */}
            {/* Vessel Info Box */}
            {/* Satellite Info Box */}
            {isSat && entity.detail ? (
              <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
                <h3 className="text-mono-sm font-bold text-white/90">
                  {String(entity.detail.category || 'ORBITAL ASSET').toUpperCase()}
                </h3>
                <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">NORAD ID:</span>
                    <span className="text-white/80">
                      {entity.detail.norad_id
                        ? String(entity.detail.norad_id)
                        : entity.uid?.replace?.(/^SAT-/i, '') || '—'}
                    </span>
                  </div>
                  {entity.detail.inclination_deg != null && (
                    <div className="flex gap-2">
                      <span className="text-white/30 w-16">Incl:</span>
                      <span className="text-purple-300/80">{Number(entity.detail.inclination_deg).toFixed(2)}°</span>
                    </div>
                  )}
                  {entity.detail.eccentricity != null && (
                    <div className="flex gap-2">
                      <span className="text-white/30 w-16">Ecc:</span>
                      <span className="text-white/70">{Number(entity.detail.eccentricity).toFixed(5)}</span>
                    </div>
                  )}
                </div>
              </section>
            ) : isShip && entity.vesselClassification ? (
              <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
                <h3 className="text-mono-sm font-bold text-white/90">
                  {SHIP_TYPE_MAP[entity.vesselClassification.shipType || 0] || 'UNKNOWN VESSEL'}
                </h3>
                <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">IMO:</span>
                    <span className="text-white/80">{entity.vesselClassification.imo || 'UNKNOWN'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">Flag MID:</span>
                    <span className="text-white/80">{entity.vesselClassification.flagMid || 'UNKNOWN'}</span>
                  </div>
                  {entity.vesselClassification.length !== undefined && entity.vesselClassification.length > 0 && (
                    <div className="flex gap-2">
                      <span className="text-white/30 w-16">Dimensions:</span>
                      <span className="text-white/80">{entity.vesselClassification.length}m Ã— {entity.vesselClassification.beam}m</span>
                    </div>
                  )}
                </div>
              </section>
            ) : entity.classification && (
              /* Aircraft Info Box */
              <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
                <h3 className="text-mono-sm font-bold text-white/90">
                  {entity.classification.description || entity.classification.icaoType || 'UNKNOWN_MODEL'}
                </h3>
                <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">Operator:</span>
                    <span className="text-white/80">{entity.classification.operator || 'UNKNOWN'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">Category:</span>
                    <span className="text-white/80">{entity.classification.category || entity.classification.sizeClass || 'UNKNOWN'}</span>
                  </div>
                </div>
              </section>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close details"
            title="Close details"
            className="p-1 text-white/30 hover:text-white transition-colors focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
          >
            x
          </button>
        </div>

        {/* Global IDs */}
        <div className="flex gap-2 overflow-hidden mb-2">
          <div className="bg-black/40 px-2 py-1 rounded border border-white/10 flex flex-col min-w-0 shadow-inner">
            <span className="text-[8px] text-white/30 uppercase font-bold tracking-tight">TYPE_TAG</span>
            <span className="text-mono-xs font-bold truncate text-white">{entity.type}</span>
          </div>
          <div className="bg-black/40 px-2 py-1 rounded border border-white/10 flex flex-col flex-1 shadow-inner">
            <span className="text-[8px] text-white/30 uppercase font-bold tracking-tight">REGISTRATION</span>
            <span className="text-mono-xs font-bold truncate text-white">
              {isSat
                ? String(entity.detail?.category || 'ORBITAL').toUpperCase()
                : (isShip && entity.vesselClassification?.imo)
                  ? `IMO ${entity.vesselClassification.imo}`
                  : entity.classification?.registration || 'N/A'}
            </span>
          </div>
        </div>

        {/* Actions Bar — not applicable for satellites */}
        {!isSat && (
          <div className="flex gap-2">
            <button
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onCenterMap?.();
              }}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-b from-hud-green/30 to-hud-green/10 hover:from-hud-green/40 hover:to-hud-green/20 border border-hud-green/50 py-1.5 rounded text-[10px] font-bold tracking-widest text-hud-green transition-all active:scale-[0.98] shadow-[0_0_15px_rgba(0,255,65,0.1)]"
            >
              <Crosshair size={12} />
              CENTER_VIEW
            </button>
            <button className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-b from-white/10 to-transparent hover:from-white/20 hover:to-white/5 border border-white/10 py-1.5 rounded text-[10px] font-bold tracking-widest text-white/70 transition-all active:scale-[0.98]">
              <MapIcon size={12} />
              TRACK_LOG
            </button>
          </div>
        )}
      </div>

      {/* 2. Main Data Body */}
      <div className="overflow-y-auto min-h-0 shrink border-x border-tactical-border bg-black/30 backdrop-blur-md p-3 space-y-3 scrollbar-none font-mono">

        {/* Positional Group */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-hud-green/40 pb-1">
            <h3 className="text-[10px] text-white/50 font-bold">Positional_Telemetry</h3>
          </div>
          <div className="flex gap-4 text-mono-xs">
            <div className="flex gap-2">
              <span className="text-white/30">LAT:</span>
              <span className="text-white tabular-nums">{entity.lat.toFixed(6)}°</span>
            </div>
            <div className="flex gap-2">
              <span className="text-white/30">LON:</span>
              <span className="text-white tabular-nums">{entity.lon.toFixed(6)}°</span>
            </div>
          </div>
        </section>

        {/* Kinematics Group */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-hud-green/40 pb-1">
            <h3 className="text-[10px] text-white/50 font-bold">Vector_Dynamics</h3>
          </div>

          <div className="space-y-1 text-mono-xs font-medium">
            {/* Row 1: Speed / Hdg */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-white/30">{isSat ? 'VEL:' : 'SOG:'}</span>
                <span className={`${accentColor} tabular-nums`}>
                  {isSat ? `${(entity.speed / 1000).toFixed(1)} km/s` : `${(entity.speed * 1.94384).toFixed(1)} kts`}
                </span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-white/30">{isSat ? 'TRK:' : 'COG:'}</span>
                <span className={`${accentColor} tabular-nums`}>{Math.round(entity.course)}°</span>
              </div>
            </div>

            {isSat ? (
              <>
                {/* Row 2: Alt / Period */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-white/30">ALT:</span>
                    <span className="text-white tabular-nums">
                      {entity.altitude > 0 ? `${Math.round(entity.altitude / 1000).toLocaleString()} km` : '---'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-white/30">PERIOD:</span>
                    <span className="text-white/40 tabular-nums">
                      {entity.detail?.periodMin ? `${Number(entity.detail.periodMin).toFixed(1)}m` : '---'}
                    </span>
                  </div>
                </div>
                {/* Live az/el, orbital params, next pass countdown */}
                <SatelliteInspectorSection entity={entity} />
              </>
            ) : isShip ? (
              <>
                {/* Row 2: Nav Status / Dest */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-white/30">STAT:</span>
                    <span className="text-white tabular-nums truncate max-w-[120px]" title={NAV_STATUS_MAP[entity.vesselClassification?.navStatus ?? 15] || 'Unknown'}>
                      {NAV_STATUS_MAP[entity.vesselClassification?.navStatus ?? 15] || 'UNKNOWN'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-white/30">DEST:</span>
                    <span className="text-white tabular-nums truncate max-w-[100px]">
                      {entity.vesselClassification?.destination || 'UNKNOWN'}
                    </span>
                  </div>
                </div>

                {/* Row 3: Draught / Hazardous */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-white/30">DRGT:</span>
                    <span className="text-white tabular-nums">
                      {entity.vesselClassification?.draught ? `${entity.vesselClassification.draught}m` : '---'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-white/30">HAZ:</span>
                    <span className={`${entity.vesselClassification?.hazardous ? 'text-red-500 animate-pulse font-bold' : 'text-white/40'} tabular-nums`}>
                      {entity.vesselClassification?.hazardous ? 'YES' : 'NONE'}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Row 2: Alt / VS */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-white/30">ALT:</span>
                    <span className="text-white tabular-nums">
                      {entity.altitude > 0 ? Math.round(entity.altitude * 3.28084).toLocaleString() : 'GND'} ft
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-white/30">VS:</span>
                    <span className={`${entity.vspeed && Math.abs(entity.vspeed) > 100 ? 'text-white' : 'text-white/40'} tabular-nums`}>
                      {entity.vspeed ? Math.round(entity.vspeed).toLocaleString() : '0'} fpm
                    </span>
                  </div>
                </div>

                {/* Row 3: Squawk / Emergency */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-white/30">SQUAWK:</span>
                    <span className="text-amber-500/80 tabular-nums">{entity.classification?.squawk || '----'}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-white/30">EMRG:</span>
                    <span className={`${entity.classification?.emergency && entity.classification.emergency !== 'none' ? 'text-alert-red animate-pulse font-bold' : 'text-white/40'} tabular-nums`}>
                      {entity.classification?.emergency ? entity.classification.emergency.toUpperCase() : 'NONE'}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Compass (air/ship) or Pass Geometry polar plot (satellite) */}
          <div className="pt-1 flex justify-center opacity-80 scale-100">
            {!isSat && <Compass heading={entity.course} size={180} accentColor={accentBase} />}
          </div>
        </section>
      </div>

      {/* 3. Footer Actions */}
      <div className="p-3 border border-t-0 border-tactical-border bg-black/40 backdrop-blur-md rounded-b-sm flex flex-col gap-2">
        <div className="flex items-stretch gap-2 w-full grid grid-cols-2">
          <AnalysisWidget uid={entity.uid} accentColor={accentColor} compactMode={true} />

          <button
            onClick={() => setShowInspector(true)}
            className="py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded group transition-all col-span-1"
          >
            <div className="flex items-center justify-between px-3 h-full">
              <span className="text-[10px] font-bold tracking-[.2em] text-white/30 group-hover:text-white/60">RAW_PAYLOAD</span>
              <Terminal size={12} className="text-white/20" />
            </div>
          </button>
        </div>

        {/* Compact Metadata Footer */}
        <div className="flex items-center justify-between text-[8px] font-mono text-white/30 pt-1 border-t border-white/5">
          <span>SIG: <span className="text-hud-green/70">{isSat ? 'ORBITAL_Poller' : isShip ? 'AIS_Poller' : 'ADSB_Poller'}</span></span>
          <span><TimeTracked lastSeen={entity.lastSeen} /></span>
        </div>
      </div>
    </div>
  );
};

export default SidebarRight;
