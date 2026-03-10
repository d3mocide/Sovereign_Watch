import { useState, useEffect, useCallback } from 'react';
import type { KiwiNode } from '../types';

const NODES_URL =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_JS8_BASE_URL
    ? `${import.meta.env.VITE_JS8_BASE_URL}/api/kiwi/nodes`
    : 'http://localhost:8080/api/kiwi/nodes';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // refresh every 5 minutes

export function useKiwiNodes(freqKhz: number, enabled: boolean, radiusKm?: number) {
  const [nodes, setNodes] = useState<KiwiNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNodes = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${NODES_URL}?freq=${freqKhz}&limit=20`;
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
  }, [freqKhz, radiusKm]);

  useEffect(() => {
    if (!enabled) return;
    fetchNodes();
    const id = setInterval(fetchNodes, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, fetchNodes]);

  return { nodes, loading, error, refetch: fetchNodes };
}
