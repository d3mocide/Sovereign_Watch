import { useState, useEffect, useCallback, useRef } from 'react';
import { PassResult } from '../types';

interface UsePassPredictionsOptions {
  hours?: number;
  minElevation?: number;
  noradIds?: string[];
  category?: string;
  /** When true, no fetch is issued and passes stays empty. */
  skip?: boolean;
}

interface UsePassPredictionsResult {
  passes: PassResult[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function usePassPredictions(
  observerLat: number,
  observerLon: number,
  options: UsePassPredictionsOptions = {},
): UsePassPredictionsResult {
  const { hours = 6, minElevation = 10, noradIds, category, skip = false } = options;

  const [passes, setPasses] = useState<PassResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [triggerCount, setTriggerCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const refetch = useCallback(() => {
    setTriggerCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (skip) {
      setPasses([]);
      setLoading(false);
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    const fetchPasses = async () => {
      setLoading(true);
      setError(null);
      setPasses([]);

      try {
        const params = new URLSearchParams({
          lat: String(observerLat),
          lon: String(observerLon),
          hours: String(hours),
          min_elevation: String(minElevation),
        });

        if (noradIds && noradIds.length > 0) {
          params.set('norad_ids', noradIds.join(','));
        }
        if (category) {
          params.set('category', category);
        }

        const response = await fetch(`/api/orbital/passes?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Pass prediction API returned ${response.status}`);
        }

        const data: PassResult[] = await response.json();
        setPasses(data);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(err instanceof Error ? err.message : 'Unknown error fetching passes');
      } finally {
        setLoading(false);
      }
    };

    fetchPasses();
    const timer = setInterval(fetchPasses, POLL_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      controller.abort();
    };
     
  }, [skip, observerLat, observerLon, hours, minElevation, noradIds?.join(','), category, triggerCount]);

  return { passes, loading, error, refetch };
}
