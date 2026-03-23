import { useEffect, useRef, useState, MutableRefObject, useCallback } from "react";
import type { SatNOGSStation } from "../types";

export interface UseSatNOGSResult {
  stationsRef: MutableRefObject<SatNOGSStation[]>;
  loading: boolean;
   
  fetchVerification: (noradId: string) => Promise<any>;
}

export function useSatNOGS(enabled: boolean): UseSatNOGSResult {
  const stationsRef = useRef<SatNOGSStation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      if (stationsRef.current.length > 0) stationsRef.current = [];
      return;
    }

    let cancelled = false;
    const fetchStations = async () => {
      setLoading(true);
      try {
        const resp = await fetch("/api/satnogs/stations");
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (!cancelled) {
          stationsRef.current = data;
        }
      } catch (err) {
        if (!cancelled) console.error("[useSatNOGS] fetch failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchStations();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const fetchVerification = useCallback(async (noradId: string) => {
    const resp = await fetch(`/api/satnogs/verify/${noradId}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  }, []);

  return { stationsRef, loading, fetchVerification };
}
