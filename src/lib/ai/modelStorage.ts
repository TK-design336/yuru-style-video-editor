import { AI_PROVIDER_CONFIG, type AiProvider } from "@/lib/ai/providers";

const STORAGE_KEYS: Record<AiProvider, string> = {
  claude: "yuru-claude-model",
  openai: "yuru-openai-model",
  gemini: "yuru-gemini-model",
};

export function readStoredModel(provider: AiProvider): string | null {
  try {
    const value = localStorage.getItem(STORAGE_KEYS[provider]);
    if (!value?.trim()) return null;
    return value.trim();
  } catch {
    return null;
  }
}

export function writeStoredModel(provider: AiProvider, model: string): void {
  localStorage.setItem(STORAGE_KEYS[provider], model.trim());
}

export function clearStoredModel(provider: AiProvider): void {
  localStorage.removeItem(STORAGE_KEYS[provider]);
}

export function getDefaultModel(provider: AiProvider): string {
  return AI_PROVIDER_CONFIG[provider].model;
}

export function getModel(provider: AiProvider): string {
  return readStoredModel(provider) ?? getDefaultModel(provider);
}
