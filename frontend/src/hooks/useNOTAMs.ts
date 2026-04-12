import type { FeatureCollection } from "geojson";
import { useEffect, useRef, useState } from "react";

/**
 * Fetches active FAA NOTAMs from /api/notam/active.
 *
 * Behaviour:
 *  - Only fetches when enabled=true.
 *  - Refreshes automatically every 10 minutes (FAA updates every ~5 min).
 *  - Clears data when disabled.
 */
export const useNOTAMs = (enabled: boolean = false) => {
  const [data, setData] = useState<FeatureCollection | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/notam/active");
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const json: unknown = await res.json();
        if (
          mountedRef.current &&
          typeof json === "object" &&
          json !== null &&
          (json as { type?: unknown }).type === "FeatureCollection"
        ) {
          setData(json as FeatureCollection);
        }
      } catch (err) {
        console.warn("useNOTAMs: fetch failed:", err);
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10 * 60 * 1000); // 10 minutes
    return () => clearInterval(interval);
  }, [enabled]);

  return { data, isLoading };
};
