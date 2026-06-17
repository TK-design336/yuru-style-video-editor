import { useState } from "react";
import { AiApiSettingsModal } from "@/components/panels/AiApiSettingsModal";
import { AI_PROVIDER_CONFIG } from "@/lib/ai/providers";
import { useAiSettingsStore } from "@/store/aiSettingsStore";

export function AiApiSettingsButton() {
  const [open, setOpen] = useState(false);
  const hasActiveProviderKey = useAiSettingsStore((s) => s.hasActiveProviderKey);
  const activeProvider = useAiSettingsStore((s) => s.activeProvider);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass-btn-ghost gap-2"
        title="Claude / OpenAI / Gemini の API キー設定"
      >
        <SettingsIcon />
        <span>AI API 設定</span>
        <span className="text-xs text-white/45">
          ({AI_PROVIDER_CONFIG[activeProvider].shortLabel})
        </span>
        {!hasActiveProviderKey && (
          <span className="glass-badge bg-amber-500/20 text-amber-200">
            未設定
          </span>
        )}
      </button>
      <AiApiSettingsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function SettingsIcon() {
  return (
    <svg
      aria-hidden
      className="h-4 w-4 shrink-0 opacity-80"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}
