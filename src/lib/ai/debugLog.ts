import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/tauri/env";

export interface AiDebugEntry {
  label: string;
  message: string;
  detail?: string;
  at: string;
}

declare global {
  interface Window {
    /** DevTools で `__yuruAiDebug` と入力すれば常に確認できる */
    __yuruAiDebug?: AiDebugEntry[];
    __yuruLastAiRequest?: string;
    __yuruLastAiRawResponse?: string;
  }
}

function pushDebugEntry(entry: AiDebugEntry): void {
  if (typeof window === "undefined") return;
  window.__yuruAiDebug = [...(window.__yuruAiDebug ?? []), entry].slice(-30);
  if (entry.message === "request" && entry.detail !== undefined) {
    window.__yuruLastAiRequest = entry.detail;
  }
  if (entry.message === "raw response" && entry.detail !== undefined) {
    window.__yuruLastAiRawResponse = entry.detail;
  }
}

/** ブラウザ DevTools と Tauri 起動ターミナルの両方に AI デバッグログを出す */
export function logAIDebug(
  label: string,
  message: string,
  detail?: string,
): void {
  const entry: AiDebugEntry = {
    label,
    message,
    detail,
    at: new Date().toISOString(),
  };
  pushDebugEntry(entry);

  const header = `[Yuru AI] ${label} — ${message}`;
  console.log(
    `%c${header}`,
    "background:#2563eb;color:#fff;font-weight:bold;padding:2px 6px;border-radius:3px",
  );
  if (detail !== undefined) {
    console.log(detail);
  }

  if (isTauri()) {
    void invoke("log_ai_debug", {
      label,
      message,
      detail: detail ?? null,
    }).catch(() => {
      // 古いバイナリなどでコマンド未登録の場合は無視
    });
  }
}
