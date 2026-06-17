import { create } from "zustand";
import {
  clearStoredApiKey,
  getApiKey,
  getActiveProvider,
  hasActiveProviderKey,
  hasApiKey,
  readStoredApiKey,
  writeActiveProvider,
  writeStoredApiKey,
} from "@/lib/ai/apiKeyStorage";
import {
  clearStoredModel,
  getDefaultModel,
  getModel,
  readStoredModel,
  writeStoredModel,
} from "@/lib/ai/modelStorage";
import { AI_PROVIDERS, type AiProvider } from "@/lib/ai/providers";

type StoredKeys = Record<AiProvider, string | null>;
type ConfiguredKeys = Record<AiProvider, boolean>;
type StoredModels = Record<AiProvider, string | null>;
type EffectiveModels = Record<AiProvider, string>;

function readStoredKeys(): StoredKeys {
  return Object.fromEntries(
    AI_PROVIDERS.map((provider) => [provider, readStoredApiKey(provider)]),
  ) as StoredKeys;
}

function readConfiguredKeys(): ConfiguredKeys {
  return Object.fromEntries(
    AI_PROVIDERS.map((provider) => [provider, hasApiKey(provider)]),
  ) as ConfiguredKeys;
}

function readStoredModels(): StoredModels {
  return Object.fromEntries(
    AI_PROVIDERS.map((provider) => [provider, readStoredModel(provider)]),
  ) as StoredModels;
}

function readEffectiveModels(): EffectiveModels {
  return Object.fromEntries(
    AI_PROVIDERS.map((provider) => [provider, getModel(provider)]),
  ) as EffectiveModels;
}

interface AiSettingsState {
  activeProvider: AiProvider;
  storedKeys: StoredKeys;
  configuredKeys: ConfiguredKeys;
  storedModels: StoredModels;
  effectiveModels: EffectiveModels;
  hasActiveProviderKey: boolean;
  refreshKeyStatus: () => void;
  setActiveProvider: (provider: AiProvider) => void;
  saveApiKey: (provider: AiProvider, key: string) => void;
  clearApiKey: (provider: AiProvider) => void;
  saveModel: (provider: AiProvider, model: string) => void;
  clearModel: (provider: AiProvider) => void;
}

function snapshot(): Pick<
  AiSettingsState,
  | "storedKeys"
  | "configuredKeys"
  | "storedModels"
  | "effectiveModels"
  | "hasActiveProviderKey"
  | "activeProvider"
> {
  const activeProvider = getActiveProvider();
  return {
    activeProvider,
    storedKeys: readStoredKeys(),
    configuredKeys: readConfiguredKeys(),
    storedModels: readStoredModels(),
    effectiveModels: readEffectiveModels(),
    hasActiveProviderKey: hasActiveProviderKey(),
  };
}

export const useAiSettingsStore = create<AiSettingsState>((set) => ({
  ...snapshot(),

  refreshKeyStatus: () => {
    set(snapshot());
  },

  setActiveProvider: (provider) => {
    writeActiveProvider(provider);
    set({
      activeProvider: provider,
      hasActiveProviderKey: getApiKey(provider) !== null,
    });
  },

  saveApiKey: (provider, key) => {
    const trimmed = key.trim();
    if (!trimmed) return;
    writeStoredApiKey(provider, trimmed);
    const next = snapshot();
    set({
      storedKeys: next.storedKeys,
      configuredKeys: next.configuredKeys,
      hasActiveProviderKey: next.hasActiveProviderKey,
    });
  },

  clearApiKey: (provider) => {
    clearStoredApiKey(provider);
    const next = snapshot();
    set({
      storedKeys: next.storedKeys,
      configuredKeys: next.configuredKeys,
      hasActiveProviderKey: next.hasActiveProviderKey,
    });
  },

  saveModel: (provider, model) => {
    const trimmed = model.trim();
    if (!trimmed) return;
    if (trimmed === getDefaultModel(provider)) {
      clearStoredModel(provider);
    } else {
      writeStoredModel(provider, trimmed);
    }
    const next = snapshot();
    set({
      storedModels: next.storedModels,
      effectiveModels: next.effectiveModels,
    });
  },

  clearModel: (provider) => {
    clearStoredModel(provider);
    const next = snapshot();
    set({
      storedModels: next.storedModels,
      effectiveModels: next.effectiveModels,
    });
  },
}));
