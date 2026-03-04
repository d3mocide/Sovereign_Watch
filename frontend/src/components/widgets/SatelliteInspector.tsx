import React from 'react';

interface SatelliteInspectorProps {
  satellite: {
    norad_id: number;
    name: string;
    category: string;
    altitude_km: number;
    inclination_deg: number;
    eccentricity: number;
    velocity_kms: number;
    azimuth_deg: number;
    elevation_deg: number;
    slant_range_km: number;
    next_pass?: {
      aos: string;
      tca: string;
      los: string;
      max_elevation: number;
      aos_azimuth: number;
      los_azimuth: number;
    };
  } | null;
  onClose: () => void;
  isLoading?: boolean;
}

export const SatelliteInspector: React.FC<SatelliteInspectorProps> = ({ satellite, onClose, isLoading }) => {
  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center border border-white/10 rounded bg-tactical-panel p-4 min-h-[300px]">
        <div className="w-8 h-8 rounded-full border-2 border-purple-400/20 border-t-purple-400 animate-spin mb-3"></div>
        <span className="text-[9px] text-purple-400/50 font-mono tracking-widest uppercase">ACQUIRING TELEMETRY...</span>
      </div>
    );
  }

  if (!satellite) return null;

  // Format times nicely (just HH:MM:SS)
  const formatTime = (isoStr: string) => {
    try {
      return new Date(isoStr).toISOString().split('T')[1].split('.')[0] + ' Z';
    } catch {
      return '---';
    }
  };

  // Assign color based on category, following the design system tokens in tailwind + layers
  let catColor: string;
  let catBg: string;
  const cat = satellite.category.toUpperCase();
  if (cat.includes('GPS') || cat.includes('NAV')) {
    catColor = 'text-sky-300'; catBg = 'bg-sky-400/20 border-sky-400/30';
  } else if (cat.includes('WEATHER') || cat.includes('NOAA')) {
    catColor = 'text-amber-300'; catBg = 'bg-amber-400/20 border-amber-400/30';
  } else if (cat.includes('COMMS') || cat.includes('STARLINK')) {
    catColor = 'text-emerald-300'; catBg = 'bg-emerald-400/20 border-emerald-400/30';
  } else if (cat.includes('INTEL') || cat.includes('MILITARY') || cat.includes('SURVEILLANCE')) {
    catColor = 'text-rose-300'; catBg = 'bg-rose-400/20 border-rose-400/30';
  } else {
    catColor = 'text-purple-300'; catBg = 'bg-purple-400/20 border-purple-400/30';
  }

  return (
    <div className="rounded border border-white/10 bg-black/30 p-3">
      {/* 1. Header */}
      <div className="flex justify-between items-start mb-2">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white font-mono text-sm font-bold tracking-wider">{satellite.name}</span>
            <div className={`px-1.5 py-0.5 rounded text-[8px] font-black tracking-widest uppercase border ${catColor} ${catBg}`}>
              {satellite.category}
            </div>
          </div>
          <span className="text-[9px] text-white/40 tracking-[0.1em] font-mono">NORAD: {satellite.norad_id}</span>
        </div>
        <button
          onClick={onClose}
          className="text-white/30 hover:text-white transition-colors p-1"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <div className="border-t border-white/5 my-2"></div>

      {/* 2. Orbital Parameters */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="flex flex-col">
          <span className="text-[8px] text-white/40 tracking-[0.15em] uppercase">ALTITUDE</span>
          <span className="text-[11px] text-white/90 font-mono tabular-nums">{satellite.altitude_km.toFixed(1)} km</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[8px] text-white/40 tracking-[0.15em] uppercase">INCLINATION</span>
          <span className="text-[11px] text-white/90 font-mono tabular-nums">{satellite.inclination_deg.toFixed(2)}°</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[8px] text-white/40 tracking-[0.15em] uppercase">ECCENTRICITY</span>
          <span className="text-[11px] text-white/90 font-mono tabular-nums">{satellite.eccentricity.toFixed(5)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[8px] text-white/40 tracking-[0.15em] uppercase">VELOCITY</span>
          <span className="text-[11px] text-white/90 font-mono tabular-nums">{satellite.velocity_kms.toFixed(2)} km/s</span>
        </div>
      </div>

      <div className="border-t border-white/5 my-2"></div>

      {/* 3. Observation Data */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div className="flex flex-col">
          <span className="text-[8px] text-white/40 tracking-[0.15em] uppercase">AZIMUTH</span>
          <span className="text-[11px] text-white/90 font-mono tabular-nums">{satellite.azimuth_deg.toFixed(1)}°</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[8px] text-white/40 tracking-[0.15em] uppercase">ELEVATION</span>
          <span className="text-[11px] text-white/90 font-mono tabular-nums">{satellite.elevation_deg.toFixed(1)}°</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[8px] text-white/40 tracking-[0.15em] uppercase">SLANT RANGE</span>
          <span className="text-[11px] text-white/90 font-mono tabular-nums">{satellite.slant_range_km.toFixed(1)} km</span>
        </div>
      </div>

      {/* 4. Next Pass */}
      {satellite.next_pass && (
        <>
          <div className="border-t border-white/5 my-2"></div>
          <div className="flex flex-col bg-purple-900/10 border border-purple-500/20 rounded p-2">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[8px] text-purple-300/70 tracking-[0.15em] uppercase font-bold">NEXT PASS (AOS)</span>
              {/* Fake countdown for visual fidelity. Real countdown would use a timer effect diffing Date.now() vs AOS */}
              <span className="text-[10px] text-purple-300 font-mono font-bold animate-pulse tracking-widest">
                T-MINUS
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1 mb-2">
              <div className="flex flex-col">
                <span className="text-[8px] text-white/30 tracking-[0.1em] uppercase">AOS</span>
                <span className="text-[10px] text-white/80 font-mono">{formatTime(satellite.next_pass.aos)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[8px] text-white/30 tracking-[0.1em] uppercase">TCA</span>
                <span className="text-[10px] text-white/80 font-mono">{formatTime(satellite.next_pass.tca)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[8px] text-white/30 tracking-[0.1em] uppercase">LOS</span>
                <span className="text-[10px] text-white/80 font-mono">{formatTime(satellite.next_pass.los)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex flex-col">
                <span className="text-[8px] text-white/30 tracking-[0.1em] uppercase">MAX EL</span>
                <span className="text-[10px] text-purple-200 font-mono font-bold">{satellite.next_pass.max_elevation.toFixed(1)}°</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/60 font-mono">{satellite.next_pass.aos_azimuth.toFixed(0)}°</span>
                <span className="text-[8px] text-white/20">→</span>
                <span className="text-[10px] text-white/60 font-mono">{satellite.next_pass.los_azimuth.toFixed(0)}°</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
