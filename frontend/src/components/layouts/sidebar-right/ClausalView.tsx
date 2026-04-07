import { Activity, Crosshair, X } from "lucide-react";
import React from "react";
import { BaseViewProps } from "./types";

// ── Severity theme keyed on state-change reason ───────────────────────────────
function getAnomalyTheme(reason: string) {
  switch (reason) {
    case "EMERGENCY":
    case "SQUAWK_EMERGENCY":
      return {
        text: "text-red-500",
        border: "border-red-500/40",
        bg: "from-red-500/20 to-red-500/5",
        btn: "from-red-500/30 to-red-500/10",
        badge: "bg-red-500/20 text-red-400 border-red-500/40",
        label: "EMERGENCY",
      };
    case "TYPE_CHANGE":
      return {
        text: "text-red-400",
        border: "border-red-400/30",
        bg: "from-red-400/20 to-red-400/5",
        btn: "from-red-400/30 to-red-400/10",
        badge: "bg-red-400/10 text-red-400 border-red-400/30",
        label: "TYPE CHANGE",
      };
    case "ALTITUDE_CHANGE":
      return {
        text: "text-orange-400",
        border: "border-orange-400/30",
        bg: "from-orange-400/20 to-orange-400/5",
        btn: "from-orange-400/30 to-orange-400/10",
        badge: "bg-orange-400/10 text-orange-400 border-orange-400/30",
        label: "ALTITUDE CHANGE",
      };
    case "SPEED_TRANSITION":
      return {
        text: "text-amber-400",
        border: "border-amber-400/30",
        bg: "from-amber-400/20 to-amber-400/5",
        btn: "from-amber-400/30 to-amber-400/10",
        badge: "bg-amber-400/10 text-amber-400 border-amber-400/30",
        label: "SPEED TRANSITION",
      };
    case "LOITER_DETECTED":
      return {
        text: "text-yellow-400",
        border: "border-yellow-400/30",
        bg: "from-yellow-400/20 to-yellow-400/5",
        btn: "from-yellow-400/30 to-yellow-400/10",
        badge: "bg-yellow-400/10 text-yellow-400 border-yellow-400/30",
        label: "LOITER DETECTED",
      };
    case "ZONE_ENTRY":
    case "AIRSPACE_ENTRY":
      return {
        text: "text-cyan-400",
        border: "border-cyan-400/30",
        bg: "from-cyan-400/20 to-cyan-400/5",
        btn: "from-cyan-400/30 to-cyan-400/10",
        badge: "bg-cyan-400/10 text-cyan-400 border-cyan-400/30",
        label: reason.replace(/_/g, " "),
      };
    default:
      return {
        text: "text-indigo-400",
        border: "border-indigo-400/30",
        bg: "from-indigo-400/20 to-indigo-400/5",
        btn: "from-indigo-400/30 to-indigo-400/10",
        badge: "bg-indigo-400/10 text-indigo-400 border-indigo-400/30",
        label: reason.replace(/_/g, " ") || "STATE CHANGE",
      };
  }
}

