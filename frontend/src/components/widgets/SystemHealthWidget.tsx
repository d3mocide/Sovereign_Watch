import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Clock,
  Cloud,
  Globe,
  Network,
  Orbit,
  Plane,
  Radio,
  Satellite,
  Server,
  Ship,
  Sun,
  Waves,
  X,
  XCircle,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import React, { useEffect, useMemo, useState } from "react";


type PollerStatus =
  | "healthy"
  | "stale"
  | "pending"
  | "no_data"
  | "no_credentials"
  | "error"
  | "active"
  | "unknown";

interface PollerHealth {
  id: string;
  name: string;
  group: string;
  status: PollerStatus;
  last_success: number | null;
  last_error_ts: number | null;
  last_error_msg: string | null;
  stale_after_s: number | null;
}

interface ClausalizerWidgetMetrics {
  status: string;
  health?: {
    rows_5m_total: number;
    last_write_at: string | null;
  };
}

interface SatnogsStationsMeta {
  source: string;
  stale: boolean;
  count: number;
  served_at: number;
}

interface SatnogsStationsEnvelope {
  stations: unknown[];
  meta?: SatnogsStationsMeta;
}

interface SystemHealthWidgetProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatAge(epochSec: number): string {
  const age = Math.floor(Date.now() / 1000 - epochSec);
  if (age < 60) return `${age}s ago`;
  if (age < 3600) return `${Math.floor(age / 60)}m ago`;
  if (age < 86400) return `${Math.floor(age / 3600)}h ago`;
  return `${Math.floor(age / 86400)}d ago`;
}

function getIconForPoller(poller: PollerHealth | { id: string; group: string }) {
  const id = poller.id.toLowerCase();
  const group = poller.group.toUpperCase();

  if (id.includes("satnogs")) return Activity;
  if (id.includes("aviation") || id.includes("adsb") || id.includes("flight")) return Plane;
  if (id.includes("maritime") || id.includes("ais") || id.includes("vessel")) return Ship;
  if (id.includes("iss") || id.includes("station")) return Orbit;
  if (id.includes("orbital") || id.includes("tle") || id.includes("satellite")) return Satellite;
  if (id.includes("weather") || id.includes("space_pulse") || id.includes("nws")) return id.includes("nws") ? Cloud : Sun;
  if (id.includes("gdelt") || id.includes("osint")) return Globe;
  if (id.includes("rf") || id.includes("radio") || id.includes("noaa") || id.includes("radioref")) return Radio;
  if (id.includes("ndbc") || id.includes("ocean") || id.includes("buoy")) return Waves;
  if (id.includes("peeringdb") || id.includes("ixp") || id.includes("network")) return Network;
  if (id.includes("cable") || id.includes("tower") || id.includes("infra")) return Server;
  if (group === "ANALYSIS" || id.includes("analysis") || id.includes("clausalizer")) return Brain;

  return CheckCircle2;
}

function StatusIcon({
  status,
  icon: IconComponent,
}: {
  status: PollerStatus;
  icon?: any;
}) {
  const Icon = IconComponent || CheckCircle2;
  const size = 12;

  switch (status) {
    case "healthy":
    case "active":
      return (
        <Icon
          size={size}
          className="text-hud-green drop-shadow-[0_0_5px_rgba(0,255,65,0.8)]"
        />
      );
    case "stale":
    case "no_data":
      return (
        <Clock
          size={size}
          className="text-amber-500 drop-shadow-[0_0_5px_rgba(245,158,11,0.8)]"
        />
      );
    case "error":
      return (
        <XCircle
          size={size}
          className="text-red-500 drop-shadow-[0_0_5px_rgba(239,68,68,0.8)]"
        />
      );
    case "no_credentials":
      return (
        <AlertTriangle
          size={size}
          className="text-amber-500 drop-shadow-[0_0_5px_rgba(245,158,11,0.8)]"
        />
      );
    case "pending":
    case "unknown":
    default:
      return <Icon size={size} className="text-white/30" />;
  }
}

