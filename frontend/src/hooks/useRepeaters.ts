import { useEffect, useRef, useState, MutableRefObject } from "react";
import type { RepeaterStation } from "../types";

const API_BASE = "/api/repeaters";
const DEFAULT_RADIUS_MI = 75;
// Minimum distance (degrees) the mission centre must move before a refetch
const REFETCH_THRESHOLD_DEG = 0.25;

export interface UseRepeatersResult {
  repeatersRef: MutableRefObject<RepeaterStation[]>;
  repeaters: RepeaterStation[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches amateur radio repeaters from the backend proxy endpoint.
 *
 * Automatically refetches when:
 *  - `enabled` transitions to true
 *  - The mission centre moves more than REFETCH_THRESHOLD_DEG degrees
 *
 * Data is held in both a React state (for sidebar widgets) and a ref
 * (for the 60fps animation loop to read without causing re-renders).
 */
export function useRepeaters(
  enabled: boolean,
  missionLat: number,
  missionLon: number,
  radiusMi: number = DEFAULT_RADIUS_MI,
): UseRepeatersResult {
  const repeatersRef = useRef<RepeaterStation[]>([]);
  const [repeaters, setRepeaters] = useState<RepeaterStation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the last-fetched centre to avoid redundant fetches
  const lastFetchRef = useRef<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // Skip if the mission centre hasn't moved significantly
    const last = lastFetchRef.current;
    if (last) {
      const dLat = Math.abs(missionLat - last.lat);
      const dLon = Math.abs(missionLon - last.lon);
      if (dLat < REFETCH_THRESHOLD_DEG && dLon < REFETCH_THRESHOLD_DEG) return;
    }

    let cancelled = false;

    const fetchRepeaters = async () => {
      setLoading(true);
      setError(null);

      try {
        const url = `${API_BASE}?lat=${missionLat}&lon=${missionLon}&radius=${radiusMi}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data: { count: number; results: RepeaterStation[] } = await resp.json();

        if (!cancelled) {
          const results = data.results ?? [];
          repeatersRef.current = results;
          setRepeaters(results);
          lastFetchRef.current = { lat: missionLat, lon: missionLon };
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? "Failed to fetch repeaters");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRepeaters();
    return () => {
      cancelled = true;
    };
  }, [enabled, missionLat, missionLon, radiusMi]);

  // Clear data when layer is disabled
  useEffect(() => {
    if (!enabled) {
      repeatersRef.current = [];
      setRepeaters([]);
      lastFetchRef.current = null;
    }
  }, [enabled]);

  return { repeatersRef, repeaters, loading, error };
}
