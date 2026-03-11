import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

interface Pass {
  norad_id: number;
  name: string;
  aos: string;
  tca: string;
  los: string;
  max_elevation: number;
  aos_azimuth: number;
  los_azimuth: number;
  duration_seconds: number;
}

interface PassPredictorWidgetProps {
  passes: Pass[];
  homeLocation: { lat: number; lon: number };
  onPassClick?: (norad: number) => void;
  isLoading?: boolean;
  minElevation?: number;
  onMinElevationChange?: (deg: number) => void;
  /** Custom message shown when passes is empty and not loading */
  emptyMessage?: string;
}

const MIN_EL_OPTIONS = [0, 5, 10, 15, 20, 30];

function formatCountdown(targetIso: string, now: number): string {
  const delta = Math.round((new Date(targetIso).getTime() - now) / 1000);
  if (Math.abs(delta) < 5) return 'NOW';
  const sign = delta < 0 ? 'T+' : 'T-';
  const abs = Math.abs(delta);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  if (h > 0) return `${sign}${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${sign}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function exportCsv(passes: Pass[]) {
  const header = 'norad_id,name,aos,tca,los,max_elevation_deg,aos_azimuth_deg,los_azimuth_deg,duration_sec';
  const rows = passes.map(p =>
    [p.norad_id, `"${p.name}"`, p.aos, p.tca, p.los,
    p.max_elevation.toFixed(1), p.aos_azimuth.toFixed(1),
    p.los_azimuth.toFixed(1), p.duration_seconds].join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `passes_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export const PassPredictorWidget: React.FC<PassPredictorWidgetProps> = ({
  passes, homeLocation, onPassClick, isLoading, minElevation = 10, onMinElevationChange, emptyMessage,
}) => {
  // eslint-disable-next-line react-hooks/purity
  const [now, setNow] = useState(Date.now());
  const [showElMenu, setShowElMenu] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col mt-2 overflow-hidden flex-1 widget-panel">
      <div className="flex justify-between items-center bg-white/5 border-b border-white/10 px-3 py-2 gap-2">
        <span className="text-[10px] font-bold tracking-[0.2em] text-purple-400/70 uppercase shrink-0">UPCOMING PASSES</span>

        <div className="flex items-center gap-1 ml-auto">
          {/* Min elevation pill */}
          <div className="relative">
            <button
              onClick={() => setShowElMenu(v => !v)}
              aria-expanded={showElMenu}
              aria-haspopup="menu"
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold tracking-wider text-white/50 border border-white/10 bg-white/5 hover:bg-white/10 transition-colors focus-visible:ring-1 focus-visible:ring-purple-400 outline-none"
            >
              MIN EL: {minElevation}°
              <span className="text-white/30" aria-hidden="true">▾</span>
            </button>
            {showElMenu && (
              <div
                className="absolute right-0 top-full mt-1 z-50 bg-black/90 border border-white/10 rounded shadow-lg py-1 min-w-[70px]"
                role="menu"
              >
                {MIN_EL_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    onClick={() => { onMinElevationChange?.(opt); setShowElMenu(false); }}
                    role="menuitem"
                    aria-label={`Set minimum elevation to ${opt} degrees`}
                    className={`w-full text-left px-3 py-1 text-[9px] font-mono hover:bg-white/10 transition-colors focus-visible:ring-1 focus-visible:ring-purple-400 outline-none ${opt === minElevation ? 'text-purple-400' : 'text-white/60'}`}
                  >
                    {opt}°
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* CSV export */}
          {passes.length > 0 && (
            <button
              onClick={() => exportCsv(passes)}
              title="Export passes as CSV"
              aria-label="Export passes as CSV"
              className="p-1 text-white/30 hover:text-purple-400 transition-colors focus-visible:ring-1 focus-visible:ring-purple-400 outline-none"
            >
              <Download size={11} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Observer coords */}
      <div className="px-3 py-1 border-b border-white/5">
        <span className="text-[8px] text-white/30 font-mono tracking-widest">
          OBS {homeLocation.lat.toFixed(2)}°, {homeLocation.lon.toFixed(2)}°
        </span>
      </div>

      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-[150px]">
          <div className="w-6 h-6 rounded-full border border-purple-400/20 border-t-purple-400 animate-spin mb-2"></div>
          <span className="text-[8px] text-purple-400/50 font-mono tracking-widest uppercase">PREDICTING TRAJECTORIES...</span>
        </div>
      ) : passes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-4 text-center">
          <span className="text-[9px] text-white/20 font-mono tracking-widest uppercase">
            {emptyMessage ?? 'No upcoming passes'}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-purple-400/20">
          {passes.map((pass, i) => {
            const aosMs = new Date(pass.aos).getTime();
            const losMs = new Date(pass.los).getTime();
            const inProgress = now >= aosMs && now <= losMs;
            const countdown = formatCountdown(inProgress ? pass.los : pass.aos, now);
            const countdownLabel = inProgress ? 'LOS' : 'AOS';
            const aosTime = new Date(pass.aos).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

            return (
              <button
                key={`${pass.norad_id}-${i}`}
                onClick={() => onPassClick?.(pass.norad_id)}
                aria-label={`View details for pass ${pass.name}`}
                className={`w-full text-left flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors border-l-2 focus-visible:ring-1 focus-visible:ring-purple-400 outline-none ${inProgress
                  ? 'bg-purple-400/10 border-purple-400 animate-pulse focus-visible:bg-purple-400/20'
                  : 'hover:bg-white/5 border-transparent hover:border-purple-400 focus-visible:border-purple-400 focus-visible:bg-white/5'
                  }`}
              >
                <div className="flex flex-col min-w-[45px]">
                  <span className={`text-[10px] font-mono ${inProgress ? 'text-purple-300' : 'text-white/70'}`}>
                    {countdown}
                  </span>
                  <span className="text-[7px] text-white/30 uppercase tracking-widest">{countdownLabel}</span>
                </div>

                <div className="flex-1 px-2 flex flex-col truncate">
                  <span className="text-[10px] text-white font-mono truncate">{pass.name}</span>
                  <span className="text-[8px] text-white/30 font-mono">{aosTime}Z · {Math.round(pass.duration_seconds / 60)}m</span>
                </div>

                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-white/80 font-mono">{pass.max_elevation.toFixed(0)}°</span>
                  <span className="text-[7px] text-white/30 uppercase tracking-widest">MAX EL</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
