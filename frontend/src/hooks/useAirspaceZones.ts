import type { FeatureCollection } from "geojson";
import { useEffect, useRef, useState } from "react";

/**
 * Fetches active global airspace zones from /api/airspace/zones.
 *
 * Source: OpenAIP (api.core.openaip.net) — free, global, no .gov account.
 * Covers: RESTRICTED, DANGER, PROHIBITED, WARNING, TRA, TSA, ADIZ zones.
 *
 * Behaviour:
 *  - Only fetches when enabled=true.
 *  - Refreshes every 6 hours (data is updated daily at source).
 *  - Clears data when disabled.
 */
export const useAirspaceZones = (enabled: boolean = false) => {
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
        const res = await fetch("/api/airspace/zones");
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
        console.warn("useAirspaceZones: fetch failed:", err);
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    };

    fetchData();
    // Refresh every 6 hours — source data updates daily
    const interval = setInterval(fetchData, 6 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [enabled]);

  return { data, isLoading };
};
