import { useState, useEffect, useCallback } from 'react';
import { getAIConfig, setAIModel, AIConfig } from '../api/aiConfig';

export type UseAIConfigReturn = {
  config: AIConfig | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  selectModel: (modelId: string) => Promise<void>;
};

export function useAIConfig(): UseAIConfigReturn {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAIConfig()
      .then(data => { if (!cancelled) setConfig(data); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const selectModel = useCallback(async (modelId: string) => {
    if (!config || modelId === config.active_model) return;
    setIsSaving(true);
    setError(null);
    try {
      await setAIModel(modelId);
      setConfig(prev => prev ? { ...prev, active_model: modelId } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  }, [config]);

  return { config, isLoading, isSaving, error, selectModel };
}
