/**
 * Hook for fetching and managing clausal chain narrative data.
 * Queries the backend for medial clauses within a region and time window.
 */

import { useState, useEffect, useCallback } from 'react';
import { ClausalChain } from '../layers/buildClausalChainLayer';

export interface UseClausalChainsOptions {
  region?: string; // H3 cell or mission area bounds
  lookback_hours?: number;
  source?: 'TAK_ADSB' | 'TAK_AIS' | 'GDELT' | 'ALL';
  enabled?: boolean;
}

interface UseClausalChainsState {
  data: ClausalChain[];
  loading: boolean;
  error: string | null;
  lastFetched: Date | null;
}

const INITIAL_STATE: UseClausalChainsState = {
  data: [],
  loading: false,
  error: null,
  lastFetched: null,
};

/**
 * Fetch clausal chains from the backend.
 */
export function useClausalChains(
  options: UseClausalChainsOptions = {}
): UseClausalChainsState & { refetch: () => Promise<void> } {
  const {
    region,
    lookback_hours = 24,
    source = 'ALL',
    enabled = true,
  } = options;

  const [state, setState] = useState<UseClausalChainsState>(INITIAL_STATE);

  const refetch = useCallback(async () => {
    if (!enabled || !region) {
      setState(prev => ({ ...prev, data: [] }));
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const params = new URLSearchParams({
        region,
        lookback_hours: lookback_hours.toString(),
      });
      if (source !== 'ALL') {
        params.set('source', source);
      }

      const response = await fetch(`/api/ai_router/clausal-chains?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('jwt_token') || ''}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const chains: ClausalChain[] = await response.json();
      setState(prev => ({
        ...prev,
        data: chains,
        loading: false,
        lastFetched: new Date(),
      }));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMsg,
      }));
    }
  }, [enabled, region, lookback_hours, source]);

  // Auto-fetch when dependencies change
  useEffect(() => {
    if (enabled && region) {
      refetch();
    } else {
      setState(INITIAL_STATE);
    }
  }, [enabled, region, lookback_hours, source, refetch]);

  return { ...state, refetch };
}

/**
 * Hook for fetching regional risk assessment (heatmap view).
 */
export interface RegionalRiskResponse {
  center_region: string;
  lookback_hours: number;
  heatmap?: Record<string, {
    risk_score: number;
    confidence: number;
    anomaly_count: number;
  }>;
  max_risk?: number;
  error?: string;
}

export function useRegionalRisk(
  h3_region?: string,
  lookback_hours: number = 24
): RegionalRiskResponse & { loading: boolean; refetch: () => Promise<void> } {
  const [state, setState] = useState<RegionalRiskResponse & { loading: boolean }>({
    center_region: h3_region || '',
    lookback_hours,
    loading: false,
  });

  const refetch = useCallback(async () => {
    if (!h3_region) return;

    setState(prev => ({ ...prev, loading: true }));

    try {
      const response = await fetch(
        `/api/ai_router/regional_risk?h3_region=${encodeURIComponent(h3_region)}&lookback_hours=${encodeURIComponent(String(lookback_hours))}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('jwt_token') || ''}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: RegionalRiskResponse = await response.json();
      setState(prev => ({ ...prev, ...data, loading: false }));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setState(prev => ({
        ...prev,
        error: errorMsg,
        loading: false,
      }));
    }
  }, [h3_region, lookback_hours]);

  useEffect(() => {
    if (h3_region) {
      refetch();
    }
  }, [h3_region, lookback_hours, refetch]);

  return { ...state, refetch };
}
