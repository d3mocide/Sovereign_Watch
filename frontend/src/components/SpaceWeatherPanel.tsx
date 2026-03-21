/**
 * SpaceWeatherPanel — Space weather sidebar for the Orbital Dashboard.
 *
 * Shows:
 *   1. Current Kp gauge (radial arc, 0–9)
 *   2. Storm level badge (G0–G5)
 *   3. GPS degradation risk badge
 *   4. 24-hour Kp sparkline (SVG bar chart)
 *   5. Aurora active indicator
 *   6. GPS satellite impact warning when Kp ≥ 5
 *
 * Polls /api/space-weather/kp every 5 minutes.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { KpHistoryPoint, SpaceWeatherStatus } from "../types";

const POLL_INTERVAL_MS = 5 * 60 * 1000;

const STORM_COLORS: Record<string, string> = {
  quiet:      "#22c55e",
  unsettled:  "#84cc16",
  active:     "#14b8a6",
  G1:         "#f59e0b",
  G2:         "#f97316",
  G3:         "#ef4444",
  G4:         "#dc2626",
  G5:         "#991b1b",
  unknown:    "#6b7280",
};

const RISK_COLORS: Record<string, string> = {
  low:      "#22c55e",
  moderate: "#f59e0b",
  high:     "#ef4444",
  unknown:  "#6b7280",
};

function stormColor(level: string): string {
  return STORM_COLORS[level] ?? "#6b7280";
}

/** Minimal SVG sparkline for Kp history */
function KpSparkline({ history }: { history: KpHistoryPoint[] }) {
  if (!history.length) {
    return (
      <div style={{ color: "#6b7280", fontSize: 11, textAlign: "center", padding: "12px 0" }}>
        No Kp history
      </div>
    );
  }

  const W = 260;
  const H = 48;
  const maxKp = 9;
  // Show last 144 points (24h at 10-minute buckets, or up to 144 1-min samples downsampled)
  const slice = history.slice(-144);
  const barW = W / slice.length;

  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      {/* Storm level reference lines */}
      {[5, 7].map((kp) => {
        const y = H - (kp / maxKp) * H;
        return (
          <line
            key={kp}
            x1={0} y1={y} x2={W} y2={y}
            stroke={kp >= 7 ? "#ef444440" : "#f59e0b40"}
            strokeWidth={1}
            strokeDasharray="3,3"
          />
        );
      })}

      {/* Bars */}
      {slice.map((pt, i) => {
        const barH = Math.max(1, (pt.kp / maxKp) * H);
        const y = H - barH;
        const color = stormColor(pt.storm_level);
        return (
          <rect
            key={i}
            x={i * barW}
            y={y}
            width={Math.max(barW - 0.5, 0.5)}
            height={barH}
            fill={color}
            opacity={0.75}
          />
        );
      })}

      {/* Axis labels */}
      <text x={0} y={H + 10} fill="#6b7280" fontSize={9}>-24h</text>
      <text x={W} y={H + 10} fill="#6b7280" fontSize={9} textAnchor="end">now</text>
    </svg>
  );
}

