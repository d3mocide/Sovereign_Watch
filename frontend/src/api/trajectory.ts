import { getToken } from "./auth";

export interface HMMResult {
  uid: string;
  state_sequence: string[];
  dominant_state: string;
  confidence: number;
  anomaly_score: number;
  track_point_count: number;
}

export async function fetchTrajectory(
  uid: string,
  lookbackHours = 24,
): Promise<HMMResult | null> {
  const token = getToken();
  try {
    const res = await fetch(
      `/api/ai_router/trajectory/${encodeURIComponent(uid)}?lookback_hours=${lookbackHours}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
    if (!res.ok) return null;
    return (await res.json()) as HMMResult;
  } catch {
    return null;
  }
}
