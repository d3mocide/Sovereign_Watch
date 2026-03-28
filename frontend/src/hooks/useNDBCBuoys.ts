import type { FeatureCollection } from "geojson";
import { useEffect, useRef, useState } from "react";

interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/** Fetch NDBC buoy observations from /api/buoys/latest.
 *
 * Behaviour mirrors useTowers:
 *  - Only fetches when enabled=true and bounds are available.
 *  - Debounces bounds changes by 500 ms to avoid rapid pan/zoom spam.
 *  - Refreshes automatically every 15 minutes (NDBC cadence).
 *  - Clears data when disabled.
 */
export const useNDBCBuoys = (
  bounds: BoundingBox | null,
  enabled: boolean = false,
) => {
  const [buoyData, setBuoyData] = useState<FeatureCollection | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const lastBoundsRef = useRef<string>("");

  useEffect(() => {
    if (!enabled || !bounds) {
      if (buoyData !== null) setBuoyData(null);
      lastBoundsRef.current = "";
      return;
    }

    const boundsKey = `${bounds.minLat},${bounds.minLon},${bounds.maxLat},${bounds.maxLon}`;

    const fetchBuoys = async () => {
      setIsLoading(true);
      try {
        const url =
          `/api/buoys/latest` +
          `?min_lat=${bounds.minLat}&min_lon=${bounds.minLon}` +
          `&max_lat=${bounds.maxLat}&max_lon=${bounds.maxLon}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`NDBC fetch failed: ${res.status}`);
        const data: unknown = await res.json();
        if (
          typeof data === "object" &&
          data !== null &&
          (data as { type?: unknown }).type === "FeatureCollection"
        ) {
          setBuoyData(data as FeatureCollection);
          lastBoundsRef.current = boundsKey;
        }
      } catch (err) {
        console.warn("NDBC buoys fetch failed:", err);
      } finally {
        setIsLoading(false);
      }
    };

    // Debounce: skip if same bbox, else wait 500 ms before fetching
    if (boundsKey === lastBoundsRef.current) return;
    const timer = setTimeout(fetchBuoys, 500);

    // Refresh every 15 minutes regardless of bbox changes
    const refreshInterval = setInterval(fetchBuoys, 15 * 60 * 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(refreshInterval);
    };
  }, [bounds, enabled]);

  return { buoyData, isLoading };
};
