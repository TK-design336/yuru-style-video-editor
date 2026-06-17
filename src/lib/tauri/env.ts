import { isTauri as detectTauri } from "@tauri-apps/api/core";

export function isTauri(): boolean {
  return detectTauri();
}
