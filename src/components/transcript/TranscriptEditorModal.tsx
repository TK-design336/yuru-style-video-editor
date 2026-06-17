import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SpeakerDiarizationReview } from "@/components/transcript/SpeakerDiarizationReview";
import { TranscriptViewer } from "@/components/transcript/TranscriptViewer";
import {
  useTranscriptDiarizationBinding,
  type TranscriptDiarizationBinding,
} from "@/hooks/useTranscriptDiarizationBinding";
import type { Speaker, Word } from "@/lib/schema/transcript";
import { useAiSettingsStore } from "@/store/aiSettingsStore";
import type { SpeakerDiarizationChange } from "@/lib/transcript/speakerDiarizationDiff";

interface TranscriptEditorModalProps {
  open: boolean;
  onClose: () => void;
  words: Word[];
  speakers: Speaker[];
  onWordsChange: (words: Word[]) => void;
  onSeek?: (startMs: number) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  changes: SpeakerDiarizationChange[];
  showReview: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRevert: (id: string) => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
  onNavigateToChange: (change: SpeakerDiarizationChange) => void;
  scrollToUtteranceIndex: { index: number; nonce: number } | null;
  playbackSync?: boolean;
}

export function TranscriptEditorModal({
  open,
  onClose,
  words,
  speakers,
  onWordsChange,
  onSeek,
  onUndo,
  onRedo,
  changes,
  showReview,
  onApprove,
  onReject,
  onRevert,
  onApproveAll,
  onRejectAll,
  onNavigateToChange,
  scrollToUtteranceIndex,
  playbackSync = false,
}: TranscriptEditorModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-5">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="閉じる"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="glass-panel-deep relative z-10 flex h-[min(92vh,56rem)] w-full max-w-6xl flex-col rounded-glass-lg border border-glass-border-strong shadow-glass"
      >
        <ModalHeader titleId={titleId} onClose={onClose} />

        {showReview && (
          <div className="shrink-0 px-4 pt-3">
            <SpeakerDiarizationReview
              changes={changes}
              speakers={speakers}
              onApprove={onApprove}
              onReject={onReject}
              onRevert={onRevert}
              onApproveAll={onApproveAll}
              onRejectAll={onRejectAll}
              onNavigateToChange={onNavigateToChange}
            />
          </div>
        )}

        <div className="min-h-0 flex-1 p-4 pt-3">
          <TranscriptViewer
            words={words}
            speakers={speakers}
            layout="fill"
            className="h-full"
            onSeek={onSeek}
            onWordsChange={onWordsChange}
            onUndo={onUndo}
            onRedo={onRedo}
            scrollToUtteranceIndex={scrollToUtteranceIndex}
            playbackSync={playbackSync}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ModalHeader({
  titleId,
  onClose,
}: {
  titleId: string;
  onClose: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-glass-border px-4 py-3">
      <div className="min-w-0">
        <h2 id={titleId} className="text-base font-semibold text-white">
          文字起こし編集
        </h2>
        <p className="text-xs text-white/45">
          拡大表示モード — 発話ブロックの編集ができます
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="glass-btn-icon shrink-0"
        aria-label="閉じる"
      >
        ✕
      </button>
    </div>
  );
}

export function AiFixButton({
  onClick,
  isRunning,
  hasApiKey,
  pendingCount,
  size = "default",
}: {
  onClick: () => void;
  isRunning: boolean;
  hasApiKey: boolean;
  pendingCount?: number;
  size?: "default" | "compact";
}) {
  const compact = size === "compact";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isRunning || !hasApiKey}
      title={
        !hasApiKey
          ? "先に AI API キーを設定してください"
          : "AI に話者割り振りの誤りを修正させます"
      }
      className={`relative glass-btn-secondary border-amber-500/30 text-amber-100 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50 ${
        compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"
      }`}
    >
      {isRunning ? "AI 修正中…" : "AI 修正"}
      {pendingCount !== undefined && pendingCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-black">
          {pendingCount}
        </span>
      )}
    </button>
  );
}

interface TranscriptEditorPanelProps {
  words: Word[];
  speakers: Speaker[];
  className?: string;
  layout?: "fill" | "panel";
  onSeek?: (startMs: number) => void;
  onWordsChange: (words: Word[]) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  /** 親が AI 校正 state を共有する場合（校正画面など） */
  diarization?: TranscriptDiarizationBinding;
  /** インライン review を隠す（別カラム表示時） */
  hideInlineReview?: boolean;
  /** ヘッダーの AI 修正ボタンを隠す */
  hideHeaderAiFix?: boolean;
  /** 動画再生位置と同期してハイライト・自動スクロールする */
  playbackSync?: boolean;
}

/**
 * 文字起こし表示 + 拡大モーダル + AI 話者修正をまとめたパネル。
 */
export function TranscriptEditorPanel({
  words,
  speakers,
  className = "",
  layout = "fill",
  onSeek,
  onWordsChange,
  onUndo,
  onRedo,
  diarization: externalDiarization,
  hideInlineReview = false,
  hideHeaderAiFix = false,
  playbackSync = false,
}: TranscriptEditorPanelProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const hasApiKey = useAiSettingsStore((s) => s.hasActiveProviderKey);
  const internalDiarization = useTranscriptDiarizationBinding(
    words,
    speakers,
    onWordsChange,
    onSeek,
  );
  const diarization = externalDiarization ?? internalDiarization;
  const {
    isRunning,
    changes,
    pendingCount,
    showReview,
    onAiFix,
    onApprove,
    onReject,
    onRevert,
    onApproveAll,
    onRejectAll,
    onNavigateToChange,
    scrollToUtteranceIndex,
  } = diarization;

  const headerActions: ReactNode = (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="glass-btn-ghost px-2 py-1 text-xs"
        title="拡大して編集"
      >
        拡大
      </button>
      {!hideHeaderAiFix && (
        <AiFixButton
          onClick={() => void onAiFix()}
          isRunning={isRunning}
          hasApiKey={hasApiKey}
          pendingCount={pendingCount}
          size="compact"
        />
      )}
    </>
  );

  return (
    <>
      <div className={`flex min-h-0 flex-col gap-2 ${className}`}>
        {showReview && !hideInlineReview && (
          <SpeakerDiarizationReview
            changes={changes}
            speakers={speakers}
            onApprove={onApprove}
            onReject={onReject}
            onRevert={onRevert}
            onApproveAll={onApproveAll}
            onRejectAll={onRejectAll}
            onNavigateToChange={onNavigateToChange}
          />
        )}
        <TranscriptViewer
          words={words}
          speakers={speakers}
          layout={layout}
          className={layout === "panel" ? "shrink-0" : "min-h-0 flex-1"}
          onSeek={onSeek}
          onWordsChange={onWordsChange}
          onUndo={onUndo}
          onRedo={onRedo}
          headerActions={headerActions}
          scrollToUtteranceIndex={scrollToUtteranceIndex}
          playbackSync={playbackSync}
        />
      </div>

      <TranscriptEditorModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        words={words}
        speakers={speakers}
        onWordsChange={onWordsChange}
        onSeek={onSeek}
        onUndo={onUndo}
        onRedo={onRedo}
        changes={changes}
        showReview={showReview}
        onApprove={onApprove}
        onReject={onReject}
        onRevert={onRevert}
        onApproveAll={onApproveAll}
        onRejectAll={onRejectAll}
        onNavigateToChange={onNavigateToChange}
        scrollToUtteranceIndex={scrollToUtteranceIndex}
        playbackSync={playbackSync}
      />
    </>
  );
}
