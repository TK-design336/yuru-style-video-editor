import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./env";

export async function readTextFile(path: string): Promise<string> {
  if (!isTauri()) {
    throw new Error("Tauri 環境でのみファイルを読み込めます");
  }
  return invoke<string>("read_text_file", { path });
}

export async function writeTextFile(
  path: string,
  contents: string,
): Promise<void> {
  if (!isTauri()) {
    throw new Error("Tauri 環境でのみファイルを保存できます");
  }
  await invoke("write_text_file", { path, contents });
}
