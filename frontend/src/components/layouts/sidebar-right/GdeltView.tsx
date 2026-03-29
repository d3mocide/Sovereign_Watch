import { Crosshair, ExternalLink, Newspaper, X } from "lucide-react";
import React from "react";
import { AnalysisWidget } from "../../widgets/AnalysisWidget";
import { TimeTracked } from "../TimeTracked";
import { BaseViewProps } from "./types";

function getGdeltTheme(v: number) {
  if (v <= -5)
    return {
      status: "CRITICAL",
      base: "red-500",
      text: "text-red-400",
      border: "border-red-400/30",
      bg: "from-red-400/20 to-red-400/5",
      btn: "from-red-400/30 to-red-400/10",
    };
  if (v <= -2)
    return {
      status: "CONFLICT",
      base: "orange-500",
      text: "text-orange-400",
      border: "border-orange-400/30",
      bg: "from-orange-400/20 to-orange-400/5",
      btn: "from-orange-400/30 to-orange-400/10",
    };
  if (v < 0)
    return {
      status: "NEGATIVE",
      base: "yellow-400",
      text: "text-yellow-400",
      border: "border-yellow-400/30",
      bg: "from-yellow-400/20 to-yellow-400/5",
      btn: "from-yellow-400/30 to-yellow-400/10",
    };
  if (v < 2)
    return {
      status: "NEUTRAL",
      base: "lime-400",
      text: "text-lime-400",
      border: "border-lime-400/30",
      bg: "from-lime-400/20 to-lime-400/5",
      btn: "from-lime-400/30 to-lime-400/10",
    };
  return {
    status: "COOPERATIVE",
    base: "emerald-400",
    text: "text-emerald-400",
    border: "border-emerald-400/30",
    bg: "from-emerald-400/20 to-emerald-400/5",
    btn: "from-emerald-400/30 to-emerald-400/10",
  };
}

function quadClassLabel(
  quadClass: number | undefined,
  fallback: string | undefined,
): string {
  if (quadClass === 1) return "VERBAL_COOP";
  if (quadClass === 2) return "MATERIAL_COOP";
  if (quadClass === 3) return "VERBAL_CONFLICT";
  if (quadClass === 4) return "MATERIAL_CONFLICT";
  return fallback || "UNKNOWN";
}

