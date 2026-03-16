import React, { useState, useEffect, useCallback } from 'react';
import { Newspaper, ChevronRight, RefreshCw } from 'lucide-react';

export interface NewsItem {
  title: string;
  link: string;
  pub_date: string;
  source: string;
}

interface NewsWidgetProps {
  compact?: boolean;
}

export const NewsWidget: React.FC<NewsWidgetProps> = ({ compact = false }) => {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/news/feed?limit=40');
      if (resp.ok) {
        const data: NewsItem[] = await resp.json();
        setItems(data);
        setLastFetched(new Date());
      }
    } catch {
      // Silently fail — news is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
    const timer = setInterval(fetchNews, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [fetchNews]);

  if (compact) {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[10px] text-white/20">
            {loading ? 'FETCHING FEEDS...' : 'NO DATA'}
          </div>
        ) : (
          items.slice(0, 24).map((item, i) => (
            <a
              key={i}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-1.5 px-2 py-1.5 border-b border-white/[0.03] hover:bg-white/5 transition-colors group"
            >
              <ChevronRight size={8} className="text-amber-400/50 flex-shrink-0 mt-0.5 group-hover:text-amber-400" />
              <div className="min-w-0 flex-1">
                <p className="text-[9px] text-white/60 leading-tight line-clamp-2 group-hover:text-white/90">
                  {item.title}
                </p>
                <span className="text-[8px] text-amber-400/50">{item.source}</span>
              </div>
            </a>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 bg-black/40 border-b border-white/5 flex-shrink-0">
        <Newspaper size={12} className="text-amber-400" />
        <span className="text-[9px] font-bold tracking-widest uppercase text-white/70">
          Open Source News
        </span>
        {lastFetched && (
          <span className="text-[8px] text-white/20">
            {lastFetched.toISOString().split('T')[1].substring(0, 5)}Z
          </span>
        )}
        <button
          onClick={fetchNews}
          disabled={loading}
          className="ml-auto text-white/20 hover:text-white/60 transition-colors disabled:opacity-30"
          title="Refresh news feed"
        >
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
            <Newspaper size={20} className="text-white/10" />
            <span className="text-[10px] text-white/20">
              {loading ? 'FETCHING FEEDS...' : 'NO DATA — VERIFY NEWS_RSS_URLS CONFIG'}
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-1 p-2">
            {items.slice(0, 24).map((item, i) => (
              <a
                key={i}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-1.5 px-2 py-1.5 rounded border border-white/5 hover:border-amber-400/20 hover:bg-white/5 transition-colors group"
              >
                <ChevronRight
                  size={8}
                  className="text-amber-400/50 flex-shrink-0 mt-0.5 group-hover:text-amber-400"
                />
                <div className="min-w-0">
                  <p className="text-[9px] text-white/60 leading-tight line-clamp-2 group-hover:text-white/90">
                    {item.title}
                  </p>
                  <span className="text-[8px] text-amber-400/50">{item.source}</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
