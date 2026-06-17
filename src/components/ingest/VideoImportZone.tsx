import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { isVideoFileName } from "@/lib/tauri/video";
import { isTauri } from "@/lib/tauri/env";

interface VideoImportZoneProps {
  onPickVideo: () => void;
  onOpenProject: () => void;
  onVideoPathDropped: (path: string) => void;
  onProjectPathDropped: (path: string) => void;
  disabled?: boolean;
}

export function VideoImportZone({
  onPickVideo,
  onOpenProject,
  onVideoPathDropped,
  onProjectPathDropped,
  disabled = false,
}: VideoImportZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const zoneRef = useRef<HTMLDivElement>(null);

  const handlePaths = useCallback(
    (paths: string[]) => {
      if (disabled || paths.length === 0) return;
      const path = paths[0]!;
      const name = path.replace(/\\/g, "/").split("/").pop() ?? path;
      if (name.toLowerCase().endsWith(".json")) {
        onProjectPathDropped(path);
        return;
      }
      if (isVideoFileName(name)) {
        onVideoPathDropped(path);
      }
    },
    [disabled, onProjectPathDropped, onVideoPathDropped],
  );

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      if (cancelled) return;
      void getCurrentWindow()
        .onDragDropEvent((event) => {
          if (disabled) return;
          if (event.payload.type === "over") {
            setDragOver(true);
          } else if (event.payload.type === "leave") {
            setDragOver(false);
          } else if (event.payload.type === "drop") {
            setDragOver(false);
            handlePaths(event.payload.paths);
          }
        })
        .then((fn) => {
          if (!cancelled) unlisten = fn;
        });
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [disabled, handlePaths]);

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  };

  const onDragLeave = (e: DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) {
      const name = file.name;
      if (name.toLowerCase().endsWith(".json")) {
        onProjectPathDropped(name);
        return;
      }
      if (isVideoFileName(name)) {
        onVideoPathDropped(name);
      }
    }
  };

  return (
    <div
      ref={zoneRef}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => {
        if (!disabled) onPickVideo();
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPickVideo();
        }
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`glass-preview flex h-[clamp(14rem,40vh,28rem)] w-full cursor-pointer flex-col items-center justify-center gap-4 border-2 border-dashed px-6 py-8 text-center transition-colors ${
        dragOver
          ? "border-accent/60 bg-accent/10"
          : "border-glass-border hover:border-glass-border-strong hover:bg-white/[0.03]"
      } ${disabled ? "pointer-events-none opacity-50" : ""}`}
    >
      <svg
        aria-hidden
        className="size-10 text-white/30"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M12 16V4m0 0L8 8m4-4 4 4" />
        <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
      <div className="space-y-1">
        <p className="text-sm font-medium text-white/80">
          動画をドロップ、またはクリックして選択
        </p>
        <p className="text-xs text-white/45">
          MP4 / MOV / MKV など
        </p>
      </div>
      <div
        className="flex flex-wrap items-center justify-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={onPickVideo}
          className="glass-btn-primary px-4 py-2 text-sm"
        >
          動画を開く
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onOpenProject}
          className="glass-btn-secondary px-4 py-2 text-sm"
        >
          プロジェクトから開く
        </button>
      </div>
    </div>
  );
}
