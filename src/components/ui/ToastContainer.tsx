import type { ToastEntry } from "@/store/toastStore";
import { useToastStore } from "@/store/toastStore";

const kindStyles = {
  error: "glass-toast border-red-500/40 bg-red-950/75 text-red-50",
  success: "glass-toast border-emerald-500/40 bg-emerald-950/75 text-emerald-50",
  info: "glass-toast border-sky-500/40 bg-sky-950/75 text-sky-50",
} as const;

function ToastItem({
  toast,
  onDismiss,
  className,
}: {
  toast: ToastEntry;
  onDismiss: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={`pointer-events-auto px-4 py-3 text-sm ${kindStyles[toast.kind]} ${className ?? ""}`}
      role={toast.placement === "banner" ? "status" : "alert"}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="whitespace-pre-wrap break-words">{toast.message}</p>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="shrink-0 text-xs opacity-70 hover:opacity-100"
          aria-label="閉じる"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  const banners = toasts.filter((t) => t.placement === "banner");
  const cornerToasts = toasts.filter((t) => t.placement !== "banner");

  if (banners.length === 0 && cornerToasts.length === 0) return null;

  return (
    <>
      {banners.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col gap-2 px-4 pt-3">
          {banners.map((toast) => (
            <ToastItem
              key={toast.id}
              toast={toast}
              onDismiss={dismiss}
              className="mx-auto w-full max-w-3xl text-center"
            />
          ))}
        </div>
      )}
      {cornerToasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex max-w-md flex-col gap-2">
          {cornerToasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </>
  );
}
