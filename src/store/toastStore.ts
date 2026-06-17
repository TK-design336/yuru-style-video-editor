import { create } from "zustand";

export type ToastKind = "error" | "success" | "info";
export type ToastPlacement = "toast" | "banner";

export interface ToastEntry {
  id: string;
  message: string;
  kind: ToastKind;
  placement: ToastPlacement;
}

interface ToastShowOptions {
  placement?: ToastPlacement;
  durationMs?: number;
}

interface ToastStoreState {
  toasts: ToastEntry[];
  show: (message: string, kind?: ToastKind, options?: ToastShowOptions) => void;
  dismiss: (id: string) => void;
}

const TOAST_DURATION_MS = 6000;
const BANNER_DURATION_MS = 5000;

export const useToastStore = create<ToastStoreState>((set, get) => ({
  toasts: [],

  show: (message, kind = "error", options = {}) => {
    const placement = options.placement ?? "toast";
    const durationMs =
      options.durationMs ??
      (placement === "banner" ? BANNER_DURATION_MS : TOAST_DURATION_MS);
    const id = crypto.randomUUID();
    set({
      toasts: [...get().toasts, { id, message, kind, placement }],
    });
    window.setTimeout(() => {
      if (get().toasts.some((t) => t.id === id)) {
        get().dismiss(id);
      }
    }, durationMs);
  },

  dismiss: (id) => {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export function showToast(message: string, kind: ToastKind = "error"): void {
  useToastStore.getState().show(message, kind);
}

export function showBanner(
  message: string,
  kind: ToastKind = "success",
  durationMs?: number,
): void {
  useToastStore.getState().show(message, kind, { placement: "banner", durationMs });
}
