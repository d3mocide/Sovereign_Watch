import { useState, useEffect, useCallback } from 'react';
import type { WebSDRNode } from '../types';
import { resolveHttpUrl } from '../utils/network';

const getNodesUrl = () => {
  return resolveHttpUrl(import.meta.env.VITE_JS8_BASE_URL, '/js8/api/websdr/nodes');
};

const NODES_URL = getNodesUrl();
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useWebSDRNodes(
  freqKhz: number,
  enabled: boolean,
  radiusKm?: number,
  limit?: number,
  vhfOnly?: boolean,
) {
  const [nodes, setNodes] = useState<WebSDRNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNodes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (freqKhz > 0) params.set('freq', String(freqKhz));
      if (limit !== undefined) params.set('limit', String(limit));
      if (radiusKm !== undefined && radiusKm > 0) params.set('radius_km', String(radiusKm));
      if (vhfOnly) params.set('vhf_only', 'true');

      const res = await fetch(`${NODES_URL}?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: WebSDRNode[] = await res.json();
      setNodes(data);
      setError(null);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to fetch WebSDR node list');
    } finally {
      setLoading(false);
    }
  }, [freqKhz, radiusKm, limit, vhfOnly]);

  useEffect(() => {
    if (!enabled) return;
    fetchNodes();
    const id = setInterval(fetchNodes, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, fetchNodes]);

  return { nodes, loading, error, refetch: fetchNodes };
}
