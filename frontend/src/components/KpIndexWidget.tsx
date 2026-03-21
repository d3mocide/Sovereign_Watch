/**
 * KpIndexWidget — compact HUD badge showing the current NOAA Kp-index.
 *
 * Renders in a map corner as a small pill badge:
 *   Kp 3.3 | UNSETTLED
 *
 * Color-coded:
 *   Kp 0–3  → green   (quiet)
 *   Kp 4    → teal    (active)
 *   Kp 5–6  → amber   (G1–G2 storm)
 *   Kp 7+   → red     (G3+ storm)
 *
 * Polls /api/space-weather/status every 5 minutes.
 */

import React, { useEffect, useRef, useState } from "react";
import { SpaceWeatherStatus } from "../types";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min

function kpColor(kp: number | null): string {
  if (kp === null) return "#6b7280"; // gray-500
  if (kp >= 7)  return "#ef4444"; // red-500
  if (kp >= 5)  return "#f59e0b"; // amber-500
  if (kp >= 4)  return "#14b8a6"; // teal-500
  return "#22c55e";               // green-500
}

function kpBg(kp: number | null): string {
  if (kp === null) return "rgba(40,40,40,0.85)";
  if (kp >= 7)  return "rgba(127,29,29,0.88)";
  if (kp >= 5)  return "rgba(92,45,5,0.88)";
  if (kp >= 4)  return "rgba(19,78,74,0.88)";
  return "rgba(20,83,45,0.88)";
}

interface Props {
  /** If false, widget is hidden */
  visible?: boolean;
}

export function KpIndexWidget({ visible = true }: Props) {
  const [status, setStatus] = useState<SpaceWeatherStatus | null>(null);
  const [error, setError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = async () => {
    try {
      const resp = await fetch("/api/space-weather/status");
      if (!resp.ok) throw new Error("not ok");
      const data: SpaceWeatherStatus = await resp.json();
      setStatus(data);
      setError(false);
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    fetchStatus();
    timerRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (!visible) return null;

  const kp = status?.kp ?? null;
  const level = status?.storm_level ?? (error ? "error" : "…");
  const risk = status?.gps_degradation_risk ?? "unknown";
  const aurora = status?.aurora_active ?? false;

  const color = kpColor(kp);
  const bg = kpBg(kp);

  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${color}55`,
        borderRadius: 6,
        padding: "5px 10px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontFamily: "monospace",
        fontSize: 11,
        letterSpacing: "0.06em",
        userSelect: "none",
        cursor: "default",
        minWidth: 130,
      }}
      title={`GPS degradation risk: ${risk.toUpperCase()}${aurora ? " | Aurora active" : ""}`}
    >
      {/* Kp indicator dot */}
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
          boxShadow: `0 0 6px ${color}`,
        }}
      />

      {/* Main label */}
      <span style={{ color: "#e5e7eb" }}>
        Kp{" "}
        <span style={{ color, fontWeight: 700 }}>
          {kp !== null ? kp.toFixed(1) : "--"}
        </span>
        {"  "}
        <span style={{ color: "#9ca3af", fontSize: 10 }}>
          {level.toUpperCase()}
        </span>
      </span>

      {/* Aurora indicator */}
      {aurora && (
        <span
          style={{
            color: "#34d399",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.04em",
          }}
          title="Aurora active"
        >
          ◈
        </span>
      )}
    </div>
  );
}
