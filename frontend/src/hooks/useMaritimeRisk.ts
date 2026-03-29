import { useEffect, useRef, useState } from "react";

export interface AdvisoryIncidentBrief {
  reference: string;
  hostility: string | null;
  victim: string | null;
  threat_score: number;
  incident_date: string;
  distance_nm: number;
}

export interface SeaStateBrief {
  buoy_id: string;
  wvht_m: number | null;
  avg_wvht_m: number | null;
  wvht_zscore: number | null;
  distance_nm: number;
}

export interface MaritimeRiskReport {
  mmsi: string;
  lat: number;
  lon: number;
  radius_nm: number;
  threat_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  composite_score: number;
  incident_max_score: number;
  incident_count: number;
  nearby_incidents: AdvisoryIncidentBrief[];
  sea_state_anomaly: boolean;
  sea_state: SeaStateBrief[];
}

/** Fetch maritime conditions assessment for a selected vessel.
 *
 * Behaviour:
 *  - Fetches immediately when mmsi/lat/lon are provided.
 *  - Auto-refreshes every 30 seconds while the vessel remains selected.
 *  - Clears data when mmsi becomes null (vessel deselected).
 *  - Returns null while loading or when no vessel is selected.
 */
export function useMaritimeRisk(
  mmsi: string | null,
  lat: number | null,
  lon: number | null,
  radiusNm: number = 100,
) {
  const [report, setReport] = useState<MaritimeRiskReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!mmsi || lat === null || lon === null) {
      setReport(null);
      setError(null);
      return;
    }

    const fetchRisk = async () => {
      // Cancel any in-flight request
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setIsLoading(true);
      setError(null);
      try {
        const url =
          `/api/maritime/risk-assessment` +
          `?mmsi=${encodeURIComponent(mmsi)}` +
          `&lat=${lat}&lon=${lon}&radius_nm=${radiusNm}`;
        const res = await fetch(url, { signal: abortRef.current.signal });
        if (!res.ok) throw new Error(`Risk fetch failed: ${res.status}`);
        const data = (await res.json()) as MaritimeRiskReport;
        setReport(data);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.warn("Maritime conditions fetch failed:", err);
        setError("Risk data unavailable");
      } finally {
        setIsLoading(false);
      }
    };

    fetchRisk();
    const interval = setInterval(fetchRisk, 30_000);

    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [mmsi, lat, lon, radiusNm]);

  return { report, isLoading, error };
}
