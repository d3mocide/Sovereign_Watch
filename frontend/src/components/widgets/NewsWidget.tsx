import {
  AlertTriangle,
  ChevronRight,
  Newspaper,
  RefreshCw,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";

export interface NewsItem {
  title: string;
  link: string;
  pub_date: string;
  source: string;
}

interface GdeltEvent {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    url?: string;
    domain?: string;
    tone?: number;
    toneColor?: [number, number, number, number];
    dateadded?: string;
  };
}

/** Returns a short label + tailwind color class for a Goldstein tone score. */
function toneChip(tone: number): { label: string; className: string } {
  if (tone <= -5)
    return {
      label: "CONFLICT",
      className: "text-red-400 bg-red-400/10 border-red-400/30",
    };
  return {
    label: "TENSION",
    className: "text-orange-400 bg-orange-400/10 border-orange-400/30",
  };
}

interface NewsWidgetProps {
  compact?: boolean;
  onOpenArticle?: (article: NewsItem) => void;
}

function formatZuluTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return "UNK";
  return new Date(ts).toISOString().slice(11, 16) + "Z";
}

function formatAge(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return "UNKNOWN AGE";

  const diffMs = Date.now() - ts;
  if (diffMs <= 0) return "JUST NOW";

  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}M AGO`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}H AGO`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}D AGO`;
}

export const NewsWidget: React.FC<NewsWidgetProps> = ({
  compact = false,
  onOpenArticle,
}) => {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  // GDELT live threat events (tone ≤ -2)
  const [threats, setThreats] = useState<GdeltEvent[]>([]);
  const [threatsLoading, setThreatsLoading] = useState(false);
  const [showThreats, setShowThreats] = useState(false);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/news/feed?limit=100");
      if (resp.ok) {
        const data: NewsItem[] = await resp.json();
        const sortedByTime = [...data].sort((a, b) => {
          const timeA = Date.parse(a.pub_date) || 0;
          const timeB = Date.parse(b.pub_date) || 0;
          return timeB - timeA;
        });
        setItems(sortedByTime);
        setLastFetched(new Date());
      }
    } catch {
      // Silently fail — news is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchThreats = useCallback(async () => {
    setThreatsLoading(true);
    try {
      const resp = await fetch("/api/gdelt/events");
      if (resp.ok) {
        const data = await resp.json();
        const events: GdeltEvent[] = (data?.features ?? [])
          .filter((f: GdeltEvent) => (f.properties.tone ?? 0) <= -2)
          .sort(
            (a: GdeltEvent, b: GdeltEvent) =>
              (a.properties.tone ?? 0) - (b.properties.tone ?? 0),
          );
        setThreats(events);
      }
    } catch {
      // Silently fail
    } finally {
      setThreatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
    const timer = setInterval(fetchNews, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [fetchNews]);

  useEffect(() => {
    fetchThreats();
    const timer = setInterval(fetchThreats, 15 * 60 * 1000);
    return () => clearInterval(timer);
  }, [fetchThreats]);

  const handleOpenArticle = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, item: NewsItem) => {
      if (!onOpenArticle) return;
      event.preventDefault();
      onOpenArticle(item);
    },
    [onOpenArticle],
  );

  if (compact) {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Compact threats strip removed - replaced by header count in DashboardView */}
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[10px] text-white/20">
            {loading ? "FETCHING FEEDS..." : "NO DATA"}
          </div>
        ) : (
          items.map((item, i) => (
            <a
              key={i}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => handleOpenArticle(event, item)}
              className="flex items-start gap-1.5 px-2 py-1.5 border-b border-white/[0.03] hover:bg-white/5 transition-colors group"
            >
              <ChevronRight
                size={8}
                className="text-amber-400/50 flex-shrink-0 mt-0.5 group-hover:text-amber-400"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[9px] text-white/60 leading-tight line-clamp-2 group-hover:text-white/90">
                  {item.title}
                </p>
                <span className="text-[8px] text-amber-400/50">
                  {item.source}
                </span>
              </div>
            </a>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-black/20 border border-white/10 rounded">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/5">
        <div className="flex items-center gap-2">
          <Newspaper size={12} className="text-amber-400/70" />
          <span className="text-[10px] font-bold tracking-[.3em] text-white/80 uppercase">
            OPEN SOURCE NEWS
          </span>
          <span className="text-[10px] text-amber-400 font-black tabular-nums">
            [{items.length}]
          </span>
        </div>

        <div className="flex items-center gap-2">
          {lastFetched && (
            <span className="text-[9px] font-mono tabular-nums text-white/30">
              {lastFetched.toISOString().split("T")[1].substring(0, 5)}Z
            </span>
          )}
          <button
            onClick={() => {
              fetchNews();
              fetchThreats();
            }}
            disabled={loading}
            className="text-white/25 hover:text-white/60 transition-colors disabled:opacity-30 focus-visible:ring-1 focus-visible:ring-amber-400 outline-none"
            title="Refresh news feed"
            aria-label="Refresh news feed"
          >
            <RefreshCw
              size={10}
              className={loading || threatsLoading ? "animate-spin" : ""}
            />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* LIVE THREATS section */}
        <div className="border-b border-red-400/20">
          <button
            className="w-full flex items-center justify-between px-3 py-1.5 bg-red-400/5 hover:bg-red-400/10 transition-colors focus-visible:ring-1 focus-visible:ring-red-400 outline-none"
            onClick={() => setShowThreats(!showThreats)}
            aria-expanded={showThreats}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle
                size={10}
                className={
                  threats.length > 0
                    ? "text-red-400 animate-pulse"
                    : "text-white/20"
                }
              />
              <span className="text-[9px] font-bold tracking-widest uppercase text-red-400/80">
                Live Threats
              </span>
              {threatsLoading && (
                <span className="text-[8px] text-white/20">UPDATING…</span>
              )}
            </div>
            <ChevronRight
              size={10}
              className="text-white/30 transition-transform duration-200"
              style={{ transform: showThreats ? "rotate(90deg)" : "none" }}
            />
          </button>

          {showThreats && (
            <div>
              {threats.length === 0 ? (
                <div className="px-3 py-3 text-[9px] text-white/20 text-center">
                  {threatsLoading
                    ? "SCANNING GDELT…"
                    : "NO ACTIVE CONFLICTS — GDELT CLEAR"}
                </div>
              ) : (
                <div className="divide-y divide-white/[0.03]">
                  {threats.slice(0, 12).map((t, i) => {
                    const chip = toneChip(t.properties.tone ?? -3);
                    const [lon, lat] =
                      t.properties.tone != null
                        ? t.geometry.coordinates
                        : [0, 0];
                    return (
                      <a
                        key={i}
                        href={t.properties.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-2 px-3 py-2 hover:bg-red-400/5 transition-colors group"
                      >
                        <div className="flex flex-col items-center gap-0.5 flex-shrink-0 mt-0.5">
                          <span
                            className={`text-[7px] font-bold px-1 rounded border ${chip.className}`}
                          >
                            {chip.label}
                          </span>
                          <span className="text-[7px] text-white/25 font-mono tabular-nums">
                            {lat.toFixed(1)},{lon.toFixed(1)}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[9px] text-white/70 leading-snug line-clamp-2 group-hover:text-white/90">
                            {t.properties.name}
                          </p>
                          <span className="text-[8px] text-white/30">
                            {t.properties.domain}
                          </span>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RSS feed */}
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
            <Newspaper size={20} className="text-white/10" />
            <span className="text-[10px] text-white/20">
              {loading
                ? "FETCHING FEEDS..."
                : "NO DATA — VERIFY NEWS_RSS_URLS CONFIG"}
            </span>
          </div>
        ) : (
          <div className="p-2 space-y-1.5">
            <div className="flex items-center justify-between px-2 py-1 border border-white/5 bg-white/[0.02]">
              <span className="text-[8px] font-bold tracking-[.25em] uppercase text-white/35">
                Aggregate Feed
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[7px] font-mono text-amber-400/70">
                  SORT: NEWEST
                </span>
                <span className="text-[7px] font-bold px-1.5 py-0.5 border border-amber-400/25 bg-amber-400/10 text-amber-400">
                  {items.length}
                </span>
              </div>
            </div>

            {items.map((item, i) => (
              <a
                key={i}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => handleOpenArticle(event, item)}
                className="block rounded border border-white/5 bg-black/30 px-2.5 py-2 hover:border-amber-400/30 hover:bg-amber-400/[0.06] transition-colors group"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ChevronRight
                      size={8}
                      className="text-amber-400/60 flex-shrink-0 group-hover:text-amber-400"
                    />
                    <span className="text-[7px] font-bold uppercase tracking-[.2em] text-amber-400/90 truncate max-w-[120px]">
                      {item.source}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[7px] font-mono text-white/35">
                      {formatAge(item.pub_date)}
                    </span>
                    <span className="text-[7px] font-mono text-white/45">
                      {formatZuluTime(item.pub_date)}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-[7px] font-mono text-white/20 mt-0.5">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="text-[9px] text-white/65 leading-snug line-clamp-2 group-hover:text-white/95">
                    {item.title}
                  </p>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
