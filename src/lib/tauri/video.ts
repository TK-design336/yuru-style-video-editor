import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { isTauri } from "./env";

const VIDEO_EXTENSIONS = ["mp4", "mov", "mkv", "webm", "avi", "m4v"];

export function toVideoSrc(filePath: string): string {
  if (!filePath) return "";
  if (!isTauri()) {
    return filePath;
  }
  return convertFileSrc(filePath);
}

export async function pickVideoFile(): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }
  const path = await invoke<string | null>("pick_video_file");
  return path;
}

export function fileNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] ?? filePath;
}

export function isVideoFileName(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.includes(ext);
}
