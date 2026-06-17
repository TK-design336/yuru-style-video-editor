import type { ProjectData } from "@/lib/schema/transcript";
import { isTauri } from "@/lib/tauri/env";
import {
  readTextFile,
  writeTextFile,
} from "@/lib/tauri/projectFile";
import { invoke } from "@tauri-apps/api/core";

const PROJECT_FILE_SUFFIX = ".yuru-project.json";

export function defaultProjectFileName(sourceVideo: string): string {
  const base = sourceVideo.replace(/\.[^.]+$/, "") || "project";
  return `${base}${PROJECT_FILE_SUFFIX}`;
}

export function ensureProjectJsonPath(path: string): string {
  if (path.toLowerCase().endsWith(".json")) return path;
  return `${path}${PROJECT_FILE_SUFFIX}`;
}

export async function pickProjectOpenFile(): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>("pick_project_open_file");
}

export async function pickProjectSaveFile(
  defaultName?: string,
): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>("pick_project_save_file", {
    defaultName: defaultName ?? null,
  });
}

export async function readProjectFile(path: string): Promise<unknown> {
  const text = await readTextFile(path);
  return JSON.parse(text) as unknown;
}

export async function writeProjectFile(
  path: string,
  project: ProjectData,
): Promise<void> {
  const normalized = ensureProjectJsonPath(path);
  const body = JSON.stringify(project, null, 2);
  await writeTextFile(normalized, body);
}
