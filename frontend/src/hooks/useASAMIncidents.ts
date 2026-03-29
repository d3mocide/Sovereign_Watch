import type { FeatureCollection } from "geojson";
import { useEffect, useRef, useState } from "react";

interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/** Fetch ASAM piracy incidents from /api/asam/incidents.
 *
 * Behaviour mirrors useNDBCBuoys:
 *  - Only fetches when enabled=true and bounds are available.
 *  - Debounces bounds changes by 500 ms to avoid rapid pan/zoom spam.
 *  - Refreshes automatically every 6 hours (ASAM data is weekly, but
 *    Redis cache expires in ~25 h so intra-day refreshes are cheap).
 *  - Clears data when disabled.
 */
export const useASAMIncidents = (
  bounds: BoundingBox | null,
  enabled: boolean = false,
  days: number = 365,
  threatMin: number = 0,
) => {
  const [asamData, setAsamData] = useState<FeatureCollection | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const lastBoundsRef = useRef<string>("");

  useEffect(() => {
    if (!enabled || !bounds) {
      if (asamData !== null) setAsamData(null);
      lastBoundsRef.current = "";
      return;
    }

    const boundsKey = `${bounds.minLat},${bounds.minLon},${bounds.maxLat},${bounds.maxLon}`;

    const fetchASAM = async () => {
      setIsLoading(true);
      try {
        const url =
          `/api/asam/incidents` +
          `?min_lat=${bounds.minLat}&min_lon=${bounds.minLon}` +
          `&max_lat=${bounds.maxLat}&max_lon=${bounds.maxLon}` +
          `&days=${days}&threat_min=${threatMin}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`ASAM fetch failed: ${res.status}`);
        const data: unknown = await res.json();
        if (
          typeof data === "object" &&
          data !== null &&
          (data as { type?: unknown }).type === "FeatureCollection"
        ) {
          setAsamData(data as FeatureCollection);
          lastBoundsRef.current = boundsKey;
        }
      } catch (err) {
        console.warn("ASAM incidents fetch failed:", err);
      } finally {
        setIsLoading(false);
      }
    };

    // Debounce: skip if same bbox, else wait 500 ms before fetching
    if (boundsKey === lastBoundsRef.current) return;
    const timer = setTimeout(fetchASAM, 500);

    // Refresh every 6 hours — ASAM data changes weekly, but stay fresh
    const refreshInterval = setInterval(fetchASAM, 6 * 60 * 60 * 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(refreshInterval);
    };
  }, [bounds, enabled, days, threatMin]);

  return { asamData, isLoading };
};
