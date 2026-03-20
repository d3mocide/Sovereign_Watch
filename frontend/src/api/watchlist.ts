export interface WatchlistEntry {
  icao24: string;
  permanent: boolean;
  expires_at: string | null;
}

export async function getWatchlist(): Promise<WatchlistEntry[]> {
  const res = await fetch('/api/watchlist');
  if (!res.ok) throw new Error('Failed to fetch watchlist');
  return res.json();
}

export async function addToWatchlist(icao24: string, ttl_days?: number): Promise<void> {
  const res = await fetch('/api/watchlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ icao24, ttl_days: ttl_days ?? null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to add to watchlist' }));
    throw new Error(err.detail ?? 'Failed to add to watchlist');
  }
}

export async function removeFromWatchlist(icao24: string): Promise<void> {
  const res = await fetch(`/api/watchlist/${encodeURIComponent(icao24)}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to remove from watchlist' }));
    throw new Error(err.detail ?? 'Failed to remove from watchlist');
  }
}
