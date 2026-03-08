import { useEffect, useRef, useState, MutableRefObject } from "react";
import type { RFSite, RFService, RFMode } from "../types";

const API_BASE = "/api/rf/sites";
const DEFAULT_RADIUS_NM = 150;
// Minimum distance (degrees) the mission centre must move before a refetch
const REFETCH_THRESHOLD_DEG = 0.25;

export interface UseRFSitesResult {
  rfSitesRef: MutableRefObject<RFSite[]>;
  rfSites: RFSite[];
  loading: boolean;
  error: string | null;
}

export function useRFSites(
  enabled: boolean,
  missionLat: number,
  missionLon: number,
  radiusNm: number = DEFAULT_RADIUS_NM,
  service?: RFService,
  modes?: RFMode[],
  emcomm_only?: boolean
): UseRFSitesResult {
  const rfSitesRef = useRef<RFSite[]>([]);
  const [rfSites, setRfSites] = useState<RFSite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastFetchRef = useRef<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const modeStr = modes && modes.length > 0 ? modes.sort().join(",") : "all";
    const serviceStr = service || "all";
    const emcommStr = emcomm_only ? "true" : "false";

    const CACHE_KEY = `rf_sites_cache_${missionLat.toFixed(2)}_${missionLon.toFixed(2)}_${serviceStr}_${modeStr}_${emcommStr}`;
    const CACHE_TS_KEY = `${CACHE_KEY}_ts`;
    const CACHE_TTL = 3600 * 1000; // 1 hour

    // Skip if the mission centre hasn't moved significantly
    const last = lastFetchRef.current;
    if (last) {
      const dLat = Math.abs(missionLat - last.lat);
      const dLon = Math.abs(missionLon - last.lon);
      if (dLat < REFETCH_THRESHOLD_DEG && dLon < REFETCH_THRESHOLD_DEG) return;
    }

    let cancelled = false;

    const fetchSites = async () => {
      setLoading(true);
      setError(null);

      // 1. Check local cache first
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        const cachedTs = localStorage.getItem(CACHE_TS_KEY);
        if (cached && cachedTs && (Date.now() - parseInt(cachedTs)) < CACHE_TTL) {
          const parsed = JSON.parse(cached);
          rfSitesRef.current = parsed;
          setRfSites(parsed);
          setLoading(false);
          lastFetchRef.current = { lat: missionLat, lon: missionLon };
          return;
        }
      } catch (e) {
        console.warn("RF sites cache read failed:", e);
      }

      // 2. Fetch fresh
      try {
        let url = `${API_BASE}?lat=${missionLat}&lon=${missionLon}&radius_nm=${radiusNm}`;
        if (service) url += `&service=${service}`;
        if (emcomm_only) url += `&emcomm_only=true`;
        if (modes && modes.length > 0) {
          for (const m of modes) {
             url += `&modes=${m}`;
          }
        }

        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data: { count: number; results: RFSite[] } = await resp.json();

        if (!cancelled) {
          const results = data.results ?? [];
          rfSitesRef.current = results;
          setRfSites(results);
          lastFetchRef.current = { lat: missionLat, lon: missionLon };

          // Update cache
          localStorage.setItem(CACHE_KEY, JSON.stringify(results));
          localStorage.setItem(CACHE_TS_KEY, Date.now().toString());
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to fetch RF sites");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSites();
    return () => {
      cancelled = true;
    };
  }, [enabled, missionLat, missionLon, radiusNm, service, modes, emcomm_only]);

  // Clear data when layer is disabled
  useEffect(() => {
    if (!enabled) {
      rfSitesRef.current = [];
      setRfSites([]);
      lastFetchRef.current = null;
    }
  }, [enabled]);

  return { rfSitesRef, rfSites, loading, error };
}
