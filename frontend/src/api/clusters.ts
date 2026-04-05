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

export interface ClusterParams {
  h3Region?: string;
  lat?: number;
  lon?: number;
  radiusNm?: number;
  lookbackHours?: number;
  epsKm?: number;
  minSamples?: number;
}

export async function fetchClusters(
  params: ClusterParams,
): Promise<ClusterResponse> {
  const token = getToken();
  try {
    const urlParams = new URLSearchParams();
    if (params.h3Region) urlParams.append("h3_region", params.h3Region);
    if (params.lat !== undefined) urlParams.append("lat", String(params.lat));
    if (params.lon !== undefined) urlParams.append("lon", String(params.lon));
    if (params.radiusNm !== undefined) urlParams.append("radius_nm", String(params.radiusNm));
    
    urlParams.append("lookback_hours", String(params.lookbackHours || 24));
    urlParams.append("eps_km", String(params.epsKm || 2.0));
    urlParams.append("min_samples", String(params.minSamples || 5));
    const res = await fetch(`/api/ai_router/clusters?${urlParams.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return { clusters: [], total_clusters: 0, noise_count: 0 };
    return (await res.json()) as ClusterResponse;
  } catch {
    return { clusters: [], total_clusters: 0, noise_count: 0 };
  }
}
