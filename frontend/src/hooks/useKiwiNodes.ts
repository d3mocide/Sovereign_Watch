import { useState, useEffect, useCallback } from 'react';
import type { KiwiNode } from '../types';

const getNODES_URL = () => {
  const envUrl = import.meta.env.VITE_JS8_BASE_URL;
  if (envUrl && !envUrl.includes('localhost')) {
    return `${envUrl}/api/kiwi/nodes`;
  }
  return `${window.location.protocol}//${window.location.host}/js8/api/kiwi/nodes`;
};

const NODES_URL = getNODES_URL();

const POLL_INTERVAL_MS = 5 * 60 * 1000; // refresh every 5 minutes

export function useKiwiNodes(freqKhz: number, enabled: boolean, radiusKm?: number, limit?: number) {
  const [nodes, setNodes] = useState<KiwiNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNodes = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${NODES_URL}?freq=${freqKhz}`;
      if (limit !== undefined) {
        url += `&limit=${limit}`;
      }
      if (radiusKm !== undefined && radiusKm > 0) {
        url += `&radius_km=${radiusKm}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: KiwiNode[] = await res.json();
      setNodes(data);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to fetch node list');
    } finally {
      setLoading(false);
    }
  }, [freqKhz, radiusKm, limit]);

  useEffect(() => {
    if (!enabled) return;
    fetchNodes();
    const id = setInterval(fetchNodes, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, fetchNodes]);

  return { nodes, loading, error, refetch: fetchNodes };
}
