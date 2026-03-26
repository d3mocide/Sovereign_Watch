/**
 * OsintTicker — Scrolling headline bar for the INTEL globe view.
 *
 * Fetches from /api/news/feed and displays headlines as a continuous
 * horizontal marquee in Sovereign Glass style.
 *
 * Format:  ⚡ SOURCE // HEADLINE  ///  ⚡ SOURCE // HEADLINE  ///
 */
import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

interface NewsItem {
  title: string;
  source?: string;
  url?: string;
  published?: string;
}

interface OsintTickerProps {
  /** Speed in pixels per second. Default 60. */
  speed?: number;
}

export function OsintTicker({ speed = 60 }: OsintTickerProps) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [paused, setPaused] = useState(false);

  // Fetch news on mount and every 15 minutes
  useEffect(() => {
    const fetchNews = async () => {
      try {
        const res = await fetch("/api/news/feed?limit=30");
        if (res.ok) {
          const data = await res.json();
          // API may return { items: [...] } or a plain array
          const raw: NewsItem[] = Array.isArray(data)
            ? data
            : Array.isArray(data.items)
              ? data.items
              : [];
          if (raw.length) setItems(raw);
        }
      } catch {
        // keep previous items
      }
    };
    fetchNews();
    const interval = setInterval(fetchNews, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // CSS animation duration in seconds: total content width / speed
  // We duplicate the list so the marquee loops seamlessly.
  // Since we don't know pixel width, use character count as a proxy:
  // ~8px per char at the font size used.
  const totalChars = items.reduce(
    (acc, item) => acc + (item.source || "").length + item.title.length + 12,
    0,
  );
  // Each char ≈ 8px at text-[11px]; multiply by 2 for duplicated content
  const approxWidthPx = totalChars * 8 * 2;
  const durationSec = Math.max(20, approxWidthPx / speed);

  if (!items.length) return null;

  return (
    <div
      className="w-full bg-black/60 border-t border-hud-green/20 backdrop-blur-sm overflow-hidden"
      style={{ height: "28px" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-center h-full">
        {/* Static prefix */}
        <div className="shrink-0 flex items-center gap-1.5 px-3 border-r border-hud-green/30 h-full bg-hud-green/5">
          <Zap size={9} className="text-hud-green animate-pulse" />
          <span className="text-[9px] font-black tracking-[0.25em] text-hud-green whitespace-nowrap">
            LIVE OSINT
          </span>
        </div>

        {/* Scrolling content */}
        <div className="flex-1 overflow-hidden relative">
          <div
            className="flex items-center whitespace-nowrap"
            style={{
              animationName: "osint-marquee",
              animationDuration: `${durationSec}s`,
              animationTimingFunction: "linear",
              animationIterationCount: "infinite",
              animationPlayState: paused ? "paused" : "running",
            }}
          >
            {/* Duplicate items for seamless loop */}
            {[...items, ...items].map((item, i) => (
              <span key={i} className="inline-flex items-center gap-2 mr-8">
                {item.source && (
                  <>
                    <span className="text-[9px] font-black tracking-widest text-hud-green/50 uppercase">
                      // {item.source}
                    </span>
                    <span className="text-hud-green/20 text-[9px]">&nbsp;</span>
                  </>
                )}
                <a
                  href={item.url || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-white/70 hover:text-hud-green transition-colors cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                >
                  {item.title}
                </a>
                <span className="text-hud-green/20 text-[10px] mx-2">///</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
