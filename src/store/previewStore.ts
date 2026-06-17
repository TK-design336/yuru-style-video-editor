import { create } from "zustand";

export interface PreviewStoreState {
  videoPath: string | null;
  videoSrc: string | null;
  durationMs: number;
  currentTimeMs: number;
  isPlaying: boolean;
  seekRequestMs: number | null;

  setVideo: (path: string | null, src: string | null) => void;
  setDurationMs: (ms: number) => void;
  setCurrentTimeMs: (ms: number) => void;
  setIsPlaying: (playing: boolean) => void;
  requestSeek: (ms: number) => void;
  clearSeekRequest: () => void;
}

export const usePreviewStore = create<PreviewStoreState>((set) => ({
  videoPath: null,
  videoSrc: null,
  durationMs: 0,
  currentTimeMs: 0,
  isPlaying: false,
  seekRequestMs: null,

  setVideo: (videoPath, videoSrc) =>
    set({
      videoPath,
      videoSrc,
      currentTimeMs: 0,
      seekRequestMs: 0,
    }),

  setDurationMs: (durationMs) => set({ durationMs }),

  setCurrentTimeMs: (currentTimeMs) => set({ currentTimeMs }),

  setIsPlaying: (isPlaying) => set({ isPlaying }),

  requestSeek: (ms) =>
    set({
      seekRequestMs: Math.max(0, Math.round(ms)),
    }),

  clearSeekRequest: () => set({ seekRequestMs: null }),
}));
