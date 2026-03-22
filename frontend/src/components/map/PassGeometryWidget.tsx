/**
 * PassGeometryWidget — Floating HUD widget showing the pass geometry polar plot.
 *
 * Sovereign Glass design: matches the SidebarRight / SpaceWeatherPanel aesthetic.
 * Positioned bottom-right in OrbitalMap. Slides left when the right sidebar opens.
 */

import { useEffect, useState } from 'react';
import { PolarPlotWidget } from '../widgets/PolarPlotWidget';

interface PassPoint {
  azimuth: number;
  elevation: number;
  time: string;
  isAos?: boolean;
  isTca?: boolean;
  isLos?: boolean;
}

interface PassGeometryWidgetProps {
  /** Whether to render at all (satellite selected + pass data available) */
  visible: boolean;
  /** Whether the right sidebar is open — slides the widget left when true */
  sidebarOpen: boolean;
  /** The polar pass path to draw */
  pass?: { points: PassPoint[] };
  /** Display name of the tracked satellite */
  satelliteName?: string;
  /** Next pass AOS as ISO string */
  nextPassAos?: string;
  /** Next pass max elevation */
  nextPassMaxEl?: number;
  /** Next pass duration in seconds */
  nextPassDuration?: number;
}

function formatCountdown(isoTime: string | undefined, now: number): string {
  if (!isoTime) return '--:--';
  const diff = Math.round((Date.parse(isoTime) - now) / 1000);
  const sign = diff < 0 ? '-' : '+';
  const abs = Math.abs(diff);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `T${sign}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function PassGeometryWidget({
  visible,
  sidebarOpen,
  pass,
  satelliteName,
  nextPassAos,
  nextPassMaxEl,
  nextPassDuration,
}: PassGeometryWidgetProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Tick every second for the AOS countdown
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!visible) return null;


  return (
    <div
      className="flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-500 font-mono w-[270px]"
    >
      {/* ── Header ── */}
      <div className="p-2.5 border border-b-0 border-purple-400/25
                      bg-gradient-to-br from-purple-400/15 to-purple-400/3
                      backdrop-blur-md rounded-t-sm">
        <div className="flex items-center gap-2">
          {/* Purple pulse orb */}
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{
              background: '#a855f7',
              boxShadow: '0 0 6px #a855f7',
            }}
          />
          <span className="text-[10px] font-bold tracking-[.3em] text-purple-300/80 uppercase flex-1 truncate">
            {satelliteName ?? 'Pass_Geometry'}
          </span>

          {/* AOS countdown + TCA on one line */}
          {nextPassAos && (
            <span className="text-[9px] font-bold text-purple-300 tracking-[.05em] flex-shrink-0 whitespace-nowrap">
              AOS {formatCountdown(nextPassAos, now)}
              {nextPassMaxEl != null && (
                <span className="text-white/30 font-normal"> · TCA {nextPassMaxEl.toFixed(0)}°</span>
              )}
            </span>
          )}
        </div>
      </div>


      {/* ── Polar plot ── */}
      <div className="border border-t-0 border-b-0 border-purple-400/20
                      bg-black/50 backdrop-blur-md overflow-hidden">
        <PolarPlotWidget pass={pass} width={250} height={200} />
      </div>

      {/* ── Next Pass footer strip ── */}
      {nextPassAos && (
        <div className="border border-t-0 border-purple-400/20
                        bg-black/60 backdrop-blur-md rounded-b-sm
                        px-2.5 py-1.5 flex items-center gap-2">
          <span className="text-[8px] font-bold tracking-[.2em] text-[#a855f7]/60 uppercase flex-shrink-0">
            Next Pass
          </span>
          <div className="ml-auto flex items-center gap-3 text-[9px] text-white/50">
            <span>
              <span className="text-white/25 text-[8px] tracking-widest mr-1">AOS:</span>
              <span className="text-white/80">{formatCountdown(nextPassAos, now)}</span>
            </span>
            {nextPassMaxEl != null && (
              <span>
                <span className="text-white/25 text-[8px] tracking-widest mr-1">TCA:</span>
                <span className="text-[#a855f7]">{nextPassMaxEl.toFixed(0)}°</span>
              </span>
            )}
            {nextPassDuration != null && (
              <span>
                <span className="text-white/25 text-[8px] tracking-widest mr-1">DUR:</span>
                <span className="text-white/80">{Math.round(nextPassDuration / 60)}m</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
