import { useCallback, useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import type { Part, Word } from "@/lib/schema/transcript";
import {
  changePartType,
  splitPartIntoSubParts,
  updatePartBoundary,
} from "@/lib/timeline/partEdit";
import { PartBlock, type PartDragSide } from "./PartBlock";

interface TimelineBarProps {
  parts: Part[];
  words: Word[];
  durationMs: number;
  audioUrl: string | null;
  currentTimeMs: number;
  onPartsChange: (parts: Part[]) => void;
  onSeek: (ms: number) => void;
}

export function TimelineBar({
  parts,
  words,
  durationMs,
  audioUrl,
  currentTimeMs,
  onPartsChange,
  onSeek,
}: TimelineBarProps) {
  const waveformRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [dragPreviewMs, setDragPreviewMs] = useState<number | null>(null);
  const [dragTarget, setDragTarget] = useState<{
    partId: string;
    side: PartDragSide;
  } | null>(null);

  useEffect(() => {
    if (!waveformRef.current || !audioUrl) return;

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: "rgba(255,255,255,0.25)",
      progressColor: "rgba(255, 107, 53, 0.55)",
      cursorColor: "transparent",
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 56,
      normalize: true,
      interact: false,
    });

    wavesurferRef.current = ws;
    void ws.load(audioUrl).catch(() => {
      /* 波形読み込み失敗時はブロックのみ表示 */
    });

    return () => {
      ws.destroy();
      wavesurferRef.current = null;
    };
  }, [audioUrl]);

  const msFromClientX = useCallback(
    (clientX: number): number => {
      const el = trackRef.current;
      if (!el || durationMs <= 0) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return Math.round(ratio * durationMs);
    },
    [durationMs],
  );

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-part-block]")) return;
    onSeek(msFromClientX(e.clientX));
  };

  const handleBoundaryDrag = useCallback(
    (partId: string, side: PartDragSide, ms: number) => {
      setDragTarget({ partId, side });
      setDragPreviewMs(ms);
    },
    [],
  );

  const handleBoundaryDragEnd = useCallback(
    (partId: string, side: PartDragSide, ms: number) => {
      const next = updatePartBoundary(parts, partId, side, ms, words);
      if (next) onPartsChange(next);
      setDragTarget(null);
      setDragPreviewMs(null);
    },
    [parts, words, onPartsChange],
  );

  const playheadPct =
    durationMs > 0 ? (currentTimeMs / durationMs) * 100 : 0;

  const dragLinePct =
    dragPreviewMs !== null && durationMs > 0
      ? (dragPreviewMs / durationMs) * 100
      : null;

  return (
    <div className="glass-panel flex min-h-[8.5rem] flex-col gap-2 p-3">
      <div className="flex items-center justify-between text-xs text-white/50">
        <span>タイムライン</span>
        <span>
          {formatMs(currentTimeMs)} / {formatMs(durationMs)}
        </span>
      </div>

      <div
        ref={trackRef}
        className="relative min-h-[7rem] cursor-pointer select-none rounded-glass border border-glass-border bg-glass-deep/80"
        onClick={handleTrackClick}
      >
        <div
          ref={waveformRef}
          className="pointer-events-none absolute inset-x-0 top-0 h-14 opacity-90"
        />

        <div className="absolute inset-x-0 top-14 bottom-0" data-part-block>
          {parts.map((part, index) => (
            <PartBlock
              key={part.id}
              part={part}
              durationMs={durationMs}
              isFirst={index === 0}
              isLast={index === parts.length - 1}
              currentTimeMs={currentTimeMs}
              onBoundaryDrag={(side, ms) =>
                handleBoundaryDrag(part.id, side, ms)
              }
              onBoundaryDragEnd={(side, ms) =>
                handleBoundaryDragEnd(part.id, side, ms)
              }
              onChangeType={(type) =>
                onPartsChange(changePartType(parts, part.id, type))
              }
              onSplitSubPart={(splitMs) => {
                const next = splitPartIntoSubParts(
                  parts,
                  part.id,
                  splitMs,
                  words,
                );
                if (next) onPartsChange(next);
              }}
              onSeek={onSeek}
            />
          ))}
        </div>

        {dragLinePct !== null && dragTarget && (
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-accent"
            style={{ left: `${dragLinePct}%` }}
          />
        )}

        <div
          className="pointer-events-none absolute bottom-0 top-0 z-30 w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]"
          style={{ left: `${playheadPct}%` }}
        />
      </div>

      <PartLegend />
    </div>
  );
}

function PartLegend() {
  const items = [
    { color: "bg-blue-500", label: "本筋 (main)" },
    { color: "bg-yellow-500", label: "脱線 (tangent)" },
    { color: "bg-green-500", label: "リアクション (reaction)" },
    { color: "bg-gray-400", label: "転換 (transition)" },
  ];

  return (
    <div className="flex flex-wrap gap-3 text-[11px] text-white/55">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className={`size-2.5 rounded-sm ${item.color}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}
