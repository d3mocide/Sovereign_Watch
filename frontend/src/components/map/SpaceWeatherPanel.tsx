/**
 * SpaceWeatherPanel — Space weather HUD for the Orbital Dashboard.
 *
 * Sovereign Glass design: matches the SidebarRight glass aesthetic.
 * Polls /api/space-weather/kp every 5 minutes.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { KpHistoryPoint, SpaceWeatherStatus } from "../../types";

const POLL_INTERVAL_MS = 5 * 60 * 1000;

// ── Colour maps ─────────────────────────────────────────────────────────────

const STORM_HEX: Record<string, string> = {
  quiet:     "#22c55e",
  unsettled: "#84cc16",
  active:    "#14b8a6",
  G1:        "#f59e0b",
  G2:        "#f97316",
  G3:        "#ef4444",
  G4:        "#dc2626",
  G5:        "#991b1b",
  unknown:   "#4b5563",
};

const RISK_HEX: Record<string, string> = {
  low:     "#22c55e",
  moderate:"#f59e0b",
  high:    "#ef4444",
  unknown: "#4b5563",
};

function stormHex(level: string): string { return STORM_HEX[level] ?? "#4b5563"; }
function riskHex(level: string):  string { return RISK_HEX[level]  ?? "#4b5563"; }

// ── Sub-components ───────────────────────────────────────────────────────────

function KpGauge({ kp }: { kp: number | null }) {
  const R = 34;
  const CX = 44;
  const CY = 44;
  const SW = 6;
  const fraction = kp !== null ? Math.min(kp / 9, 1) : 0;
  const level = kp === null ? "unknown" : kp >= 7 ? "G3" : kp >= 5 ? "G1" : kp >= 4 ? "active" : kp >= 3 ? "unsettled" : "quiet";
  const color = stormHex(level);
  const angle = Math.PI * fraction;
  const arcX = CX - R * Math.cos(angle);
  const arcY = CY - R * Math.sin(angle);

  return (
    <svg width={88} height={50} style={{ overflow: "visible" }}>
      {/* Track */}
      <path d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
        fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={SW} strokeLinecap="round" />
      {/* Arc */}
      {kp !== null && kp > 0 && (
        <path d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${arcX} ${arcY}`}
          fill="none" stroke={color} strokeWidth={SW} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 5px ${color}99)` }} />
      )}
      {/* Value */}
      <text x={CX} y={CY - 3} textAnchor="middle" fill={color}
        fontSize={18} fontWeight={700} fontFamily="monospace">
        {kp !== null ? kp.toFixed(1) : "--"}
      </text>
      <text x={CX} y={CY + 10} textAnchor="middle" fill="rgba(255,255,255,0.3)"
        fontSize={8} fontFamily="monospace" letterSpacing="0.12em">
        Kp INDEX
      </text>
      <text x={CX - R - 4} y={CY + 5} fill="rgba(255,255,255,0.2)" fontSize={7} textAnchor="end">0</text>
      <text x={CX + R + 4} y={CY + 5} fill="rgba(255,255,255,0.2)" fontSize={7}>9</text>
    </svg>
  );
}

