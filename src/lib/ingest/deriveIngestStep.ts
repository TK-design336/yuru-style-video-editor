import type { ProjectData } from "@/lib/schema/transcript";
import { canCompleteSpeakerSetup } from "@/lib/speakers";

export type IngestStep = "select" | "transcribe" | "speakers" | "done";

/** プロジェクト状態から取り込み画面のステップを復元する */
export function deriveIngestStep(
  videoPath: string | null,
  project: ProjectData | null,
): IngestStep {
  if (!videoPath) return "select";
  if (!project?.words.length) return "transcribe";
  if (!canCompleteSpeakerSetup(project.meta.speakers)) return "speakers";
  return "done";
}
