import { useCallback, useRef, useState, type ReactNode } from "react";
import { TranscriptVideoPreview } from "@/components/preview/TranscriptVideoPreview";
import { TranscriptEditorPanel } from "@/components/transcript/TranscriptEditorModal";
import { SpeakerDiarizationReview } from "@/components/transcript/SpeakerDiarizationReview";
import { useTranscriptDiarizationBinding } from "@/hooks/useTranscriptDiarizationBinding";
import { useTranscriptWordsEdit } from "@/hooks/useTranscriptWordsEdit";
import { useVideoSeek } from "@/hooks/useVideoSeek";
import { AI_PROVIDER_CONFIG } from "@/lib/ai/providers";
import { useAiSettingsStore } from "@/store/aiSettingsStore";
import { usePreviewStore } from "@/store/previewStore";
import { useProjectStore } from "@/store/projectStore";

const GRID_COLS = "lg:grid-cols-[minmax(0,35fr)_minmax(0,65fr)]";

export default function CorrectionPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  useVideoSeek(videoRef);

  const project = useProjectStore((s) => s.project);
  const videoSrc = usePreviewStore((s) => s.videoSrc);
  const setCurrentTimeMs = usePreviewStore((s) => s.setCurrentTimeMs);
  const setIsPlaying = usePreviewStore((s) => s.setIsPlaying);
  const requestSeek = usePreviewStore((s) => s.requestSeek);
  const hasApiKey = useAiSettingsStore((s) => s.hasActiveProviderKey);
  const activeProvider = useAiSettingsStore((s) => s.activeProvider);
  const { pushWords, undo, redo } = useTranscriptWordsEdit();

  const handleSeek = useCallback(
    (ms: number) => {
      requestSeek(ms);
      const video = videoRef.current;
      if (video) {
        video.currentTime = ms / 1000;
      }
    },
    [requestSeek],
  );

  const diarization = useTranscriptDiarizationBinding(
    project?.words ?? [],
    project?.meta.speakers ?? [],
    pushWords,
    handleSeek,
  );

  const {
    changes,
    pendingCount,
    showReview,
    isRunning,
    onAiFix,
    onApprove,
    onReject,
    onRevert,
    onApproveAll,
    onRejectAll,
    onNavigateToChange,
  } = diarization;

  const [activeTab, setActiveTab] = useState<"transcript" | "review">(
    "transcript",
  );
  /** false: 左下=文字起こし / 右=AI校正案  true: 左下=AI校正案 / 右=文字起こし */
  const [panelsSwapped, setPanelsSwapped] = useState(false);

  const handleRunAiFix = useCallback(async () => {
    if (!hasApiKey) return;
    const result = await onAiFix();
    if (result.hasChanges) {
      setActiveTab("review");
    }
  }, [hasApiKey, onAiFix]);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-white/60">
        <div className="glass-panel-raised px-8 py-6 text-center">
          <p>プロジェクトが読み込まれていません。取り込み画面から開始してください。</p>
        </div>
      </div>
    );
  }

  const transcriptPanel = (
    <TranscriptEditorPanel
      words={project.words}
      speakers={project.meta.speakers}
      layout="fill"
      className="min-h-0 flex-1"
      onSeek={handleSeek}
      onWordsChange={pushWords}
      onUndo={undo}
      onRedo={redo}
      diarization={diarization}
      hideInlineReview
      hideHeaderAiFix
      playbackSync
    />
  );

  const reviewEmptyHint = panelsSwapped
    ? "右の「文字起こし」で内容を確認し、「AI で校正を実行」を押してください。"
    : "左下の「文字起こし」で内容を確認し、「AI で校正を実行」を押してください。";

  const reviewPanel = showReview ? (
    <SpeakerDiarizationReview
      changes={changes}
      speakers={project.meta.speakers}
      layout="fill"
      className="min-h-0 flex-1"
      onApprove={onApprove}
      onReject={onReject}
      onRevert={onRevert}
      onApproveAll={onApproveAll}
      onRejectAll={onRejectAll}
      onNavigateToChange={onNavigateToChange}
    />
  ) : (
    <div className="glass-panel flex min-h-0 flex-1 flex-col items-center justify-center gap-3 border-dashed p-8 text-center">
      <p className="text-white/60">まだ AI 校正案がありません。</p>
      <p className="text-sm text-white/45">{reviewEmptyHint}</p>
    </div>
  );

  const leftBottomSlot = panelsSwapped ? reviewPanel : transcriptPanel;
  const rightSlot = panelsSwapped ? transcriptPanel : reviewPanel;

  const videoPreview = (
    <TranscriptVideoPreview
      videoRef={videoRef}
      videoSrc={videoSrc}
      words={project.words}
      speakers={project.meta.speakers}
      className="h-[clamp(10rem,28vh,18rem)] w-full shrink-0"
      onTimeUpdate={setCurrentTimeMs}
      onPlay={() => setIsPlaying(true)}
      onPause={() => setIsPlaying(false)}
    />
  );

  const leftColumn = (
    <div className="flex min-h-0 flex-col gap-3">
      {videoPreview}
      <div className="flex min-h-0 flex-1 flex-col">{leftBottomSlot}</div>
    </div>
  );

  const rightColumn = (
    <div className="flex min-h-0 flex-1 flex-col">{rightSlot}</div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="glass-header flex shrink-0 items-center justify-between px-6 py-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-label leading-none">Phase 1 — ② 校正</p>
          <h1 className="text-lg font-semibold leading-tight tracking-tight">
            トランスクリプト校正
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setPanelsSwapped((v) => !v)}
            title={
              panelsSwapped
                ? "文字起こしを左下・AI校正案を右に戻す"
                : "AI校正案を右・文字起こしを左下に入れ替える"
            }
            className="glass-btn-ghost gap-1.5 px-3 py-1.5 text-sm"
            aria-pressed={panelsSwapped}
          >
            <LayoutToggleIcon />
            <span className="hidden sm:inline">レイアウト</span>
          </button>
          <button
            type="button"
            disabled={isRunning || !hasApiKey}
            onClick={() => void handleRunAiFix()}
            title={!hasApiKey ? "先に左下の設定から API キーを保存してください" : undefined}
            className="glass-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRunning ? "AI 修正中…" : "AI で校正を実行"}
          </button>
        </div>
      </header>

      <div className="glass-main flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-6">
        {!hasApiKey && (
          <p className="shrink-0 text-sm text-amber-200/90">
            AI 校正を実行するには、左サイドバー下部の「設定」から{" "}
            {AI_PROVIDER_CONFIG[activeProvider].label} の API
            キーを登録してください。
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 lg:hidden">
          <div className="glass-segment ml-auto text-sm">
            <TabButton
              active={activeTab === "transcript"}
              onClick={() => setActiveTab("transcript")}
            >
              文字起こし
            </TabButton>
            <TabButton
              active={activeTab === "review"}
              onClick={() => setActiveTab("review")}
              badge={pendingCount > 0 ? pendingCount : undefined}
            >
              AI校正案
            </TabButton>
          </div>
        </div>

        <div className={`grid min-h-0 flex-1 gap-4 ${GRID_COLS}`}>
          {/* モバイル: 動画は常に上、タブで下の内容を切替 */}
          <div className="flex min-h-0 flex-col gap-3 lg:hidden">
            {videoPreview}
            <div
              className={`flex min-h-0 flex-1 flex-col ${
                activeTab === "transcript" ? "" : "hidden"
              }`}
            >
              {transcriptPanel}
            </div>
            <div
              className={`flex min-h-0 flex-1 flex-col ${
                activeTab === "review" ? "" : "hidden"
              }`}
            >
              {reviewPanel}
            </div>
          </div>

          {/* デスクトップ: 左（動画固定 + 下スロット）+ 右スロット */}
          <div className="hidden min-h-0 flex-col lg:flex">{leftColumn}</div>
          <div className="hidden min-h-0 flex-col lg:flex">{rightColumn}</div>
        </div>
      </div>
    </div>
  );
}

function LayoutToggleIcon() {
  return (
    <svg
      aria-hidden
      className="size-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <rect x="3" y="5" width="7" height="6" rx="1" />
      <rect x="3" y="13" width="7" height="6" rx="1" />
      <rect x="12" y="5" width="9" height="14" rx="1" />
      <path d="M10 12h2" />
    </svg>
  );
}

function TabButton({
  active,
  onClick,
  children,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`glass-segment-item relative ${
        active ? "glass-segment-item-active" : "hover:text-white/80"
      }`}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}