function KpSparkline({ history }: { history: KpHistoryPoint[] }) {
  if (!history.length) {
    return (
      <div className="text-center text-white/20 text-[9px] py-3 italic">No Kp history</div>
    );
  }
  const W = 238;
  const H = 44;
  const slice = history.slice(-144);
  const barW = W / slice.length;
  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      {[5, 7].map(kp => {
        const y = H - (kp / 9) * H;
        return (
          <line key={kp} x1={0} y1={y} x2={W} y2={y}
            stroke={kp >= 7 ? "#ef444440" : "#f59e0b40"}
            strokeWidth={1} strokeDasharray="3,3" />
        );
      })}
      {slice.map((pt, i) => {
        const barH = Math.max(1, (pt.kp / 9) * H);
        return (
          <rect key={i} x={i * barW} y={H - barH}
            width={Math.max(barW - 0.5, 0.5)} height={barH}
            fill={stormHex(pt.storm_level)} opacity={0.72} />
        );
      })}
      <text x={0}   y={H + 10} fill="rgba(255,255,255,0.2)" fontSize={8}>-24h</text>
      <text x={W}   y={H + 10} fill="rgba(255,255,255,0.2)" fontSize={8} textAnchor="end">now</text>
    </svg>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface Props { visible?: boolean; }

export function SpaceWeatherPanel({ visible = true }: Props) {
  const [status, setStatus] = useState<SpaceWeatherStatus | null>(null);
  const [history, setHistory] = useState<KpHistoryPoint[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch("/api/space-weather/kp");
      if (r.ok) {
        const d = await r.json();
        if (d.current) {
          setStatus({
            kp: d.current.kp ?? null,
            kp_fraction: d.current.kp_fraction ?? null,
            storm_level: d.current.storm_level ?? "unknown",
            aurora_active: false,
            gps_degradation_risk: "unknown",
            time: d.current.time ?? null,
          });
        }
        if (d.history) setHistory(d.history as KpHistoryPoint[]);
      }
    } catch { /* silent */ }

    try {
      const sr = await fetch("/api/space-weather/status");
      if (sr.ok) {
        const sd = await sr.json();
        setStatus(prev => prev ? {
          ...prev,
          aurora_active: sd.aurora_active ?? false,
          gps_degradation_risk: sd.gps_degradation_risk ?? "unknown",
        } : prev);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(fetchData, 50);
    timerRef.current = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => { clearTimeout(t); if (timerRef.current) clearInterval(timerRef.current); };
  }, [visible, fetchData]);

  if (!visible) return null;

  const kp         = status?.kp ?? null;
  const stormLevel = status?.storm_level ?? "unknown";
  const risk       = status?.gps_degradation_risk ?? "unknown";
  const aurora     = status?.aurora_active ?? false;
  const highKp     = kp !== null && kp >= 5;
  const sColor     = stormHex(stormLevel);

  return (
    /* Outer glass card */
    <div className="pointer-events-auto flex flex-col overflow-hidden
                    animate-in slide-in-from-top duration-500 font-mono"
         style={{ width: 270 }}>

      {/* ── Header ── */}
      <div className="p-3 border border-b-0 border-[#a855f7]/25
                      bg-gradient-to-br from-[#a855f7]/10 to-[#a855f7]/3
                      backdrop-blur-md rounded-t-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[13px]" style={{ color: '#a855f7' }}>☀</span>
            <span className="text-[10px] font-bold tracking-[.3em] text-white/50 uppercase">
              Space_Weather
            </span>
          </div>
          <span className="text-[8px] text-white/25 tracking-widest">NOAA SWPC</span>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="border border-t-0 border-[#a855f7]/20
                      bg-black/40 backdrop-blur-md p-3 rounded-b-sm space-y-3">

        {/* Gauge + badges */}
        <div className="flex items-start gap-3">
          <KpGauge kp={kp} />

          <div className="flex flex-col gap-2 pt-1 flex-1">
            {/* Storm badge */}
            <div className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold tracking-widest"
                 style={{
                   background: `${sColor}18`,
                   border: `1px solid ${sColor}50`,
                   color: sColor,
                 }}>
              {stormLevel.toUpperCase()}
            </div>

            {/* GPS risk */}
            <div className="text-[9px] text-white/30 tracking-widest">
              GPS_RISK:{" "}
              <span className="font-bold" style={{ color: riskHex(risk) }}>
                {risk.toUpperCase()}
              </span>
            </div>

            {/* Aurora dot */}
            <div className="flex items-center gap-1.5 text-[9px] tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full inline-block"
                    style={{
                      background: aurora ? "#34d399" : "rgba(255,255,255,0.1)",
                      boxShadow:  aurora ? "0 0 5px #34d399" : "none",
                    }} />
              <span style={{ color: aurora ? "#34d399" : "rgba(255,255,255,0.25)" }}>
                AURORA {aurora ? "ACTIVE" : "QUIET"}
              </span>
            </div>
          </div>
        </div>

        {/* Kp ≥ 5 warning */}
        {highKp && (
          <div className="bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5
                          text-[9px] text-red-300/80 leading-relaxed">
            ⚠ Kp≥5 — GPS accuracy may be degraded at high latitudes.
            NICp/NACp drops may reflect solar activity, not jamming.
          </div>
        )}

        {/* 24h sparkline */}
        <div>
          <div className="text-[8px] text-white/25 tracking-[.2em] mb-2 uppercase">
            24-Hour Kp History
          </div>
          <KpSparkline history={history} />

          {/* Legend */}
          <div className="flex gap-3 mt-2">
            {[
              { label: "G1", color: "#f59e0b" },
              { label: "G2", color: "#f97316" },
              { label: "G3+", color: "#ef4444" },
            ].map(({ label, color }) => (
              <span key={label} className="flex items-center gap-1 text-[8px] text-white/30">
                <span className="w-2 h-2 rounded-sm inline-block" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
