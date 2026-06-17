import { create } from "zustand";
import {
  type PersistentObject,
  type SceneTransitionDefaults,
  type SpeakerSubtitleOverride,
  type StyleConfig,
  type SubtitleStyleEntry,
  type SubtitleStyles,
  StyleConfigSchema,
  createDefaultStyleConfig,
  safeParseStyleConfig,
} from "@/lib/schema/style";

export type StyleParseResult =
  | { success: true; data: StyleConfig }
  | { success: false; error: string };

type ImportanceKey = "0" | "1" | "2" | "3";

export interface StyleStoreState {
  style: StyleConfig;
  isDirty: boolean;
  lastError: string | null;

  setStyle: (style: StyleConfig) => StyleParseResult;
  loadStyle: (raw: unknown) => StyleParseResult;
  resetToDefaults: () => void;
  markClean: () => void;
  setLastError: (error: string | null) => void;

  updateSubtitleStyles: (patch: Partial<SubtitleStyles>) => void;
  updateSubtitleByImportance: (
    level: ImportanceKey,
    patch: Partial<SubtitleStyleEntry>,
  ) => void;
  setSpeakerOverride: (
    speakerId: string,
    override: SpeakerSubtitleOverride,
  ) => void;
  removeSpeakerOverride: (speakerId: string) => void;
  setPersistentObjects: (objects: PersistentObject[]) => void;
  updateSceneTransitionDefaults: (
    patch: Partial<SceneTransitionDefaults>,
  ) => void;
}

function applyStyleUpdate(
  get: () => StyleStoreState,
  set: (partial: Partial<StyleStoreState>) => void,
  updater: (style: StyleConfig) => StyleConfig,
): void {
  const next = updater(get().style);
  const parsed = StyleConfigSchema.safeParse(next);
  if (!parsed.success) {
    set({ lastError: parsed.error.message });
    return;
  }
  set({
    style: parsed.data,
    isDirty: true,
    lastError: null,
  });
}

export const useStyleStore = create<StyleStoreState>((set, get) => ({
  style: createDefaultStyleConfig(),
  isDirty: false,
  lastError: null,

  setStyle: (style) => {
    const parsed = StyleConfigSchema.safeParse(style);
    if (!parsed.success) {
      const message = parsed.error.message;
      set({ lastError: message });
      return { success: false, error: message };
    }
    set({
      style: parsed.data,
      isDirty: true,
      lastError: null,
    });
    return { success: true, data: parsed.data };
  },

  loadStyle: (raw) => {
    const parsed = safeParseStyleConfig(raw);
    if (!parsed.success) {
      const message = parsed.error.message;
      set({ lastError: message });
      return { success: false, error: message };
    }
    set({
      style: parsed.data,
      isDirty: false,
      lastError: null,
    });
    return { success: true, data: parsed.data };
  },

  resetToDefaults: () =>
    set({
      style: createDefaultStyleConfig(),
      isDirty: true,
      lastError: null,
    }),

  markClean: () => set({ isDirty: false }),

  setLastError: (error) => set({ lastError: error }),

  updateSubtitleStyles: (patch) => {
    applyStyleUpdate(get, set, (style) => ({
      ...style,
      subtitle_styles: { ...style.subtitle_styles, ...patch },
    }));
  },

  updateSubtitleByImportance: (level, patch) => {
    applyStyleUpdate(get, set, (style) => ({
      ...style,
      subtitle_styles: {
        ...style.subtitle_styles,
        by_importance: {
          ...style.subtitle_styles.by_importance,
          [level]: {
            ...style.subtitle_styles.by_importance[level],
            ...patch,
          },
        },
      },
    }));
  },

  setSpeakerOverride: (speakerId, override) => {
    applyStyleUpdate(get, set, (style) => ({
      ...style,
      subtitle_styles: {
        ...style.subtitle_styles,
        by_speaker: {
          ...style.subtitle_styles.by_speaker,
          [speakerId]: override,
        },
      },
    }));
  },

  removeSpeakerOverride: (speakerId) => {
    applyStyleUpdate(get, set, (style) => {
      const { [speakerId]: _removed, ...rest } =
        style.subtitle_styles.by_speaker;
      return {
        ...style,
        subtitle_styles: {
          ...style.subtitle_styles,
          by_speaker: rest,
        },
      };
    });
  },

  setPersistentObjects: (persistent_objects) => {
    applyStyleUpdate(get, set, (style) => ({
      ...style,
      persistent_objects,
    }));
  },

  updateSceneTransitionDefaults: (patch) => {
    applyStyleUpdate(get, set, (style) => ({
      ...style,
      scene_transition_defaults: {
        ...style.scene_transition_defaults,
        ...patch,
      },
    }));
  },
}));

export function getStyleSnapshot(): StyleConfig {
  return useStyleStore.getState().style;
}