/** Radial Kp arc gauge */
function KpGauge({ kp }: { kp: number | null }) {
  const R = 36;
  const CX = 48;
  const CY = 48;
  const strokeW = 7;
  const circumference = Math.PI * R; // half circle arc length
  const fraction = kp !== null ? Math.min(kp / 9, 1) : 0;
  const color = kp !== null ? stormColor(
    kp >= 7 ? "G3" : kp >= 5 ? "G1" : kp >= 4 ? "active" : kp >= 3 ? "unsettled" : "quiet"
  ) : "#374151";

  // SVG arc: start at left (180°), sweep clockwise to right (0°) = half circle top
  const startX = CX - R;
  const startY = CY;
  const endX = CX + R;
  const endY = CY;

  // Compute arc end for the filled portion
  const angle = Math.PI * fraction; // 0 → π
  const arcX = CX - R * Math.cos(angle);
  const arcY = CY - R * Math.sin(angle);
  const largeArc = angle > Math.PI / 2 ? 1 : 0;

  return (
    <svg width={96} height={54} style={{ overflow: "visible" }}>
      {/* Background track */}
      <path
        d={`M ${startX} ${startY} A ${R} ${R} 0 0 1 ${endX} ${endY}`}
        fill="none"
        stroke="#1f2937"
        strokeWidth={strokeW}
        strokeLinecap="round"
      />
      {/* Filled arc */}
      {kp !== null && kp > 0 && (
        <path
          d={`M ${startX} ${startY} A ${R} ${R} 0 ${largeArc} 1 ${arcX} ${arcY}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeW}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
      )}
      {/* Value label */}
      <text
        x={CX}
        y={CY - 4}
        textAnchor="middle"
        fill={color}
        fontSize={20}
        fontWeight={700}
        fontFamily="monospace"
      >
        {kp !== null ? kp.toFixed(1) : "--"}
      </text>
      <text x={CX} y={CY + 10} textAnchor="middle" fill="#9ca3af" fontSize={9} fontFamily="monospace">
        Kp INDEX
      </text>
      {/* Scale ticks */}
      <text x={startX - 4} y={CY + 4} fill="#6b7280" fontSize={8} textAnchor="end">0</text>
      <text x={endX + 4} y={CY + 4} fill="#6b7280" fontSize={8}>9</text>
    </svg>
  );
}

interface Props {
  visible?: boolean;
}

export function SpaceWeatherPanel({ visible = true }: Props) {
  const [status, setStatus] = useState<SpaceWeatherStatus | null>(null);
  const [history, setHistory] = useState<KpHistoryPoint[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const resp = await fetch("/api/space-weather/kp");
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.current) {
        setStatus({
          kp: data.current.kp ?? null,
          kp_fraction: data.current.kp_fraction ?? null,
          storm_level: data.current.storm_level ?? "unknown",
          aurora_active: false,
          gps_degradation_risk: "unknown",
          time: data.current.time ?? null,
        });
      }
      if (data.history) {
        setHistory(data.history as KpHistoryPoint[]);
      }
    } catch {
      // Silently fail — panel stays in last-known-good state
    }

    // Fetch GPS risk from status endpoint
    try {
      const sr = await fetch("/api/space-weather/status");
      if (sr.ok) {
        const sd = await sr.json();
        setStatus((prev) =>
          prev
            ? {
                ...prev,
                aurora_active: sd.aurora_active ?? false,
                gps_degradation_risk: sd.gps_degradation_risk ?? "unknown",
              }
            : prev
        );
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible, fetchData]);

  if (!visible) return null;

  const kp = status?.kp ?? null;
  const stormLevel = status?.storm_level ?? "unknown";
  const risk = status?.gps_degradation_risk ?? "unknown";
  const aurora = status?.aurora_active ?? false;
  const highKp = kp !== null && kp >= 5;

  return (
    <div
      style={{
        background: "rgba(10,14,20,0.92)",
        border: "1px solid #1f2937",
        borderRadius: 8,
        padding: "12px 14px",
        width: 280,
        fontFamily: "monospace",
        color: "#e5e7eb",
        fontSize: 11,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ color: "#f59e0b", fontSize: 13 }}>☀</span>
        <span style={{ fontWeight: 700, letterSpacing: "0.08em", fontSize: 12, color: "#f3f4f6" }}>
          SPACE WEATHER
        </span>
        <span style={{ marginLeft: "auto", color: "#6b7280", fontSize: 9 }}>
          NOAA SWPC
        </span>
      </div>

      {/* Gauge + badges row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
        <KpGauge kp={kp} />

        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 4 }}>
          {/* Storm level badge */}
          <div
            style={{
              background: `${stormColor(stormLevel)}22`,
              border: `1px solid ${stormColor(stormLevel)}88`,
              borderRadius: 4,
              padding: "3px 8px",
              color: stormColor(stormLevel),
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: "0.06em",
            }}
          >
            {stormLevel.toUpperCase()}
          </div>

          {/* GPS risk badge */}
          <div style={{ fontSize: 10, color: "#9ca3af" }}>
            GPS RISK:{" "}
            <span style={{ color: RISK_COLORS[risk] ?? "#6b7280", fontWeight: 700 }}>
              {risk.toUpperCase()}
            </span>
          </div>

          {/* Aurora indicator */}
          <div style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: aurora ? "#34d399" : "#374151",
                display: "inline-block",
                boxShadow: aurora ? "0 0 4px #34d399" : "none",
              }}
            />
            <span style={{ color: aurora ? "#34d399" : "#6b7280" }}>
              AURORA {aurora ? "ACTIVE" : "QUIET"}
            </span>
          </div>
        </div>
      </div>

      {/* GPS degradation warning */}
      {highKp && (
        <div
          style={{
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.4)",
            borderRadius: 4,
            padding: "5px 8px",
            marginBottom: 10,
            fontSize: 10,
            color: "#fca5a5",
            lineHeight: 1.5,
          }}
        >
          ⚠ Kp ≥ 5 — GPS positioning accuracy may be degraded at high latitudes.
          NIC/NACp degradation on ADS-B tracks may reflect solar activity rather than jamming.
        </div>
      )}

      {/* 24h Sparkline */}
      <div style={{ marginBottom: 4, fontSize: 10, color: "#6b7280", letterSpacing: "0.06em" }}>
        24-HOUR Kp HISTORY
      </div>
      <KpSparkline history={history} />

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginTop: 12,
          fontSize: 9,
          color: "#6b7280",
          flexWrap: "wrap",
        }}
      >
        {[
          { label: "G1", color: "#f59e0b" },
          { label: "G2", color: "#f97316" },
          { label: "G3+", color: "#ef4444" },
        ].map(({ label, color }) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span
              style={{
                width: 8,
                height: 8,
                background: color,
                borderRadius: 1,
                display: "inline-block",
              }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
