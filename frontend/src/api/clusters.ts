import { getToken } from "./auth";

export interface ClusterInfo {
  cluster_id: string;
  uids: string[];
  centroid_lat: number;
  centroid_lon: number;
  entity_count: number;
  start_time: string;
  end_time: string;
}

export interface ClusterResponse {
  clusters: ClusterInfo[];
  total_clusters: number;
  noise_count: number;
}

export async function fetchClusters(
  h3Region: string,
  lookbackHours = 24,
  epsKm = 2.0,
  minSamples = 5,
): Promise<ClusterResponse> {
  const token = getToken();
  try {
    const params = new URLSearchParams({
      h3_region: h3Region,
      lookback_hours: String(lookbackHours),
      eps_km: String(epsKm),
      min_samples: String(minSamples),
    });
    const res = await fetch(`/api/ai_router/clusters?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return { clusters: [], total_clusters: 0, noise_count: 0 };
    return (await res.json()) as ClusterResponse;
  } catch {
    return { clusters: [], total_clusters: 0, noise_count: 0 };
  }
}
