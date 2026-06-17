import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { Utterance } from "@/lib/transcript/utterances";
import {
  applyUtteranceTextChange,
  defaultSplitSpeakerId,
  deleteUtterance,
  mergeUtteranceWithPrevious,
  setUtteranceSpeaker,
  splitUtteranceAtOffset,
} from "@/lib/transcript/utteranceEdit";
import { cycleSpeakerId } from "@/lib/transcript/speakerOptions";
import type { Speaker, Word } from "@/lib/schema/transcript";

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

interface EditableUtteranceBlockProps {
  utterance: Utterance;
  utteranceIndex: number;
  words: Word[];
  speakers: Speaker[];
  speakerOptions: Speaker[];
  onWordsChange: (words: Word[]) => void;
  onSeek?: (startMs: number) => void;
  isPlaybackActive?: boolean;
}

export function EditableUtteranceBlock({
  utterance,
  utteranceIndex,
  words,
  speakers,
  speakerOptions,
  onWordsChange,
  onSeek,
  isPlaybackActive = false,
}: EditableUtteranceBlockProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const segmentKey = utterance.word_ids[0]!;
  const [text, setText] = useState(utterance.text);

  useEffect(() => {
    setText(utterance.text);
  }, [utterance.text, segmentKey]);

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    const height = Math.max(el.scrollHeight, 24);
    el.style.height = `${height}px`;
  }

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    const resize = () => autoResize(el);
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, utterance.text, segmentKey]);

  const focusBlock = useCallback((index: number, at: "start" | "end") => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(
          `[data-segment-index="${index}"] textarea`,
        );
        if (!(el instanceof HTMLTextAreaElement)) return;
        el.focus();
        const pos = at === "end" ? el.value.length : 0;
        el.setSelectionRange(pos, pos);
        autoResize(el);
      });
    });
  }, []);

  const commitText = useCallback(
    (value: string) => {
      if (value === utterance.text) return;
      onWordsChange(applyUtteranceTextChange(words, segmentKey, value, speakers));
    },
    [onWordsChange, utterance.text, segmentKey, words, speakers],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const cursor = el.selectionStart ?? 0;
    const selEnd = el.selectionEnd ?? cursor;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const newSpeakerId = defaultSplitSpeakerId(
        utterance.speaker,
        speakerOptions,
      );
      if (!newSpeakerId) return;

      const value = el.value;
      onWordsChange(
        splitUtteranceAtOffset(
          words,
          segmentKey,
          value,
          cursor,
          newSpeakerId,
          speakers,
        ),
      );
      setText(value.slice(0, cursor));
      focusBlock(utteranceIndex + 1, "start");
      return;
    }

    if (e.key === "Backspace" && cursor === 0 && selEnd === cursor) {
      if (utteranceIndex === 0) return;
      e.preventDefault();
      onWordsChange(
        mergeUtteranceWithPrevious(words, segmentKey, el.value, speakers),
      );
      focusBlock(utteranceIndex - 1, "end");
    }
  };

  const borderClass = utterance.hasPendingCorrection
    ? "border-red-500/40 bg-red-500/5"
    : utterance.hasCorrection
      ? "border-emerald-500/25 bg-emerald-500/5"
      : "border-glass-border bg-glass-deep/40";

  const playbackClass = isPlaybackActive
    ? "border-l-2 border-l-accent bg-accent/10 ring-1 ring-inset ring-accent/20"
    : "";

  return (
    <div
      data-segment-key={segmentKey}
      data-segment-index={utteranceIndex}
      className={`w-full min-w-0 rounded-glass border px-3 py-2 text-left backdrop-blur-md transition-colors duration-200 ${borderClass} ${playbackClass}`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const nextId = cycleSpeakerId(utterance.speaker, speakerOptions);
            if (nextId !== utterance.speaker) {
              onWordsChange(
                setUtteranceSpeaker(
                  words,
                  segmentKey,
                  nextId,
                  speakers,
                ),
              );
            }
          }}
          className="cursor-pointer border-0 bg-transparent py-0 text-xs font-medium hover:underline focus:outline-none"
          style={{ color: utterance.speakerColor }}
          title="クリックで話者を切り替え"
          aria-label={`話者: ${utterance.speakerLabel}（クリックで切り替え）`}
        >
          {utterance.speakerLabel}
        </button>
        {onSeek ? (
          <button
            type="button"
            onClick={() => onSeek(utterance.start_ms)}
            className="text-white/40 hover:text-white/70 hover:underline"
          >
            {formatMs(utterance.start_ms)}
          </button>
        ) : (
          <span className="text-white/40">{formatMs(utterance.start_ms)}</span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onWordsChange(deleteUtterance(words, segmentKey, speakers));
          }}
          className="ml-auto rounded px-1.5 py-0.5 text-[10px] text-red-300/80 hover:bg-red-500/15 hover:text-red-200"
        >
          削除
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={text}
        rows={1}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commitText(e.target.value)}
        onKeyDown={handleKeyDown}
        className="block min-h-[1.5rem] w-full min-w-0 resize-none break-words border-0 bg-transparent p-0 text-sm leading-relaxed text-white/90 focus:outline-none"
        wrap="soft"
      />
    </div>
  );
}