import { useState, useCallback, useRef } from 'react';
import { streamAnalysis } from '../api/analysis';

export type AnalysisState = {
  text: string;
  isStreaming: boolean;
  error: string | null;
  generatedAt: Date | null;
};

export type UseAnalysisReturn = AnalysisState & {
  run: (uid: string, lookbackHours: number) => Promise<void>;
  reset: () => void;
};

const INITIAL_STATE: AnalysisState = {
  text: '',
  isStreaming: false,
  error: null,
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

  const run = useCallback(async (uid: string, lookbackHours: number) => {
    // Cancel any in-flight stream first
    readerRef.current?.cancel().catch(() => undefined);
    readerRef.current = null;

    setState({ text: '', isStreaming: true, error: null, generatedAt: null });

    try {
      const reader = await streamAnalysis(uid, lookbackHours);
      readerRef.current = reader;

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode chunk and accumulate SSE lines
        buffer += decoder.current.decode(value, { stream: true });

        // SSE lines are separated by \n\n; each line prefixed with "data: "
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // keep incomplete trailing line

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const token = line.slice(6); // strip "data: " prefix
            setState(prev => ({ ...prev, text: prev.text + token }));
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
      setState(prev => ({ ...prev, isStreaming: false, error: message }));
    } finally {
      readerRef.current = null;
    }
  }, []);

  return { ...state, run, reset };
}
