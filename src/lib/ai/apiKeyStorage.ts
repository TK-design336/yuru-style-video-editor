import {
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER,
  type AiProvider,
} from "@/lib/ai/providers";

const ACTIVE_PROVIDER_KEY = "yuru-ai-active-provider";

const STORAGE_KEYS: Record<AiProvider, string> = {
  claude: "yuru-anthropic-api-key",
  openai: "yuru-openai-api-key",
  gemini: "yuru-gemini-api-key",
};

const ENV_KEYS: Record<AiProvider, string> = {
  claude: "VITE_ANTHROPIC_API_KEY",
  openai: "VITE_OPENAI_API_KEY",
  gemini: "VITE_GEMINI_API_KEY",
};

function readEnvKey(provider: AiProvider): string | null {
  const envKey = ENV_KEYS[provider];
  const fromEnv = import.meta.env[envKey];
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim();
  }
  return null;
}

export function readStoredApiKey(provider: AiProvider): string | null {
  try {
    const value = localStorage.getItem(STORAGE_KEYS[provider]);
    if (!value?.trim()) return null;
    return value.trim();
  } catch {
    return null;
  }
}

export function writeStoredApiKey(provider: AiProvider, key: string): void {
  localStorage.setItem(STORAGE_KEYS[provider], key.trim());
}

export function clearStoredApiKey(provider: AiProvider): void {
  localStorage.removeItem(STORAGE_KEYS[provider]);
}

/** UI で保存したキー → .env の順で参照 */
export function getApiKey(provider: AiProvider): string | null {
  const stored = readStoredApiKey(provider);
  if (stored) return stored;
  return readEnvKey(provider);
}

/** @deprecated getApiKey("claude") を使用 */
export function getAnthropicApiKey(): string | null {
  return getApiKey("claude");
}

export function hasApiKey(provider: AiProvider): boolean {
  return getApiKey(provider) !== null;
}

export function readActiveProvider(): AiProvider {
  try {
    const value = localStorage.getItem(ACTIVE_PROVIDER_KEY);
    if (value && AI_PROVIDERS.includes(value as AiProvider)) {
      return value as AiProvider;
    }
  } catch {
    // ignore
  }
  return DEFAULT_AI_PROVIDER;
}

export function writeActiveProvider(provider: AiProvider): void {
  localStorage.setItem(ACTIVE_PROVIDER_KEY, provider);
}

export function getActiveProvider(): AiProvider {
  return readActiveProvider();
}

export function getActiveApiKey(): string | null {
  return getApiKey(getActiveProvider());
}

export function hasActiveProviderKey(): boolean {
  return getActiveApiKey() !== null;
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}
