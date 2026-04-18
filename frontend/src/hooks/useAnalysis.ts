import { useState, useCallback, useRef } from 'react';
import { runDomainAnalysis, streamAnalysis } from '../api/analysis';
import type { CoTEntity } from '../types';

export type AnalysisState = {
  text: string;
  isStreaming: boolean;
  error: string | null;
  advisory: string | null;
  generatedAt: Date | null;
};

export type UseAnalysisReturn = AnalysisState & {
  run: (
    uid: string,
    lookbackHours: number,
    mode?: string,
    sitrepContext?: any,
    isSitrep?: boolean,
    entity?: CoTEntity | null,
  ) => Promise<void>;
  reset: () => void;
};

const INITIAL_STATE: AnalysisState = {
  text: '',
  isStreaming: false,
  error: null,
  advisory: null,
  generatedAt: null,
};

/**
 * Consumes the /api/analyze/{uid} SSE stream and exposes streaming state.
 * Handles reader cancellation on abort or unmount automatically.
 */
export function useAnalysis(): UseAnalysisReturn {
  const [state, setState] = useState<AnalysisState>(INITIAL_STATE);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const decoder = useRef(new TextDecoder());

  const reset = useCallback(() => {
    readerRef.current?.cancel().catch(() => undefined);
    readerRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  const run = useCallback(async (
    uid: string,
    lookbackHours: number,
    mode: string = 'tactical',
    sitrepContext?: any,
    isSitrep: boolean = false,
    entity?: CoTEntity | null,
  ) => {
    // Cancel any in-flight stream first
    readerRef.current?.cancel().catch(() => undefined);
    readerRef.current = null;

    setState({ text: '', isStreaming: true, error: null, advisory: null, generatedAt: null });

    try {
      // Use domain personas for air/sea/orbital CoT entities.
      if (!isSitrep && entity) {
        try {
          const domainResult = await runDomainAnalysis(entity, lookbackHours, mode);
          if (domainResult) {
            setState({
              text: domainResult.text,
              isStreaming: false,
              error: null,
              advisory: domainResult.advisory,
              generatedAt: new Date(),
            });
            return;
          }
        } catch (domainErr) {
          // Keep analyst UX resilient if domain endpoints are unavailable.
          console.warn('Domain analysis failed; falling back to legacy analyzer.', domainErr);
        }
      }

      const reader = await streamAnalysis(uid, lookbackHours, mode, sitrepContext, isSitrep);
      readerRef.current = reader;

      let buffer = '';
      let currentEventType = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode chunk and accumulate SSE lines
        buffer += decoder.current.decode(value, { stream: true });

        // SSE lines are separated by \n\n; each line prefixed with "data: "
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // keep incomplete trailing line

        for (let line of lines) {
          line = line.replace(/\r$/, '');
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const token = line.slice(6); // strip "data: " prefix
            if (currentEventType === 'error') {
              throw new Error(token);
            }
            setState(prev => ({ ...prev, text: prev.text + token }));
          } else if (line === '') {
            currentEventType = ''; // reset after blank line (end of SSE event)
          }
        }
      }

      setState(prev => ({
        ...prev,
        isStreaming: false,
        generatedAt: new Date(),
      }));
    } catch (err) {
      // AbortError or cancel — not a real error
      if (err instanceof Error && err.name === 'AbortError') {
        setState(prev => ({ ...prev, isStreaming: false }));
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      const overloaded = /temporarily overloaded|high demand|service unavailable|unavailable/i.test(message);
      setState(prev => ({
        ...prev,
        isStreaming: false,
        error: overloaded ? null : message,
        advisory: overloaded ? 'AI model temporarily overloaded. Please try again shortly.' : null,
      }));
    } finally {
      readerRef.current = null;
    }
  }, []);

  return { ...state, run, reset };
}
