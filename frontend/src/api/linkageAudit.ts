export interface GdeltLinkageAuditEvent {
  event_id_cnty?: string;
  event_id?: string;
  event_date?: string;
  time?: string;
  event_text?: string;
  actor1_country?: string;
  actor2_country?: string;
  quad_class?: number;
  goldstein?: number;
  linkage_tier?: string;
  linkage_score?: number;
  experimental_reasons?: string[];
}

export interface GdeltLinkageAuditResponse {
  reference_version: string;
  mission_country_code: string | null;
  counts: Record<string, number>;
  sample: GdeltLinkageAuditEvent[];
  country_sets: {
    second_order: string[];
    alliance_support: string[];
    basing_support: string[];
  };
}

export interface GdeltLinkageAuditRequest {
  hours: number;
  h3Region?: string;
  lat?: number;
  lon?: number;
  radiusNm?: number;
}

export async function fetchGdeltLinkageAudit(
  request: GdeltLinkageAuditRequest,
): Promise<GdeltLinkageAuditResponse> {
  const params = new URLSearchParams({
    hours: String(request.hours),
  });

  if (request.h3Region) {
    params.set("h3_region", request.h3Region);
  } else if (
    request.lat !== undefined &&
    request.lon !== undefined &&
    request.radiusNm !== undefined
  ) {
    params.set("lat", String(request.lat));
    params.set("lon", String(request.lon));
    params.set("radius_nm", String(request.radiusNm));
  } else {
    throw new Error("Mission mode is required for linkage review");
  }

  const response = await fetch("/api/gdelt/linkage-audit?" + params.toString());
  if (!response.ok) {
    const text = await response.text().catch((e) => response.statusText);
    throw new Error(`Linkage audit failed (${response.status}): ${text}`);
  }

  return (await response.json()) as GdeltLinkageAuditResponse;
}
