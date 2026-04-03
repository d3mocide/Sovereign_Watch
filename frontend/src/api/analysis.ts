/**
 * Analysis API client — wraps the POST /api/analyze/{uid} SSE endpoint.
 */

export interface AnalyzeRequest {
  uid: string;
  lookback_hours: number;
  mode: string;
  sitrep_context?: any;
  is_sitrep?: boolean;
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
