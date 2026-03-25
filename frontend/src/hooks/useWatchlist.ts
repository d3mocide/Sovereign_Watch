import { useCallback, useState } from "react";
import {
  addToWatchlist,
  getWatchlist,
  removeFromWatchlist,
  WatchlistEntry,
} from "../api/watchlist";

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newIcao24, setNewIcao24] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const fetchWatchlist = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWatchlist(await getWatchlist());
    } catch {
      setError("Failed to load watchlist");
    } finally {
      setLoading(false);
    }
  }, []);

  const addEntry = async () => {
    const icao = newIcao24.trim().toLowerCase();
    if (!icao) return;
    setAddLoading(true);
    setError(null);
    try {
      await addToWatchlist(icao);
      setNewIcao24("");
      await fetchWatchlist();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAddLoading(false);
    }
  };

  const removeEntry = async (icao24: string) => {
    setError(null);
    try {
      await removeFromWatchlist(icao24);
      setWatchlist((prev) => prev.filter((e) => e.icao24 !== icao24));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove");
    }
  };

  return {
    watchlist,
    loading,
    error,
    newIcao24,
    setNewIcao24,
    addLoading,
    fetchWatchlist,
    addEntry,
    removeEntry,
  };
}
