import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EditableUtteranceBlock } from "@/components/transcript/EditableUtteranceBlock";
import type { Speaker, Word } from "@/lib/schema/transcript";
import { buildSpeakerOptions } from "@/lib/transcript/speakerOptions";
import {
  buildUtterances,
  findUtteranceIndexAtTime,
} from "@/lib/transcript/utterances";
import { usePreviewStore } from "@/store/previewStore";

const PAGE_SIZE = 60;

const TRANSCRIPT_EDIT_HELP =
  "話者名クリック: 話者を順に切り替え。Enter: カーソル以降を別話者の新規ブロックとして直後に挿入。先頭 Backspace: このブロックを削除して直前ブロック末尾に結合。Ctrl+Z / Ctrl+Y で元に戻す。Ctrl+F でブラウザ検索。";

const TRANSCRIPT_READ_HELP =
  "同一話者の発話は1ブロックにまとめて表示します。話者IDは NeMo MSDD による分離結果です。";

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function hasActiveTextSelection(): boolean {
  const sel = window.getSelection();
  return Boolean(sel && sel.toString().length > 0);
}

/** fill: 親が高さを持つとき内部スクロール / panel: 親パネルごとスクロール・自然な高さ */
export type TranscriptViewerLayout = "fill" | "panel";

interface TranscriptViewerProps {
  words: Word[];
  speakers: Speaker[];
  className?: string;
  onSeek?: (startMs: number) => void;
  layout?: TranscriptViewerLayout;
  /** 指定時は発話テキストを手動編集可能 */
  onWordsChange?: (words: Word[]) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  /** ヘッダー右側に表示する追加アクション（拡大・AI 修正など） */
  headerActions?: ReactNode;
  /** 指定インデックスの発話ブロックへスクロール */
  scrollToUtteranceIndex?: { index: number; nonce: number } | null;
  /** 動画再生位置と同期してハイライト・自動スクロールする */
  playbackSync?: boolean;
}

