export interface AIModel {
  id: string;
  label: string;
  provider: string;
  local: boolean;
}

export interface AIConfig {
  active_model: string;
  available_models: AIModel[];
}

export async function getAIConfig(): Promise<AIConfig> {
  const res = await fetch('/api/config/ai');
  if (!res.ok) throw new Error(`Failed to fetch AI config (${res.status})`);
  return res.json();
}

export async function setAIModel(modelId: string): Promise<void> {
  const res = await fetch('/api/config/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_id: modelId }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Failed to set AI model (${res.status}): ${text}`);
  }
}
