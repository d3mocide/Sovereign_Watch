/**
 * Analysis API client — wraps the POST /api/analyze/{uid} SSE endpoint.
 */

import { latLngToCell } from "h3-js";
import type { CoTEntity } from "../types";

export interface AnalyzeRequest {
  uid: string;
  lookback_hours: number;
  mode: string;
  sitrep_context?: any;
  is_sitrep?: boolean;
}

type DomainKind = "air" | "sea" | "orbital";

export interface DomainAnalysisRequest {
  h3_region: string;
  lookback_hours: number;
  mode?: string;
}

export interface DomainAnalysisResponse {
  domain: DomainKind;
  h3_region: string;
  risk_score: number;
  narrative: string;
  indicators: string[];
  context_snapshot: Record<string, unknown>;
  ai_status?: string | null;
  ai_notice?: string | null;
}

export interface DomainAnalysisResult {
  text: string;
  advisory: string | null;
}

function inferDomainFromEntity(entity: CoTEntity | null): DomainKind | null {
  if (!entity) return null;

  const type = entity.type || "";
  const isSea = !!entity.vesselClassification || type.includes("S");
  if (isSea) return "sea";

  const isOrbital =
    type === "a-s-K" ||
    type.indexOf("K") === 4 ||
    String(entity.detail?.category || "").toLowerCase().includes("orbital") ||
    String(entity.detail?.constellation || "").length > 0;
  if (isOrbital) return "orbital";

  const isAir = type.startsWith("a-") || type.includes("A");
  if (isAir) return "air";

  return null;
}

function formatDomainAnalysisText(resp: DomainAnalysisResponse): string {
  const riskPct = Math.round(Math.max(0, Math.min(1, resp.risk_score)) * 100);
  const indicators = (resp.indicators || []).slice(0, 12);
  const contextEntries = Object.entries(resp.context_snapshot || {}).slice(0, 8);

  const lines: string[] = [
    `### ${resp.domain.toUpperCase()} DOMAIN ASSESSMENT`,
    `- **Risk Score:** ${riskPct}%`,
    `- **Region:** ${resp.h3_region}`,
  ];

  if (indicators.length > 0) {
    lines.push("### KEY INDICATORS");
    for (const item of indicators) lines.push(`- ${item}`);
  }

  if (resp.narrative?.trim()) {
    lines.push("### NARRATIVE");
    lines.push(resp.narrative.trim());
  }

  if (contextEntries.length > 0) {
    lines.push("### CONTEXT SNAPSHOT");
    for (const [k, v] of contextEntries) {
      const value =
        v === null || v === undefined
          ? "n/a"
          : typeof v === "object"
            ? JSON.stringify(v)
            : String(v);
      lines.push(`- ${k}: ${value}`);
    }
  }

  return lines.join("\n");
}

/**
 * Routes entity analysis to domain-specific endpoints when possible.
 * Returns formatted text for direct rendering in the analyst panel.
 */
export async function runDomainAnalysis(
  entity: CoTEntity,
  lookbackHours: number,
  mode: string = "tactical",
): Promise<DomainAnalysisResult | null> {
  const domain = inferDomainFromEntity(entity);
  if (!domain) return null;

  const h3Region = latLngToCell(entity.lat, entity.lon, 7);
  const body: DomainAnalysisRequest = {
    h3_region: h3Region,
    lookback_hours: lookbackHours,
    mode: mode,
  };

  const response = await fetch(`/api/ai_router/analyze/${domain}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Domain analysis failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as DomainAnalysisResponse;
  return {
    text: formatDomainAnalysisText(data),
    advisory:
      data.ai_status === "overloaded"
        ? (data.ai_notice ?? "AI model temporarily overloaded. Please try again shortly.")
        : null,
  };
}

/**
 * Opens a streaming connection to the AI analysis endpoint.
 * Returns a ReadableStreamDefaultReader that yields raw SSE data strings.
 * The caller is responsible for cancelling the reader when done.
 */
export async function streamAnalysis(
  uid: string,
  lookbackHours: number,
  mode: string = 'tactical',
  sitrepContext?: any,
  isSitrep: boolean = false
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const response = await fetch(`/api/analyze/${encodeURIComponent(uid)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      uid, 
      lookback_hours: lookbackHours, 
      mode,
      sitrep_context: sitrepContext,
      is_sitrep: isSitrep
    } satisfies AnalyzeRequest),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Analysis request failed (${response.status}): ${text}`);
  }

  if (!response.body) {
    throw new Error('No response body from analysis endpoint');
  }

  return response.body.getReader();
}
