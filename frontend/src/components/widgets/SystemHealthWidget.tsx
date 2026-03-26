import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  X,
  XCircle,
} from "lucide-react";
import React, { useEffect, useState } from "react";

type PollerStatus =
  | "healthy"
  | "stale"
  | "pending"
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

function StatusIcon({ status }: { status: PollerStatus }) {
  switch (status) {
    case "healthy":
    case "active":
      return (
        <CheckCircle2
          size={12}
          className="text-hud-green drop-shadow-[0_0_5px_rgba(0,255,65,0.8)]"
        />
      );
    case "stale":
      return (
        <Clock
          size={12}
          className="text-amber-500 drop-shadow-[0_0_5px_rgba(245,158,11,0.8)]"
        />
      );
    case "error":
      return (
        <XCircle
          size={12}
          className="text-red-500 drop-shadow-[0_0_5px_rgba(239,68,68,0.8)]"
        />
      );
    case "no_credentials":
      return (
        <AlertTriangle
          size={12}
          className="text-amber-500 drop-shadow-[0_0_5px_rgba(245,158,11,0.8)]"
        />
      );
    case "pending":
    case "unknown":
    default:
      return <XCircle size={12} className="text-white/30" />;
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
  const [pollers, setPollers] = useState<PollerHealth[]>([]);
  const [loading, setLoading] = useState(true);
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

    fetch("/api/config/poller-health")
      .then((res) => res.json())
      .then((data: PollerHealth[]) => {
        if (mounted) {
          setPollers(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch poller health:", err);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Group pollers by their group field
  const groups = pollers.reduce<Record<string, PollerHealth[]>>((acc, p) => {
    if (!acc[p.group]) acc[p.group] = [];
    acc[p.group].push(p);
    return acc;
  }, {});

  return (
    <div
      className="absolute top-[calc(100%+23px)] left-1/2 z-[100] w-[300px] max-h-[calc(100vh-88px)] -translate-x-1/2 animate-in slide-in-from-top-2 fade-in duration-200"
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
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.open('/stats', '_blank');
              }}
              className="px-1.5 py-0.5 rounded border border-hud-green/30 bg-hud-green/5 text-[8px] font-bold text-hud-green hover:bg-hud-green/20 transition-colors"
              title="Open Performance Dashboard"
            >
              STATS
            </button>
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

        {/* Content */}
        <div
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2"
          aria-live="polite"
          aria-busy={loading}
        >
          {loading ? (
            <div className="flex items-center justify-center p-4">
              <div className="h-4 w-4 rounded-full border-2 border-hud-green/20 border-t-hud-green animate-spin" />
              <span className="ml-2 text-[10px] text-white/40 tracking-widest font-mono">
                DIAGNOSING...
              </span>
            </div>
          ) : pollers.length === 0 ? (
            <div className="flex items-center justify-center p-4 text-[10px] text-white/40 font-mono tracking-wider">
              NO DATA AVAILABLE
            </div>
          ) : (
            Object.entries(groups).map(([groupName, items]) => (
              <div key={groupName}>
                {/* Group label */}
                <div className="px-2 pb-1">
                  <span className="text-[8px] font-bold tracking-[0.2em] text-white/30 uppercase font-mono">
                    {groupName}
                  </span>
                </div>
                {/* Items */}
                <div className="flex flex-col gap-0.5">
                  {items.map((poller) => (
                    <div
                      key={poller.id}
                      className="flex items-center justify-between px-2 py-1 rounded bg-white/5 border border-white/5 hover:bg-white/10 transition-colors"
                      title={
                        poller.last_error_msg
                          ? `Last error: ${poller.last_error_msg}`
                          : poller.last_success
                            ? `Last success: ${formatAge(poller.last_success)}`
                            : undefined
                      }
                    >
                      <div className="flex items-center gap-2">
                        <StatusIcon status={poller.status} />
                        <span className="text-[10px] font-bold tracking-wider text-white/80 font-mono uppercase">
                          {poller.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {poller.last_success && poller.status !== "active" && (
                          <span className="text-[8px] text-white/30 font-mono">
                            {formatAge(poller.last_success)}
                          </span>
                        )}
                        <span
                          className={`text-[9px] font-bold tracking-widest font-mono uppercase ${statusColor(poller.status)}`}
                        >
                          {statusLabel(poller.status)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