function statusLabel(status: PollerStatus): string {
  switch (status) {
    case "healthy":
      return "HEALTHY";
    case "active":
      return "ACTIVE";
    case "stale":
      return "STALE";
    case "error":
      return "ERROR";
    case "no_credentials":
      return "NO KEY";
    case "no_data":
      return "NO DATA";
    case "pending":
      return "PENDING";
    default:
      return "UNKNOWN";
  }
}

function statusColor(status: PollerStatus): string {
  switch (status) {
    case "healthy":
    case "active":
      return "text-hud-green drop-shadow-[0_0_2px_rgba(0,255,65,0.5)]";
    case "stale":
    case "no_data":
    case "no_credentials":
      return "text-amber-500 drop-shadow-[0_0_2px_rgba(245,158,11,0.5)]";
    case "error":
      return "text-red-500 drop-shadow-[0_0_2px_rgba(239,68,68,0.5)]";
    default:
      return "text-white/40";
  }
}

export const SystemHealthWidget: React.FC<SystemHealthWidgetProps> = ({
  isOpen,
  onClose,
}) => {
  const { hasRole } = useAuth();
  const [pollers, setPollers] = useState<PollerHealth[]>([]);

  const [loading, setLoading] = useState(true);
  const [clausalizerMetrics, setClausalizerMetrics] =
    useState<ClausalizerWidgetMetrics | null>(null);
  const [satnogsMeta, setSatnogsMeta] = useState<SatnogsStationsMeta | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [prevOpen, setPrevOpen] = useState(isOpen);

  if (isOpen && !prevOpen) {
    setPrevOpen(true);
    setLoading(true);
    setPollers([]);
  } else if (!isOpen && prevOpen) {
    setPrevOpen(false);
  }

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;

    Promise.allSettled([
      fetch("/api/config/poller-health"),
      fetch("/api/stats/clausalizer?hours=1"),
      fetch("/api/satnogs/stations?include_offline=false&include_meta=true"),
    ])
      .then(async ([pollerRes, clausalizerRes, satnogsRes]) => {
        const pollerResponse = pollerRes.status === "fulfilled" ? pollerRes.value : null;
        const clausalizerResponse =
          clausalizerRes.status === "fulfilled" ? clausalizerRes.value : null;
        const satnogsResponse = satnogsRes.status === "fulfilled" ? satnogsRes.value : null;

        const pollerData: PollerHealth[] = pollerResponse?.ok
          ? await pollerResponse.json()
          : [];
        const clausalizerData: ClausalizerWidgetMetrics | null = clausalizerResponse?.ok
          ? await clausalizerResponse.json()
          : null;
        const satnogsData: SatnogsStationsEnvelope | null = satnogsResponse?.ok
          ? await satnogsResponse.json()
          : null;

        if (mounted) {
          setPollers(pollerData);
          setClausalizerMetrics(clausalizerData);
          setSatnogsMeta(satnogsData?.meta ?? null);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch system health widget data:", err);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setNowTs(Date.now());
    const timer = setInterval(() => setNowTs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [isOpen]);

  const groupedPollers = useMemo(() => {
    const groups: Record<string, PollerHealth[]> = {};
    const order = [
      "TRACKING",
      "ORBITAL",
      "INTEL",
      "RF",
      "INFRASTRUCTURE",
      "ENVIRONMENT",
      "ANALYSIS",
    ];

    pollers.forEach((p) => {
      // SatNOGS internals (net/db) are handled via dots in the SatNOGS row
      if (p.id === "satnogs_net" || p.id === "satnogs_db") return;
      
      const g = p.group.toUpperCase();
      if (!groups[g]) groups[g] = [];
      groups[g].push(p);
    });

    return Object.keys(groups)
      .sort((a, b) => {
        const idxA = order.indexOf(a);
        const idxB = order.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
      })
      .map((g) => ({ name: g, items: groups[g] }));
  }, [pollers]);

  if (!isOpen) return null;

  const satnogsNetPoller = pollers.find((p) => p.id === "satnogs_net");
  const satnogsDbPoller = pollers.find((p) => p.id === "satnogs_db");

  const lastWriteMs = clausalizerMetrics?.health?.last_write_at
    ? Date.parse(clausalizerMetrics.health.last_write_at)
    : NaN;
  const minutesSinceWrite = Number.isNaN(lastWriteMs)
    ? null
    : Math.max(0, Math.floor((nowTs - lastWriteMs) / 60000));
  const rows5mTotal = clausalizerMetrics?.health?.rows_5m_total ?? 0;
  // Use a logarithmic scale for activity, saturated at 5,000 rows
  const activityPercent = Math.min(100, (Math.log10(rows5mTotal + 1) / Math.log10(5000 + 1)) * 100);
  const clausalizerStatus: PollerStatus =
    minutesSinceWrite === null
      ? "unknown"
      : minutesSinceWrite <= 5
        ? "healthy"
        : minutesSinceWrite <= 15
          ? "stale"
          : "error";

  const satnogsStatus: PollerStatus = satnogsMeta
    ? satnogsMeta.stale
      ? "stale"
      : satnogsMeta.source === "live" || satnogsMeta.source === "cache"
        ? "healthy"
        : "unknown"
    : "error";

  const satnogsSourceLabel = satnogsMeta
    ? satnogsMeta.source.replaceAll("_", " ").toUpperCase()
    : "UNAVAILABLE";

  return (
    <div
      className="absolute top-[calc(100%+23px)] left-1/2 z-[100] w-[640px] max-h-[calc(100vh-88px)] -translate-x-1/2 animate-in slide-in-from-top-2 fade-in duration-200"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="System Health Checker"
    >
      <div className="flex max-h-full min-h-0 flex-col overflow-hidden rounded-lg border border-hud-green/30 bg-black/90 backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-hud-green/20 bg-hud-green/10">
          <div className="flex items-center gap-2">
            <Activity
              size={14}
              className="text-hud-green drop-shadow-[0_0_8px_rgba(0,255,65,0.8)] animate-pulse"
            />
            <h3 className="text-[10px] font-black tracking-widest text-hud-green drop-shadow-[0_0_5px_rgba(0,255,65,0.5)] uppercase">
              SYSTEM HEALTH
            </h3>
          </div>
          <div className="flex items-center gap-1">
            {hasRole("admin") && (
              <div className="flex gap-1.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open("/linkage", "_blank");
                  }}
                  className="px-1.5 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/5 text-[8px] font-bold text-cyan-500 hover:bg-cyan-500/20 transition-colors"
                  title="Open Linkage Diagnostic Audit"
                >
                  LINKAGE
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open("/stats", "_blank");
                  }}
                  className="px-1.5 py-0.5 rounded border border-hud-green/30 bg-hud-green/5 text-[8px] font-bold text-hud-green hover:bg-hud-green/20 transition-colors"
                  title="Open Performance Dashboard"
                >
                  STATS
                </button>
              </div>
            )}
            <button

              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        {/* Body Container */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-hud-green/20">
          {loading ? (
            <div className="flex h-32 items-center justify-center space-x-2 text-hud-green/50">
              <Activity className="size-4 animate-pulse" />
              <span className="text-xs font-mono uppercase tracking-widest">
                Aggregating Fusion State...
              </span>
            </div>
          ) : (
            <div className="bg-hud-green/[0.02] border-t border-hud-green/10 backdrop-blur-sm shadow-inner">
              <div className="p-3 space-y-3">
                {groupedPollers.map((group, idx) => (
                  <div key={group.name} className="space-y-1">
                    {idx > 0 && <div className="h-px w-full bg-hud-green/10 my-1" />}
                    
                    <div className="flex items-center gap-2 mb-1 opacity-50">
                      <span className="text-[9px] font-black tracking-[0.2em] text-hud-green uppercase">
                        {group.name}
                      </span>
                      <div className="h-px flex-1 bg-hud-green/5" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-x-8 gap-y-0">
                      {group.items.map((poller) => (
                        <div
                          key={poller.id}
                          className="group/item flex items-center justify-between py-0.5 transition-colors hover:bg-white/5 px-1.5 rounded -mx-1.5"
                          title={poller.last_error_msg || undefined}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <StatusIcon
                              status={poller.status as PollerStatus}
                              icon={getIconForPoller(poller)}
                            />
                            <span className="text-[10px] font-bold tracking-wider text-white/90 font-mono uppercase truncate">
                              {poller.name.replace(/\s*\(.*\)/, "")}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2 shrink-0">
                            {poller.id === "satnogs" && (
                              <div className="flex items-center gap-1.5">
                                {satnogsSourceLabel && (
                                  <span className="text-[7px] text-white/20 font-mono uppercase bg-white/5 px-1 rounded">
                                    {satnogsSourceLabel}
                                  </span>
                                )}
                                <div className="flex gap-0.5">
                                  <div
                                    className={`size-1.5 rounded-full ${
                                      satnogsNetPoller?.status === "healthy"
                                        ? "bg-hud-green shadow-[0_0_4px_#00FF41]"
                                        : "bg-white/10"
                                    }`}
                                  />
                                  <div
                                    className={`size-1.5 rounded-full ${
                                      satnogsDbPoller?.status === "healthy"
                                        ? "bg-hud-green shadow-[0_0_4px_#00FF41]"
                                        : "bg-white/10"
                                    }`}
                                  />
                                </div>
                              </div>
                            )}
                            
                            <span className="text-[9px] font-mono text-white/30 uppercase tracking-tighter tabular-nums">
                              {poller.last_success && poller.status !== "pending" && poller.status !== "active"
                                ? formatAge(poller.last_success)
                                : ""}
                            </span>
                            <span
                              className={`text-[9px] font-black tabular-nums transition-all ${statusColor(
                                poller.id === "satnogs" ? satnogsStatus : (poller.status as PollerStatus)
                              )}`}
                            >
                              {statusLabel(poller.id === "satnogs" ? satnogsStatus : (poller.status as PollerStatus))}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Clausalizer Activity Anchor (Full Width at Bottom of Inner Container) */}
              <div className="pt-1.5 border-t border-hud-green/20 bg-hud-green/[0.03] px-2.5 pb-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <StatusIcon status={clausalizerStatus} icon={Brain} />
                    <span className="text-[9px] font-black tracking-widest text-white/80 font-mono uppercase">
                      CLAUSALIZER ENGINE
                    </span>
                  </div>
                  <span className={`text-[9px] font-black ${statusColor(clausalizerStatus)}`}>
                    {statusLabel(clausalizerStatus)}
                  </span>
                </div>
                
                <div className="h-1 w-full bg-hud-green/5 rounded-full overflow-hidden mb-1.5">
                  <div
                    className={`h-full bg-hud-green shadow-[0_0_8px_rgba(0,255,65,0.6)] transition-all duration-1000 ${
                      clausalizerStatus === "healthy" ? "animate-pulse" : ""
                    }`}
                    style={{
                      width: `${activityPercent}%`,
                    }}
                  />
                </div>
                
                <div className="flex justify-between items-center text-[8px] font-mono font-bold text-white/20 tracking-tight">
                  <div className="flex gap-2">
                    <span className="uppercase">TP: <span className="text-white/40">{rows5mTotal.toLocaleString()}</span></span>
                    <span className="uppercase">20K TGT</span>
                  </div>
                  <span className="uppercase">
                    LAST: <span className="text-white/40">{minutesSinceWrite !== null ? `${minutesSinceWrite}m` : "--"}</span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
