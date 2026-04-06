import { getToken } from "./auth";

export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface H3RiskCellData {
  cell: string;
  lat: number;
  lon: number;
  density: number;
  sentiment: number;
  risk_score: number;
  severity: RiskSeverity;
}

export async function fetchH3Risk(
  resolution: number,
  hours = 24,
): Promise<H3RiskCellData[]> {
  const token = getToken();
  try {
    const res = await fetch(
      `/api/h3/risk?resolution=${resolution}&hours=${hours}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.cells ?? []) as H3RiskCellData[];
  } catch {
    return [];
  }
}
