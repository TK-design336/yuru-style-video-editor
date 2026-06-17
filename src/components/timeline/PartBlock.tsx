import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import type { Part } from "@/lib/schema/transcript";
import {
  PART_TYPE_COLORS,
  PART_TYPE_LABELS,
} from "@/lib/timeline/partEdit";

export type PartDragSide = "start" | "end";

interface PartBlockProps {
  part: Part;
  durationMs: number;
  isFirst: boolean;
  isLast: boolean;
  currentTimeMs: number;
  onBoundaryDrag: (side: PartDragSide, ms: number) => void;
  onBoundaryDragEnd: (side: PartDragSide, ms: number) => void;
  onChangeType: (type: Part["type"]) => void;
  onSplitSubPart: (splitMs: number) => void;
  onSeek: (ms: number) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
}

export function PartBlock({
  part,
  durationMs,
  isFirst,
  isLast,
  currentTimeMs,
  onBoundaryDrag,
  onBoundaryDragEnd,
  onChangeType,
  onSplitSubPart,
  onSeek,
}: PartBlockProps) {
  const blockRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<PartDragSide | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [typeSubmenuOpen, setTypeSubmenuOpen] = useState(false);

  const leftPct = (part.start_ms / durationMs) * 100;
  const widthPct = ((part.end_ms - part.start_ms) / durationMs) * 100;
  const colors = PART_TYPE_COLORS[part.type];
  const isActive =
    currentTimeMs >= part.start_ms && currentTimeMs < part.end_ms;

  const msFromClientX = useCallback(
    (clientX: number): number => {
      const el = blockRef.current?.parentElement;
      if (!el) return part.start_ms;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return Math.round(ratio * durationMs);
    },
    [durationMs, part.start_ms],
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: globalThis.MouseEvent) => {
      onBoundaryDrag(dragging, msFromClientX(e.clientX));
    };

    const handleUp = (e: globalThis.MouseEvent) => {
      onBoundaryDragEnd(dragging, msFromClientX(e.clientX));
      setDragging(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, msFromClientX, onBoundaryDrag, onBoundaryDragEnd]);

  useEffect(() => {
    if (!contextMenu) return;

    const close = () => {
      setContextMenu(null);
      setTypeSubmenuOpen(false);
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", handleKey);
    };
  }, [contextMenu]);

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTypeSubmenuOpen(false);
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const splitMs =
    currentTimeMs >= part.start_ms && currentTimeMs < part.end_ms
      ? currentTimeMs
      : Math.round((part.start_ms + part.end_ms) / 2);

  return (
    <>
      <div
        ref={blockRef}
        data-part-block
        className={`absolute top-6 bottom-2 flex min-w-[2px] flex-col overflow-hidden rounded border ${colors.bg} ${colors.border} ${
          isActive ? "ring-1 ring-white/50" : ""
        }`}
        style={{
          left: `${leftPct}%`,
          width: `${Math.max(widthPct, 0.15)}%`,
        }}
        onContextMenu={handleContextMenu}
        onClick={(e) => {
          e.stopPropagation();
          onSeek(msFromClientX(e.clientX));
        }}
        title={`${colors.label}: ${part.title_draft ?? part.id}`}
      >
        {!isFirst && (
          <div
            className="absolute bottom-0 left-0 top-0 z-10 w-2 cursor-ew-resize bg-white/10 hover:bg-white/30"
            onMouseDown={(e) => {
              e.stopPropagation();
              setDragging("start");
            }}
          />
        )}

        <div className="pointer-events-none flex min-w-0 flex-1 flex-col px-2 py-1">
          <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-white/80">
            {colors.label}
          </span>
          {part.title_draft && (
            <span className="truncate text-xs text-white/90">
              {part.title_draft}
            </span>
          )}
          {part.sub_parts.length > 0 && (
            <div className="relative mt-auto h-2 w-full">
              {part.sub_parts.map((sub) => {
                const span = part.end_ms - part.start_ms;
                const subLeft =
                  span > 0
                    ? ((sub.start_ms - part.start_ms) / span) * 100
                    : 0;
                const subWidth =
                  span > 0 ? ((sub.end_ms - sub.start_ms) / span) * 100 : 0;
                const subColors = PART_TYPE_COLORS[sub.type];
                return (
                  <div
                    key={sub.id}
                    className={`absolute top-0 h-full rounded-sm border ${subColors.bg} ${subColors.border}`}
                    style={{
                      left: `${subLeft}%`,
                      width: `${subWidth}%`,
                    }}
                    title={sub.title_draft ?? sub.id}
                  />
                );
              })}
            </div>
          )}
        </div>

        {!isLast && (
          <div
            className="absolute bottom-0 right-0 top-0 z-10 w-2 cursor-ew-resize bg-white/10 hover:bg-white/30"
            onMouseDown={(e) => {
              e.stopPropagation();
              setDragging("end");
            }}
          />
        )}
      </div>

      {contextMenu && (
        <div
          className="glass-panel-deep fixed z-50 min-w-[11rem] py-1 text-sm shadow-glass"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            className="relative"
            onMouseEnter={() => setTypeSubmenuOpen(true)}
            onMouseLeave={() => setTypeSubmenuOpen(false)}
          >
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-white/10"
            >
              種別変更
              <span className="text-white/40">▸</span>
            </button>
            {typeSubmenuOpen && (
              <div className="glass-panel-deep absolute left-full top-0 ml-1 min-w-[10rem] py-1">
                {(Object.keys(PART_TYPE_LABELS) as Part["type"][]).map(
                  (type) => (
                    <button
                      key={type}
                      type="button"
                      className={`flex w-full px-3 py-2 text-left hover:bg-white/10 ${
                        part.type === type ? "text-accent-soft" : ""
                      }`}
                      onClick={() => {
                        onChangeType(type);
                        setContextMenu(null);
                      }}
                    >
                      {PART_TYPE_LABELS[type]}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            className="flex w-full px-3 py-2 text-left hover:bg-white/10"
            onClick={() => {
              onSplitSubPart(splitMs);
              setContextMenu(null);
            }}
          >
            Sub-Part 追加分割
          </button>
        </div>
      )}
    </>
  );
}