export const GdeltView: React.FC<BaseViewProps> = ({
  entity,
  onClose,
  onCenterMap,
  onOpenAnalystPanel,
  onOpenSource,
}) => {
  const detail = entity.detail as any;
  const tone = detail.tone ?? 0;
  const goldstein = detail.goldstein ?? 0;
  const theme = getGdeltTheme(goldstein);

  return (
    <div className="pointer-events-auto flex flex-col h-auto max-h-full overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
      {/* Header */}
      <div
        className={`p-3 border border-b-0 ${theme.border} bg-gradient-to-br ${theme.bg} backdrop-blur-md rounded-t-sm`}
      >
        <div className="flex justify-between items-start">
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Newspaper size={14} className={theme.text} />
              <span className="text-[10px] font-bold tracking-[.3em] text-white/40">
                GLOBAL_EVENT_MONITOR
              </span>
            </div>
            <h2
              className={`text-mono-xl font-bold tracking-tighter ${theme.text} drop-shadow-[0_0_8px_currentColor] mb-2 truncate`}
              title={entity.callsign}
            >
              {entity.callsign}
            </h2>
            <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
              <h3 className="text-mono-sm font-bold text-white/90">
                NEWS_INTEL_FUSION
              </h3>
              <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                <div className="flex gap-2">
                  <span className="text-white/30 w-16">Class:</span>
                  <span className="text-white/80">
                    {quadClassLabel(
                      detail.quad_class,
                      detail.event_root_code || detail.domain,
                    )}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-white/30 w-16">Status:</span>
                  <span className={theme.text}>{theme.status}</span>
                </div>
              </div>
            </section>
          </div>
          <button
            onClick={onClose}
            aria-label="Close details"
            title="Close details"
            className="p-1.5 hover:bg-white/10 rounded-sm text-white/30 hover:text-white transition-all group shrink-0 focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
          >
            <X
              size={14}
              className="group-hover:rotate-90 transition-transform duration-300"
            />
          </button>
        </div>
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
          {detail.url && detail.url.startsWith("http") ? (
            onOpenSource ? (
              <button
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onOpenSource({
                    url: detail.url,
                    title: entity.callsign || "GDELT EVENT",
                    source: detail.domain || "GDELT",
                    pubDate:
                      detail.dateadded ||
                      new Date(entity.lastSeen).toISOString(),
                  });
                }}
                className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/20 py-1.5 rounded text-[10px] font-bold tracking-widest text-white/70 transition-all active:scale-[0.98]"
              >
                <ExternalLink size={12} />
                VIEW_SOURCE
              </button>
            ) : (
              <a
                href={detail.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/20 py-1.5 rounded text-[10px] font-bold tracking-widest text-white/70 transition-all active:scale-[0.98]"
              >
                <ExternalLink size={12} />
                VIEW_SOURCE
              </a>
            )
          ) : (
            <span
              title="Source URL unavailable for this event"
              className="flex-1 flex items-center justify-center gap-2 bg-white/5 border border-white/10 py-1.5 rounded text-[10px] font-bold tracking-widest text-white/20 cursor-not-allowed select-none"
            >
              <ExternalLink size={12} />
              SOURCE_UNAVAILABLE
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="overflow-y-auto min-h-0 shrink border-x border-tactical-border bg-black/30 backdrop-blur-md p-3 space-y-3 scrollbar-none font-mono">
        <section className="space-y-2">
          <h3
            className={`text-[10px] ${theme.text} font-bold uppercase tracking-wider`}
          >
            Parties_Involved
          </h3>
          <div className="space-y-1 text-mono-xs font-medium">
            {(detail.actor1 || detail.actor1_country) && (
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">ACTOR 1:</span>
                <span className="text-white/80 truncate">
                  {detail.actor1 || "—"}{" "}
                  {detail.actor1_country && (
                    <span className="text-white/50">
                      ({detail.actor1_country})
                    </span>
                  )}
                </span>
              </div>
            )}
            {(detail.actor2 || detail.actor2_country) && (
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">ACTOR 2:</span>
                <span className="text-white/80 truncate">
                  {detail.actor2 || "—"}{" "}
                  {detail.actor2_country && (
                    <span className="text-white/50">
                      ({detail.actor2_country})
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <h3
            className={`text-[10px] ${theme.text} font-bold uppercase tracking-wider`}
          >
            Event_Telemetry
          </h3>
          <div className="space-y-1 text-mono-xs font-medium">
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">TONE (GS):</span>
              <span className={`${theme.text} tabular-nums font-bold`}>
                {tone.toFixed(1)}
              </span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">LATITUDE:</span>
              <span className="text-white tabular-nums">
                {entity.lat.toFixed(6)}°
              </span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">LONGITUDE:</span>
              <span className="text-white tabular-nums">
                {entity.lon.toFixed(6)}°
              </span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">CLASS:</span>
              <span
                className="text-white/70 truncate"
                title={
                  detail.event_root_code ||
                  detail.domain ||
                  (detail.quad_class != null
                    ? String(detail.quad_class)
                    : "N/A")
                }
              >
                {quadClassLabel(
                  detail.quad_class,
                  detail.event_root_code || detail.domain || "N/A",
                )}
              </span>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-[10px] text-white/60 font-bold uppercase tracking-wider">
            Media_Coverage
          </h3>
          <div className="space-y-1 text-mono-xs font-medium">
            {detail.num_articles != null && (
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">ARTICLES:</span>
                <span className="text-white/80 tabular-nums font-bold">
                  {detail.num_articles}
                </span>
              </div>
            )}
            {detail.num_sources != null && (
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">SOURCES:</span>
                <span className="text-white/80 tabular-nums font-bold">
                  {detail.num_sources}
                </span>
              </div>
            )}
            {detail.num_mentions != null && (
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">MENTIONS:</span>
                <span className="text-white/80 tabular-nums font-bold">
                  {detail.num_mentions}
                </span>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-1">
          <h3 className="text-[10px] text-white/50 font-bold opacity-40">
            INTELLIGENCE_CONTEXT
          </h3>
          <p className="text-[10px] text-white/40 leading-relaxed font-mono italic">
            Record represents a geolocated news event fused via GDELT. The
            Goldstein scale measures the theoretical impact on stability,
            ranging from -10 (Conflict) to +10 (Cooperation).
          </p>
        </section>
      </div>

      {/* Footer */}
      <div className="p-3 border border-t-0 border-tactical-border bg-black/40 backdrop-blur-md rounded-b-sm flex flex-col gap-2">
        <div className="flex gap-2 w-full">
          <AnalysisWidget
            accentColor={theme.text}
            onOpenPanel={onOpenAnalystPanel}
          />
        </div>
        <div className="flex items-center justify-between text-[8px] font-mono text-white/30 pt-1 border-t border-white/5">
          <span>
            SIG: <span className={theme.text}>GDELT_OSINT_STREAM</span>
          </span>
          <span>
            <TimeTracked lastSeen={entity.lastSeen} />
          </span>
        </div>
      </div>
    </div>
  );
};
