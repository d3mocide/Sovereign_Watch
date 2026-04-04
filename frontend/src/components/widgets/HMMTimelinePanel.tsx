import { AlertTriangle, Brain } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchTrajectory, HMMResult } from "../../api/trajectory";

interface HMMTimelinePanelProps {
  uid: string;
  lookbackHours?: number;
}

// ── State metadata ────────────────────────────────────────────────────────────

const STATE_META: Record<
  string,
  { label: string; color: string; hex: string; threat: boolean }
> = {
  TRANSITING: {
    label: "TRANSITING",
    color: "text-blue-400",
    hex: "#38bdf8",
    threat: false,
  },
  LOITERING: {
    label: "LOITERING",
    color: "text-amber-400",
    hex: "#fbbf24",
    threat: true,
  },
  MANEUVERING: {
    label: "MANEUVERING",
    color: "text-orange-400",
    hex: "#fb923c",
    threat: true,
  },
  HOLDING_PATTERN: {
    label: "HOLD_PTRN",
    color: "text-yellow-400",
    hex: "#eab308",
    threat: false,
  },
  CONVERGING: {
    label: "CONVERGING",
    color: "text-red-400",
    hex: "#f87171",
    threat: true,
  },
};

const DEFAULT_META = {
  label: "UNKNOWN",
  color: "text-white/40",
  hex: "#ffffff40",
  threat: false,
};

function getMeta(state: string) {
  return STATE_META[state] ?? DEFAULT_META;
}

// ── State-sequence mini-bar (SVG) ─────────────────────────────────────────────

function StateBar({ sequence }: { sequence: string[] }) {
  if (sequence.length === 0) return null;

  // Collapse consecutive identical states into runs for readability
  const runs: { state: string; count: number }[] = [];
  for (const s of sequence) {
    if (runs.length > 0 && runs[runs.length - 1].state === s) {
      runs[runs.length - 1].count++;
    } else {
      runs.push({ state: s, count: 1 });
    }
  }

  const total = sequence.length;
  const W = 260;
  const H = 14;

  let x = 0;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      style={{ display: "block" }}
    >
      {runs.map((run, i) => {
        const w = (run.count / total) * W;
        const rect = (
          <rect
            key={i}
            x={x}
            y={0}
            width={Math.max(w - 1, 0)}
            height={H}
            fill={getMeta(run.state).hex}
            opacity={0.75}
          />
        );
        x += w;
        return rect;
      })}
    </svg>
  );
}

// ── Dominant-state badge ──────────────────────────────────────────────────────

export function HMMStateBadge({
  dominantState,
  anomalyScore,
}: {
  dominantState: string;
  anomalyScore: number;
}) {
  const meta = getMeta(dominantState);
  const pulse = anomalyScore > 0.3 && meta.threat;
  return (
    <span
      className={`text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wider border ${
        meta.threat
          ? "bg-red-500/20 text-red-400 border-red-500/30"
          : "bg-blue-500/20 text-blue-400 border-blue-500/30"
      } ${pulse ? "animate-pulse" : ""}`}
    >
      HMM:{meta.label}
    </span>
  );
}

// ── Full timeline panel ───────────────────────────────────────────────────────

export function HMMTimelinePanel({
  uid,
  lookbackHours = 24,
}: HMMTimelinePanelProps) {
  const [result, setResult] = useState<HMMResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);

    fetchTrajectory(uid, lookbackHours).then((data) => {
      if (cancelled) return;
      if (!data) {
        setError("NO_HMM_DATA");
      } else {
        setResult(data);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [uid, lookbackHours]);

  if (loading) {
    return (
      <div className="p-3 text-[10px] text-white/40 font-mono flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-amber-400/50 animate-pulse" />
        RUNNING_HMM_DECODE…
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="p-3 text-[10px] text-white/30 font-mono">
        {error === "FETCH_FAILED"
          ? "ERR: HMM_UNAVAILABLE"
          : "NO_TRAJECTORY_DATA"}
      </div>
    );
  }

  const meta = getMeta(result.dominant_state);
  const anomalyHigh = result.anomaly_score > 0.3;

  return (
    <div className="space-y-2 pb-1">
      {/* Header */}
      <div className="px-3 pt-2 flex items-center gap-2">
        <Brain size={10} className="text-amber-400 shrink-0" />
        <h3 className="text-[10px] text-white/50 font-bold">
          HMM_Trajectory_Analysis
        </h3>
        <span className="text-[8px] text-white/20 ml-auto tabular-nums">
          {result.track_point_count}pts
        </span>
      </div>

      {/* Anomaly alert */}
      {anomalyHigh && (
        <div className="mx-3 px-2 py-1.5 rounded bg-red-500/10 border border-red-500/25 flex items-start gap-2">
          <AlertTriangle
            size={10}
            className="text-red-400 shrink-0 mt-0.5 animate-pulse"
          />
          <span className="text-[9px] text-red-300/70 font-mono leading-relaxed">
            ANOMALOUS_BEHAVIOR — {Math.round(result.anomaly_score * 100)}% of
            track in threat states
          </span>
        </div>
      )}

      {/* State-sequence bar */}
      {result.state_sequence.length > 0 && (
        <div className="mx-3 rounded border border-white/10 bg-black/40 overflow-hidden">
          <div className="px-2 pt-1.5 pb-1 flex justify-between text-[8px] text-white/30 font-mono">
            <span>STATE_SEQUENCE ({lookbackHours}H)</span>
            <span className="tabular-nums">
              {result.state_sequence.length} steps
            </span>
          </div>
          <div className="px-2 pb-2">
            <StateBar sequence={result.state_sequence} />
          </div>
          {/* Legend row */}
          <div className="px-2 pb-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {Object.entries(STATE_META).map(([key, m]) => (
              <div key={key} className="flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-sm inline-block"
                  style={{ backgroundColor: m.hex, opacity: 0.75 }}
                />
                <span className="text-[7px] text-white/30 font-mono">
                  {m.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metrics */}
      <div className="px-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] font-mono">
          <div className="flex justify-between border-b border-white/5 pb-1">
            <span className="text-white/30">DOMINANT:</span>
            <span className={`${meta.color} tabular-nums font-bold`}>
              {meta.label}
            </span>
          </div>
          <div className="flex justify-between border-b border-white/5 pb-1">
            <span className="text-white/30">CONFIDENCE:</span>
            <span className="text-white/60 tabular-nums">
              {Math.round(result.confidence * 100)}%
            </span>
          </div>
          <div className="flex justify-between border-b border-white/5 pb-1 col-span-2">
            <span className="text-white/30">ANOMALY_SCORE:</span>
            <span
              className={`${anomalyHigh ? "text-red-400" : "text-white/40"} tabular-nums`}
            >
              {result.anomaly_score.toFixed(3)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
