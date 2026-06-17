import { create } from "zustand";
import {
  type Meta,
  type Part,
  type Phrase,
  type ProjectData,
  type SceneTransition,
  type Speaker,
  type Word,
  type MediaHint,
  ProjectDataSchema,
  safeParseProjectData,
} from "@/lib/schema/transcript";
import {
  createSpeakerStub,
  speakerIdsByFirstAppearance,
  syncSpeakersAfterTranscription,
} from "@/lib/speakers";

export type ProjectParseResult =
  | { success: true; data: ProjectData }
  | { success: false; error: string };

export interface ProjectStoreState {
  project: ProjectData | null;
  isDirty: boolean;
  lastError: string | null;

  setProject: (project: ProjectData) => ProjectParseResult;
  loadProject: (raw: unknown) => ProjectParseResult;
  clearProject: () => void;
  touchUpdatedAt: () => void;
  markClean: () => void;
  setLastError: (error: string | null) => void;

  updateMeta: (patch: Partial<Meta>) => void;
  setSpeakers: (speakers: Speaker[]) => void;
  updateSpeaker: (id: string, patch: Partial<Speaker>) => void;
  mergeSpeakers: (fromId: string, toId: string) => void;
  syncSpeakersFromWords: () => void;
  setWords: (words: Word[]) => void;
  updateWord: (id: string, patch: Partial<Word>) => void;
  setParts: (parts: Part[]) => void;
  setPhrases: (phrases: Phrase[]) => void;
  setSceneTransitions: (transitions: SceneTransition[]) => void;
  setMediaHints: (hints: MediaHint[]) => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createEmptyProject(
  overrides: Partial<Pick<Meta, "source_video" | "source_video_path">> = {},
): ProjectData {
  const timestamp = nowIso();
  return {
    meta: {
      schema_version: "1.0.0",
      source_video: overrides.source_video ?? "",
      source_video_path: overrides.source_video_path ?? "",
      duration_ms: 0,
      created_at: timestamp,
      updated_at: timestamp,
      speakers: [],
    },
    words: [],
    parts: [],
    phrases: [],
    scene_transitions: [],
    media_hints: [],
  };
}

function requireProject(
  project: ProjectData | null,
): asserts project is ProjectData {
  if (!project) {
    throw new Error("プロジェクトが読み込まれていません");
  }
}

function applyProjectUpdate(
  get: () => ProjectStoreState,
  set: (partial: Partial<ProjectStoreState>) => void,
  updater: (project: ProjectData) => ProjectData,
): void {
  const current = get().project;
  requireProject(current);
  const next = updater({
    ...current,
    meta: { ...current.meta, updated_at: nowIso() },
  });
  const parsed = ProjectDataSchema.safeParse(next);
  if (!parsed.success) {
    set({
      lastError: parsed.error.message,
    });
    return;
  }
  set({
    project: parsed.data,
    isDirty: true,
    lastError: null,
  });
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  project: null,
  isDirty: false,
  lastError: null,

  setProject: (project) => {
    const parsed = ProjectDataSchema.safeParse(project);
    if (!parsed.success) {
      const message = parsed.error.message;
      set({ lastError: message });
      return { success: false, error: message };
    }
    set({
      project: parsed.data,
      isDirty: true,
      lastError: null,
    });
    return { success: true, data: parsed.data };
  },

  loadProject: (raw) => {
    const parsed = safeParseProjectData(raw);
    if (!parsed.success) {
      const message = parsed.error.message;
      set({ lastError: message });
      return { success: false, error: message };
    }
    set({
      project: parsed.data,
      isDirty: false,
      lastError: null,
    });
    return { success: true, data: parsed.data };
  },

  clearProject: () =>
    set({
      project: null,
      isDirty: false,
      lastError: null,
    }),

  touchUpdatedAt: () => {
    applyProjectUpdate(get, set, (project) => project);
  },

  markClean: () => set({ isDirty: false }),

  setLastError: (error) => set({ lastError: error }),

  updateMeta: (patch) => {
    applyProjectUpdate(get, set, (project) => ({
      ...project,
      meta: { ...project.meta, ...patch },
    }));
  },

  setSpeakers: (speakers) => {
    applyProjectUpdate(get, set, (project) => ({
      ...project,
      meta: { ...project.meta, speakers },
    }));
  },

  updateSpeaker: (id, patch) => {
    applyProjectUpdate(get, set, (project) => {
      const ids = speakerIdsByFirstAppearance(project.words);
      const index = ids.indexOf(id);
      const speakers = [...project.meta.speakers];
      const existingIndex = speakers.findIndex((s) => s.id === id);
      if (existingIndex >= 0) {
        speakers[existingIndex] = { ...speakers[existingIndex]!, ...patch };
      } else if (index >= 0) {
        speakers.push(
          createSpeakerStub(id, index, ids.length, {
            ...patch,
          }),
        );
      }
      return {
        ...project,
        meta: { ...project.meta, speakers },
      };
    });
  },

  syncSpeakersFromWords: () => {
    applyProjectUpdate(get, set, (project) =>
      syncSpeakersAfterTranscription(project),
    );
  },

  mergeSpeakers: (fromId, toId) => {
    if (fromId === toId) {
      set({ lastError: "同じ話者にはマージできません" });
      return;
    }
    const current = get().project;
    if (!current) {
      set({ lastError: "プロジェクトが読み込まれていません" });
      return;
    }
    const fromExists = current.meta.speakers.some((s) => s.id === fromId);
    const toExists = current.meta.speakers.some((s) => s.id === toId);
    if (!fromExists || !toExists) {
      set({ lastError: "マージ対象の話者が見つかりません" });
      return;
    }
    applyProjectUpdate(get, set, (project) => ({
      ...project,
      meta: {
        ...project.meta,
        speakers: project.meta.speakers.filter((s) => s.id !== fromId),
      },
      words: project.words.map((word) =>
        word.speaker === fromId ? { ...word, speaker: toId } : word,
      ),
    }));
  },

  setWords: (words) => {
    applyProjectUpdate(get, set, (project) => ({ ...project, words }));
  },

  updateWord: (id, patch) => {
    applyProjectUpdate(get, set, (project) => ({
      ...project,
      words: project.words.map((word) =>
        word.id === id ? { ...word, ...patch } : word,
      ),
    }));
  },

  setParts: (parts) => {
    applyProjectUpdate(get, set, (project) => ({ ...project, parts }));
  },

  setPhrases: (phrases) => {
    applyProjectUpdate(get, set, (project) => ({ ...project, phrases }));
  },

  setSceneTransitions: (scene_transitions) => {
    applyProjectUpdate(get, set, (project) => ({
      ...project,
      scene_transitions,
    }));
  },

  setMediaHints: (media_hints) => {
    applyProjectUpdate(get, set, (project) => ({ ...project, media_hints }));
  },
}));

/** Tauri 保存・エクスポート用のスナップショット取得 */
export function getProjectSnapshot(): ProjectData | null {
  return useProjectStore.getState().project;
}
