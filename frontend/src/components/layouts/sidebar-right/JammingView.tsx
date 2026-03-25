import { AlertTriangle, Crosshair, Radar } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { AnalysisWidget } from "../../widgets/AnalysisWidget";
import { TimeTracked } from "../TimeTracked";
import { BaseViewProps } from "./types";

type JammingHistoryPoint = {
  time: string;
  confidence: number;
  assessment: string;
  h3_index: string;
};

function ConfidenceSparkline({ points }: { points: JammingHistoryPoint[] }) {
  if (!points.length) {
    return (
      <div className="text-[9px] text-white/25 italic py-2 text-center">
        No trend history in lookback window
      </div>
    );
  }

  const width = 240;
  const height = 50;
  const padX = 4;
  const padY = 4;
  const step = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;
  const yFor = (value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    return height - padY - clamped * (height - padY * 2);
  };

  const line = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${(padX + i * step).toFixed(1)},${yFor(p.confidence).toFixed(1)}`,
    )
    .join(" ");

  const area = `${line} L${(padX + (points.length - 1) * step).toFixed(1)},${height - padY} L${padX},${height - padY} Z`;

  return (
    <svg
      width={width}
      height={height + 14}
      style={{ display: "block", overflow: "visible" }}
    >
      <line
        x1={0}
        y1={height - padY}
        x2={width}
        y2={height - padY}
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={1}
      />
      <line
        x1={0}
        y1={yFor(0.7)}
        x2={width}
        y2={yFor(0.7)}
        stroke="rgba(248,113,113,0.25)"
        strokeWidth={1}
        strokeDasharray="3,3"
      />
      <path d={area} fill="url(#jammingConfidenceFill)" />
      <path
        d={line}
        fill="none"
        stroke="#f87171"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle
          key={`${p.time}-${i}`}
          cx={padX + i * step}
          cy={yFor(p.confidence)}
          r={1.8}
          fill="#fca5a5"
        />
      ))}
      <defs>
        <linearGradient id="jammingConfidenceFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(248,113,113,0.35)" />
          <stop offset="100%" stopColor="rgba(248,113,113,0.03)" />
        </linearGradient>
      </defs>
      <text x={0} y={height + 10} fill="rgba(255,255,255,0.25)" fontSize={8}>
        -24h
      </text>
      <text
        x={width}
        y={height + 10}
        fill="rgba(255,255,255,0.25)"
        fontSize={8}
        textAnchor="end"
      >
        now
      </text>
    </svg>
  );
}

const assessmentMeta: Record<
  string,
  { text: string; border: string; bg: string; glow: string; summary: string }
> = {
  jamming: {
    text: "text-red-400",
    border: "border-red-400/30",
    bg: "from-red-400/20 to-red-400/5",
    glow: "text-red-300 drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]",
    summary: "Pattern suggests intentional or coordinated GNSS interference.",
  },
  mixed: {
    text: "text-amber-400",
    border: "border-amber-400/30",
    bg: "from-amber-400/20 to-amber-400/5",
    glow: "text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]",
    summary:
      "Telemetry indicates blended causes (space weather + local interference).",
  },
  space_weather: {
    text: "text-purple-400",
    border: "border-purple-400/30",
    bg: "from-purple-400/20 to-purple-400/5",
    glow: "text-purple-300 drop-shadow-[0_0_8px_rgba(192,132,252,0.8)]",
    summary:
      "Likely ionospheric degradation tied to elevated geomagnetic activity.",
  },
  equipment: {
    text: "text-slate-300",
    border: "border-slate-300/30",
    bg: "from-slate-300/20 to-slate-300/5",
    glow: "text-slate-200 drop-shadow-[0_0_8px_rgba(203,213,225,0.5)]",
    summary:
      "Likely localized receiver/transmitter fault rather than area-wide jamming.",
  },
};

export const JammingView: React.FC<BaseViewProps> = ({
  entity,
  onClose,
  onCenterMap,
  onOpenAnalystPanel,
}) => {
  const detail = (entity.detail || {}) as Record<string, unknown>;
  const assessment = String(detail.assessment || "mixed");
  const meta = assessmentMeta[assessment] || assessmentMeta.mixed;
  const confidencePct = Math.round(Number(detail.confidence || 0) * 100);
  const h3Index = String(detail.h3_index || "");
  const [history, setHistory] = useState<JammingHistoryPoint[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      if (!h3Index) {
        setHistory([]);
        return;
      }
      try {
        const r = await fetch("/api/jamming/history?hours=24");
        if (!r.ok) return;
        const data = await r.json();
        const features = (data?.features ?? []) as Array<{
          properties?: Record<string, unknown>;
        }>;

        const filtered = features
          .map((f) => f.properties || {})
          .filter((p) => String(p.h3_index || "") === h3Index)
          .map((p) => ({
            time: String(p.time || ""),
            confidence: Number(p.confidence || 0),
            assessment: String(p.assessment || "mixed"),
            h3_index: String(p.h3_index || ""),
          }))
          .sort((a, b) => a.time.localeCompare(b.time))
          .slice(-24);

        if (!cancelled) setHistory(filtered);
      } catch {
        if (!cancelled) setHistory([]);
      }
    };

    loadHistory();
    const timer = window.setInterval(loadHistory, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [h3Index]);

  const trendDelta = useMemo(() => {
    if (history.length < 2) return null;
    const start = history[0].confidence;
    const end = history[history.length - 1].confidence;
    return Math.round((end - start) * 100);
  }, [history]);

  return (
    <div className="pointer-events-auto flex flex-col h-auto max-h-full overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
      <div
        className={`p-3 border border-b-0 ${meta.border} bg-gradient-to-br ${meta.bg} backdrop-blur-md rounded-t-sm`}
      >
        <div className="flex justify-between items-start">
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Radar size={14} className={meta.text} />
              <span className="text-[10px] font-bold tracking-[.3em] text-white/40">
                GPS_SIGINT_ZONE
              </span>
            </div>
            <h2
              className={`text-mono-xl font-bold tracking-tighter ${meta.glow} mb-2 truncate`}
              title={entity.callsign}
            >
              {entity.callsign}
            </h2>
            <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
              <h3 className="text-mono-sm font-bold text-white/90 uppercase">
                {assessment.replaceAll("_", " ")}
              </h3>
              <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                <div className="flex gap-2">
                  <span className="text-white/30 w-20">Confidence:</span>
                  <span className={meta.text}>{confidencePct}%</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-white/30 w-20">Affected:</span>
                  <span className="text-white/80">
                    {String(detail.affected_count ?? 0)} tracks
                  </span>
                </div>
              </div>
            </section>
          </div>
          <button
            onClick={onClose}
            aria-label="Close details"
            title="Close details"
            className="p-1 text-white/30 hover:text-white transition-colors shrink-0 focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
          >
            x
          </button>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onCenterMap?.();
            }}
            className={`flex-1 flex items-center justify-center gap-2 bg-gradient-to-b ${meta.bg} border ${meta.border} py-1.5 rounded text-[10px] font-bold tracking-widest ${meta.text} transition-all active:scale-[0.98]`}
          >
            <Crosshair size={12} />
            CENTER_VIEW
          </button>
        </div>
      </div>

      <div className="overflow-y-auto min-h-0 shrink border-x border-tactical-border bg-black/30 backdrop-blur-md p-3 space-y-3 scrollbar-none font-mono">
        <section className="space-y-2">
          <h3
            className={`text-[10px] ${meta.text} font-bold uppercase tracking-wider`}
          >
            Signal_Integrity_Analysis
          </h3>
          <div className="space-y-1 text-mono-xs font-medium">
            <div className="grid grid-cols-[120px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">ASSESSMENT:</span>
              <span className={`${meta.text} uppercase`}>
                {assessment.replaceAll("_", " ")}
              </span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">CONFIDENCE:</span>
              <span className="text-white tabular-nums">{confidencePct}%</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">AFFECTED COUNT:</span>
              <span className="text-white tabular-nums">
                {String(detail.affected_count ?? 0)}
              </span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">AVG NIC:</span>
              <span className="text-white tabular-nums">
                {String(detail.avg_nic ?? "-")}
              </span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">AVG NACp:</span>
              <span className="text-white tabular-nums">
                {String(detail.avg_nacp ?? "-")}
              </span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">Kp AT EVENT:</span>
              <span className="text-white tabular-nums">
                {String(detail.kp_at_event ?? "unknown")}
              </span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">H3 CELL:</span>
              <span
                className="text-white/70 truncate"
                title={String(detail.h3_index ?? "unknown")}
              >
                {String(detail.h3_index ?? "unknown")}
              </span>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3
              className={`text-[10px] ${meta.text} font-bold uppercase tracking-wider`}
            >
              Confidence_Trend
            </h3>
            <span className="text-[9px] text-white/35">
              {trendDelta === null
                ? "stable"
                : trendDelta >= 0
                  ? `+${trendDelta}%`
                  : `${trendDelta}%`}
            </span>
          </div>
          <ConfidenceSparkline points={history} />
        </section>

        <section className="space-y-1">
          <h3 className="text-[10px] text-white/50 font-bold opacity-40">
            Assessment_Summary
          </h3>
          <p className="text-[10px] text-white/40 leading-relaxed font-mono italic flex items-start gap-2">
            <AlertTriangle size={10} className={meta.text} />
            <span>{meta.summary}</span>
          </p>
        </section>
      </div>

      <div className="p-3 border border-t-0 border-tactical-border bg-black/40 backdrop-blur-md rounded-b-sm flex flex-col gap-2">
        <div className="flex gap-2 w-full">
          <AnalysisWidget
            accentColor={meta.text}
            onOpenPanel={onOpenAnalystPanel}
          />
        </div>
        <div className="flex items-center justify-between text-[8px] font-mono text-white/30 pt-1 border-t border-white/5">
          <span>
            SRC: <span className="text-amber-400/70">JAMMING_ANALYZER</span>
          </span>
          <span>
            <TimeTracked lastSeen={entity.lastSeen} />
          </span>
        </div>
      </div>
    </div>
  );
};