export function TranscriptViewer({
  words,
  speakers,
  className = "",
  onSeek,
  layout = "fill",
  onWordsChange,
  onUndo,
  onRedo,
  headerActions,
  scrollToUtteranceIndex = null,
  playbackSync = false,
}: TranscriptViewerProps) {
  const editable = Boolean(onWordsChange);
  const listRef = useRef<HTMLUListElement>(null);
  const prevPlaybackIndexRef = useRef(-1);
  const wasPlayingRef = useRef(false);
  const currentTimeMs = usePreviewStore((s) => s.currentTimeMs);
  const isPlaying = usePreviewStore((s) => s.isPlaying);

  useEffect(() => {
    if (!editable || (!onUndo && !onRedo)) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        onUndo?.();
        return;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "y" || (e.key === "z" && e.shiftKey))
      ) {
        e.preventDefault();
        onRedo?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editable, onUndo, onRedo]);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const utterances = useMemo(
    () => buildUtterances(words, speakers),
    [words, speakers],
  );

  const speakerOptions = useMemo(
    () => buildSpeakerOptions(speakers, words.map((w) => w.speaker)),
    [speakers, words],
  );

  const visible = utterances.slice(0, visibleCount);
  const hasMore = visibleCount < utterances.length;

  const activeUtteranceIndex = useMemo(() => {
    if (!playbackSync) return -1;
    return findUtteranceIndexAtTime(utterances, currentTimeMs);
  }, [playbackSync, utterances, currentTimeMs]);

  useEffect(() => {
    if (!scrollToUtteranceIndex) return;
    const { index } = scrollToUtteranceIndex;

    if (index >= visibleCount) {
      setVisibleCount(Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE);
      return;
    }

    const frame = requestAnimationFrame(() => {
      const el = listRef.current?.querySelector(
        `[data-segment-index="${index}"]`,
      );
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollToUtteranceIndex, visibleCount]);

  useEffect(() => {
    if (!playbackSync || !isPlaying || activeUtteranceIndex < 0) return;

    const playJustStarted = !wasPlayingRef.current;
    wasPlayingRef.current = true;

    if (activeUtteranceIndex >= visibleCount) {
      setVisibleCount(
        Math.ceil((activeUtteranceIndex + 1) / PAGE_SIZE) * PAGE_SIZE,
      );
      return;
    }

    if (
      !playJustStarted &&
      activeUtteranceIndex === prevPlaybackIndexRef.current
    ) {
      return;
    }
    prevPlaybackIndexRef.current = activeUtteranceIndex;

    const frame = requestAnimationFrame(() => {
      const el = listRef.current?.querySelector(
        `[data-segment-index="${activeUtteranceIndex}"]`,
      );
      el?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [playbackSync, isPlaying, activeUtteranceIndex, visibleCount]);

  useEffect(() => {
    if (!isPlaying) {
      wasPlayingRef.current = false;
      prevPlaybackIndexRef.current = activeUtteranceIndex;
    }
  }, [isPlaying, activeUtteranceIndex]);

  if (words.length === 0) {
    return (
      <div
        className={`glass-panel flex items-center justify-center border-dashed p-6 text-sm text-white/50 ${className}`}
      >
        文字起こし結果がありません
      </div>
    );
  }

  const isPanel = layout === "panel";

  return (
    <div
      className={`glass-panel flex flex-col ${
        isPanel ? "min-h-[20rem]" : "min-h-0"
      } ${className}`}
    >
      <div className="shrink-0 border-b border-glass-border px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3
            className="cursor-help text-sm font-medium text-white"
            title={editable ? TRANSCRIPT_EDIT_HELP : TRANSCRIPT_READ_HELP}
          >
            文字起こし
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-white/45">
              単語 {words.length.toLocaleString()} · 発話{" "}
              {utterances.length.toLocaleString()}
            </span>
            {headerActions}
          </div>
        </div>
      </div>

      <ul
        ref={listRef}
        className={
          isPanel
            ? "min-h-[14rem] space-y-2 p-3"
            : "min-h-0 flex-1 space-y-2 overflow-y-auto p-3"
        }
      >
        {visible.map((utt) => {
          const utteranceIndex = utterances.findIndex((u) => u.id === utt.id);
          const segmentKey = utt.word_ids[0] ?? utt.id;
          const isPlaybackActive =
            playbackSync && utteranceIndex === activeUtteranceIndex;
          const playbackHighlightClass = isPlaybackActive
            ? "border-l-2 border-l-accent bg-accent/10 ring-1 ring-inset ring-accent/20"
            : "";
          return (
            <li key={segmentKey} className="min-w-0">
              {editable && onWordsChange ? (
                <EditableUtteranceBlock
                  utterance={utt}
                  utteranceIndex={utteranceIndex}
                  words={words}
                  speakers={speakers}
                  speakerOptions={speakerOptions}
                  onWordsChange={onWordsChange}
                  onSeek={onSeek}
                  isPlaybackActive={isPlaybackActive}
                />
              ) : (
                <div
                  data-segment-index={utteranceIndex}
                  role={onSeek ? "button" : undefined}
                  tabIndex={onSeek ? 0 : undefined}
                  onClick={() => {
                    if (!onSeek || hasActiveTextSelection()) return;
                    onSeek(utt.start_ms);
                  }}
                  onKeyDown={(e) => {
                    if (!onSeek) return;
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    onSeek(utt.start_ms);
                  }}
                  className={`select-text w-full rounded-glass border px-3 py-2 text-left backdrop-blur-md transition-colors duration-200 ${
                    onSeek ? "cursor-pointer hover:bg-white/5" : ""
                  } ${
                    utt.hasPendingCorrection
                      ? "border-red-500/40 bg-red-500/5"
                      : utt.hasCorrection
                        ? "border-emerald-500/25 bg-emerald-500/5"
                        : "border-glass-border bg-glass-deep/40"
                  } ${playbackHighlightClass}`}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className="font-medium"
                      style={{ color: utt.speakerColor }}
                    >
                      {utt.speakerLabel}
                    </span>
                    <span className="text-meta">{formatMs(utt.start_ms)}</span>
                    {utt.hasPendingCorrection && (
                      <span className="rounded bg-red-600/70 px-1.5 py-0.5 text-[10px] text-red-50">
                        要校正
                      </span>
                    )}
                    {utt.hasCorrection && !utt.hasPendingCorrection && (
                      <span className="rounded bg-emerald-600/40 px-1.5 py-0.5 text-[10px] text-emerald-100">
                        校正済
                      </span>
                    )}
                  </div>
                  <p className="break-words text-sm leading-relaxed text-white/90">
                    {utt.text}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {(hasMore || utterances.length > PAGE_SIZE) && (
        <div className="shrink-0 border-t border-glass-border px-3 py-2">
          {hasMore ? (
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              className="glass-btn-secondary w-full py-1.5 text-xs"
            >
              さらに表示（残り{" "}
              {(utterances.length - visibleCount).toLocaleString()} 発話）
            </button>
          ) : (
            <p className="text-center text-xs text-white/40">
              すべて表示しました（{utterances.length.toLocaleString()} 発話）
            </p>
          )}
        </div>
      )}
    </div>
  );
}
