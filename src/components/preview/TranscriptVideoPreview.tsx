import { useMemo, type RefObject } from "react";
import {
  buildUtterances,
  findUtteranceAtTime,
} from "@/lib/transcript/utterances";
import type { Speaker, Word } from "@/lib/schema/transcript";
import { usePreviewStore } from "@/store/previewStore";

interface TranscriptVideoPreviewProps {
  videoRef: RefObject<HTMLVideoElement>;
  videoSrc: string | null;
  words: Word[];
  speakers: Speaker[];
  className?: string;
  emptyMessage?: string;
  onTimeUpdate?: (ms: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
}

export function TranscriptVideoPreview({
  videoRef,
  videoSrc,
  words,
  speakers,
  className = "",
  emptyMessage = "動画プレビューがありません。文字起こし画面で動画を選択してください。",
  onTimeUpdate,
  onPlay,
  onPause,
}: TranscriptVideoPreviewProps) {
  const currentTimeMs = usePreviewStore((s) => s.currentTimeMs);

  const utterances = useMemo(
    () => buildUtterances(words, speakers),
    [words, speakers],
  );

  const activeUtterance = useMemo(
    () => findUtteranceAtTime(utterances, currentTimeMs),
    [utterances, currentTimeMs],
  );

  return (
    <div className={`glass-preview relative ${className}`}>
      {videoSrc ? (
        <>
          <video
            ref={videoRef}
            src={videoSrc}
            className="h-full w-full object-contain"
            controls
            onTimeUpdate={(e) =>
              onTimeUpdate?.(
                Math.round(e.currentTarget.currentTime * 1000),
              )
            }
            onPlay={onPlay}
            onPause={onPause}
          />
          {activeUtterance && (
            <div
              className="group pointer-events-auto absolute inset-x-0 top-0 z-10 cursor-default bg-gradient-to-b from-black/80 via-black/45 to-transparent px-2.5 pb-3 pt-1.5"
              aria-live="polite"
            >
              <p className="mx-auto max-w-full text-center text-[10px] leading-[1.35] text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] line-clamp-2 group-hover:line-clamp-none">
                <span
                  className="font-semibold"
                  style={{ color: activeUtterance.speakerColor }}
                >
                  {activeUtterance.speakerLabel}
                </span>
                <span className="text-white/85">: </span>
                <span>{activeUtterance.text}</span>
              </p>
            </div>
          )}
        </>
      ) : (
        <p className="px-4 text-center text-sm text-white/40">{emptyMessage}</p>
      )}
    </div>
  );
}
