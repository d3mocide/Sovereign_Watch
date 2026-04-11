import { getToken } from "./auth";

export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface H3RiskSourceScope {
  scope: string;
  linkage_reason: string;
  lookback_hours: number;
  notes: string;
}

export interface H3RiskCellData {
  cell: string;
  lat: number;
  lon: number;
  density: number;
  sentiment: number;
  outage?: number;
  risk_score: number;
  severity: RiskSeverity;
}

export interface H3RiskResponseData {
  cells: H3RiskCellData[];
  resolution: number;
  generated_at: string;
  source_scope?: H3RiskSourceScope | null;
}

interface H3RiskMissionQuery {
  h3Region?: string;
  lat?: number;
  lon?: number;
  radiusNm?: number;
}

function buildMissionQuery(query?: H3RiskMissionQuery): string {
  if (!query) return "";
  const params = new URLSearchParams();
  if (query.h3Region) params.set("h3_region", query.h3Region);
  if (typeof query.lat === "number") params.set("lat", String(query.lat));
  if (typeof query.lon === "number") params.set("lon", String(query.lon));
  if (typeof query.radiusNm === "number") params.set("radius_nm", String(query.radiusNm));
  const suffix = params.toString();
  return suffix ? `&${suffix}` : "";
}

export async function fetchH3RiskResponse(
  resolution: number,
  hours = 24,
  missionQuery?: H3RiskMissionQuery,
): Promise<H3RiskResponseData | null> {
  const token = getToken();
  try {
    const res = await fetch(
      `/api/h3/risk?resolution=${resolution}&hours=${hours}${buildMissionQuery(missionQuery)}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
    if (!res.ok) return null;
    return (await res.json()) as H3RiskResponseData;
  } catch {
    return null;
  }
}

export async function fetchH3Risk(
  resolution: number,
  hours = 24,
): Promise<H3RiskCellData[]> {
  const data = await fetchH3RiskResponse(resolution, hours);
  return data?.cells ?? [];
}

export async function fetchMissionH3Risk(
  resolution: number,
  missionQuery: H3RiskMissionQuery,
  hours = 24,
): Promise<H3RiskResponseData | null> {
  return fetchH3RiskResponse(resolution, hours, missionQuery);
}