export const ClausalView: React.FC<BaseViewProps> = ({
  entity,
  onClose,
  onCenterMap,
  onOpenAnalystPanel,
}) => {
  const detail = entity.detail as Record<string, unknown>;
  const reason = String(detail?.state_change_reason ?? "");
  const theme = getAnomalyTheme(reason);

  const confidence = detail?.confidence != null
    ? Math.round(Number(detail.confidence) * 100)
    : null;
  const eventTime = detail?.event_time
    ? new Date(String(detail.event_time))
    : null;
  const speedKts = detail?.speed_kts != null ? String(detail.speed_kts) : null;
  const altitudeFt = detail?.altitude_ft != null ? Number(detail.altitude_ft) : null;
  const courseDeg = detail?.course_deg != null ? Number(detail.course_deg) : null;
  const predicateType = String(detail?.predicate_type ?? "");
  const narrative = detail?.narrative ? String(detail.narrative) : null;

  return (
    <div className="pointer-events-auto flex flex-col h-auto max-h-[calc(100vh-8rem)] overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
      {/* Header */}
      <div
        className={`p-3 border border-b-0 ${theme.border} bg-gradient-to-br ${theme.bg} backdrop-blur-md rounded-t-sm`}
      >
        <div className="flex justify-between items-start">
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Activity size={14} className={theme.text} />
              <span className="text-[10px] font-bold tracking-[.3em] text-white/40">
                CLAUSAL_CHAIN_ANALYSIS
              </span>
            </div>
            <h2
              className={`text-mono-xl font-bold tracking-tighter ${theme.text} drop-shadow-[0_0_8px_currentColor] mb-2`}
            >
              {theme.label}
            </h2>
            <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
              <h3 className="text-mono-sm font-bold text-white/90">
                {entity.uid}
              </h3>
              <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                {predicateType && (
                  <div className="flex gap-2">
                    <span className="text-white/30 w-24">Predicate:</span>
                    <span className="text-white/70 truncate">{predicateType}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <span className="text-white/30 w-24">Position:</span>
                  <span className="text-white/80">
                    {entity.lat.toFixed(4)}, {entity.lon.toFixed(4)}
                  </span>
                </div>
              </div>
            </section>
            {/* Confidence bar */}
            {confidence != null && (
              <div className="flex items-center gap-2">
                <span className="text-[8px] text-white/30 w-16">CONFIDENCE</span>
                <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${theme.text} opacity-80`}
                    style={{
                      width: `${confidence}%`,
                      backgroundColor: "currentColor",
                    }}
                  />
                </div>
                <span className={`text-[9px] font-bold ${theme.text}`}>
                  {confidence}%
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close details"
            title="Close details"
            className="p-1.5 hover:bg-white/10 rounded-sm text-white/30 hover:text-white transition-all group shrink-0 focus-visible:ring-1 focus-visible:ring-hud-green outline-none ml-2"
          >
            <X
              size={14}
              className="group-hover:rotate-90 transition-transform duration-300"
            />
          </button>
        </div>
        {/* Action buttons */}
        <div className="flex gap-2 mt-2">
          <button
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onCenterMap?.();
            }}
            className={`flex-1 flex items-center justify-center gap-2 bg-gradient-to-b ${theme.btn} border ${theme.border} py-1.5 rounded text-[10px] font-bold tracking-widest ${theme.text} transition-all active:scale-[0.98]`}
          >
            <Crosshair size={12} />
            CENTER_VIEW
          </button>
          {onOpenAnalystPanel && (
            <button
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onOpenAnalystPanel();
              }}
              className={`flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/20 py-1.5 rounded text-[10px] font-bold tracking-widest text-white/70 transition-all active:scale-[0.98]`}
            >
              <Activity size={12} />
              ANALYSE
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div
        className={`border border-t-0 ${theme.border} bg-black/80 backdrop-blur-md rounded-b-sm overflow-y-auto flex-1 min-h-0`}
      >
        {/* Telemetry at event time */}
        <div className="p-3 border-b border-white/5">
          <span className="text-[8px] text-white/30 uppercase tracking-widest mb-2 block">
            Event Telemetry
          </span>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
            {eventTime && (
              <div className="col-span-2">
                <span className="text-[8px] text-white/40 block leading-tight">
                  EVENT TIME
                </span>
                <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
                  {eventTime.toLocaleString([], {
                    month: "short",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              </div>
            )}
            {speedKts != null && (
              <div>
                <span className="text-[8px] text-white/40 block leading-tight">
                  SPEED
                </span>
                <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
                  {speedKts} kts
                </span>
              </div>
            )}
            {altitudeFt != null && (
              <div>
                <span className="text-[8px] text-white/40 block leading-tight">
                  ALTITUDE
                </span>
                <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
                  {altitudeFt.toLocaleString()} ft
                </span>
              </div>
            )}
            {courseDeg != null && (
              <div>
                <span className="text-[8px] text-white/40 block leading-tight">
                  COURSE
                </span>
                <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
                  {courseDeg}°
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Narrative */}
        {narrative && (
          <div className="p-3 border-b border-white/5">
            <span className="text-[8px] text-white/30 uppercase tracking-widest mb-2 block">
              Chain Narrative
            </span>
            <p className="text-[10px] text-white/70 font-mono leading-relaxed">
              {narrative}
            </p>
          </div>
        )}

        {/* Event badge */}
        <div className="p-3">
          <span className="text-[8px] text-white/30 uppercase tracking-widest mb-2 block">
            Anomaly Classification
          </span>
          <span
            className={`inline-block text-[9px] font-bold font-mono px-2 py-1 rounded border ${theme.badge} uppercase tracking-wider`}
          >
            {reason || "UNKNOWN"}
          </span>
        </div>
      </div>
    </div>
  );
};
