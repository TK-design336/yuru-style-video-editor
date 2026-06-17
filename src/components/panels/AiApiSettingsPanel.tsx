import { useCallback, useState } from "react";
import {
  getApiKey,
  maskApiKey,
  readStoredApiKey,
} from "@/lib/ai/apiKeyStorage";
import {
  AI_PROVIDER_CONFIG,
  AI_PROVIDERS,
  type AiProvider,
} from "@/lib/ai/providers";
import { getDefaultModel } from "@/lib/ai/modelStorage";
import { useAiSettingsStore } from "@/store/aiSettingsStore";
import { showToast } from "@/store/toastStore";

function ProviderKeySection({ provider }: { provider: AiProvider }) {
  const config = AI_PROVIDER_CONFIG[provider];
  const defaultModel = getDefaultModel(provider);
  const storedKey = useAiSettingsStore((s) => s.storedKeys[provider]);
  const configured = useAiSettingsStore((s) => s.configuredKeys[provider]);
  const storedModel = useAiSettingsStore((s) => s.storedModels[provider]);
  const effectiveModel = useAiSettingsStore((s) => s.effectiveModels[provider]);
  const saveApiKey = useAiSettingsStore((s) => s.saveApiKey);
  const clearApiKey = useAiSettingsStore((s) => s.clearApiKey);
  const saveModel = useAiSettingsStore((s) => s.saveModel);
  const clearModel = useAiSettingsStore((s) => s.clearModel);
  const refreshKeyStatus = useAiSettingsStore((s) => s.refreshKeyStatus);

  const [draft, setDraft] = useState("");
  const [modelDraft, setModelDraft] = useState<string | null>(null);
  const displayModel = modelDraft ?? effectiveModel;
  const activeKey = getApiKey(provider);
  const envOnly = configured && !storedKey && activeKey !== null;

  const commitDraft = useCallback(
    (options?: { explicit?: boolean }) => {
      const trimmed = draft.trim();
      if (!trimmed) return;
      if (trimmed === storedKey) {
        setDraft("");
        return;
      }

      if (!options?.explicit && trimmed.length < 16) {
        return;
      }

      if (!trimmed.startsWith(config.keyPrefix)) {
        showToast(
          `${config.label} の API キーは通常 ${config.keyPrefix} で始まります。入力内容を確認してください。`,
          "info",
        );
      }

      saveApiKey(provider, trimmed);
      setDraft("");
      showToast(`${config.shortLabel} の API キーを保存しました`, "success");
    },
    [config, draft, provider, saveApiKey, storedKey],
  );

  const handleClear = useCallback(() => {
    if (!readStoredApiKey(provider)) return;
    clearApiKey(provider);
    refreshKeyStatus();
    setDraft("");
    showToast(`${config.shortLabel} の保存済みキーを削除しました`, "info");
  }, [clearApiKey, config.shortLabel, provider, refreshKeyStatus]);

  const commitModelDraft = useCallback(
    (options?: { explicit?: boolean }) => {
      const trimmed = displayModel.trim();
      if (!trimmed) return;
      if (trimmed === effectiveModel) {
        setModelDraft(null);
        return;
      }

      if (!options?.explicit && trimmed.length < 3) {
        return;
      }

      saveModel(provider, trimmed);
      setModelDraft(null);
      showToast(`${config.shortLabel} のモデル名を保存しました`, "success");
    },
    [config.shortLabel, displayModel, effectiveModel, provider, saveModel],
  );

  const handleClearModel = useCallback(() => {
    if (!storedModel) return;
    clearModel(provider);
    setModelDraft(null);
    showToast(`${config.shortLabel} のモデル名をデフォルトに戻しました`, "info");
  }, [clearModel, config.shortLabel, provider, storedModel]);

  return (
    <section className="glass-panel p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{config.label}</h3>
        </div>
        {configured && (
          <span className="glass-badge shrink-0 bg-emerald-500/20 text-emerald-200">
            設定済み
          </span>
        )}
      </div>

      {configured && activeKey && (
        <p className="text-meta mb-3">
          現在: {maskApiKey(activeKey)}
          {envOnly && `（.env の ${providerEnvName(provider)}）`}
        </p>
      )}

      <label
        className="mb-1 block text-xs text-white/60"
        htmlFor={`${provider}-model`}
      >
        モデル名
      </label>
      <input
        id={`${provider}-model`}
        type="text"
        autoComplete="off"
        value={displayModel}
        onChange={(e) => setModelDraft(e.target.value)}
        onBlur={() => commitModelDraft()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitModelDraft({ explicit: true });
          }
        }}
        placeholder={defaultModel}
        className="glass-input mb-1"
      />
      <p className="mb-3 text-xs text-white/40">
        デフォルト: {defaultModel}
        {storedModel ? "（カスタム設定中）" : ""}
        。Enter またはフォーカスを外すと保存されます。
      </p>
      {storedModel && (
        <button
          type="button"
          onClick={handleClearModel}
          className="glass-btn-ghost mb-4"
        >
          モデル名をデフォルトに戻す
        </button>
      )}

      <label
        className="mb-1 block text-xs text-white/60"
        htmlFor={`${provider}-api-key`}
      >
        API キー
      </label>
      <input
        id={`${provider}-api-key`}
        type="password"
        autoComplete="off"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commitDraft()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitDraft({ explicit: true });
          }
        }}
        placeholder={config.placeholder}
        className="glass-input mb-2"
      />
      <p className="mb-3 text-xs text-white/40">
        <a
          href={config.consoleUrl}
          target="_blank"
          rel="noreferrer"
          className="text-accent-soft hover:underline"
        >
          {config.consoleLabel}
        </a>
        でキーを発行できます。入力後は Enter またはフォーカスを外すと自動保存されます。
      </p>

      {storedKey && (
        <button type="button" onClick={handleClear} className="glass-btn-ghost">
          保存を削除
        </button>
      )}
    </section>
  );
}

function providerEnvName(provider: AiProvider): string {
  switch (provider) {
    case "claude":
      return "VITE_ANTHROPIC_API_KEY";
    case "openai":
      return "VITE_OPENAI_API_KEY";
    case "gemini":
      return "VITE_GEMINI_API_KEY";
  }
}

export function AiApiSettingsPanel() {
  const activeProvider = useAiSettingsStore((s) => s.activeProvider);
  const setActiveProvider = useAiSettingsStore((s) => s.setActiveProvider);

  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-white">使用する AI</h3>
        <p className="mb-3 text-xs text-white/50">
          校正・パート分割などの AI 処理に使うプロバイダーを1つ選びます。
        </p>
        <div
          className="glass-segment w-full"
          role="radiogroup"
          aria-label="使用する AI プロバイダー"
        >
          {AI_PROVIDERS.map((provider) => {
            const selected = activeProvider === provider;
            return (
              <button
                key={provider}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setActiveProvider(provider)}
                className={
                  selected
                    ? "glass-segment-item glass-segment-item-selected"
                    : "glass-segment-item"
                }
              >
                {AI_PROVIDER_CONFIG[provider].shortLabel}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-white">API キー</h3>
        <p className="mb-3 text-xs text-white/50">
          {AI_PROVIDER_CONFIG[activeProvider].label}
          のキーを登録します。キーはこの PC
          のブラウザ（localStorage）にのみ保存されます。
        </p>
        <ProviderKeySection key={activeProvider} provider={activeProvider} />
      </section>
    </div>
  );
}
