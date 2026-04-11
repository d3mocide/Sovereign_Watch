export interface GdeltLinkageReviewEvent {
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
  experimental_evidence?: Record<string, unknown>;
  live_admitted?: boolean;
  live_linkage_tier?: string;
  live_linkage_score?: number;
}

export interface GdeltLinkageReviewResponse {
  reference_version: string;
  mission_country_code: string | null;
  live: {
    counts: Record<string, number>;
    sample: GdeltLinkageReviewEvent[];
  };
  experimental: {
    counts: Record<string, number>;
    sample: GdeltLinkageReviewEvent[];
    country_sets: {
      second_order_only: string[];
      alliance_support: string[];
      basing_support: string[];
    };
  };
  comparison: {
    overlap_count: number;
    live_only_count: number;
    experimental_only_count: number;
  };
}

export interface GdeltLinkageReviewRequest {
  hours: number;
  h3Region?: string;
  lat?: number;
  lon?: number;
  radiusNm?: number;
}

export async function fetchGdeltLinkageReview(
  request: GdeltLinkageReviewRequest,
): Promise<GdeltLinkageReviewResponse> {
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

  const response = await fetch(`/api/gdelt/linkage-review?${params.toString()}`);
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Linkage review failed (${response.status}): ${text}`);
  }

  return (await response.json()) as GdeltLinkageReviewResponse;
}