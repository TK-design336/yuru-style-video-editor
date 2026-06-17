import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "@/lib/tauri/env";

/** 既定のブラウザで URL を開く（WebView 内の a タグは外部で開けないため） */
export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri()) {
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
