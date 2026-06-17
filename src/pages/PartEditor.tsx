import { useCallback, useRef, useState } from "react";
import { TimelineBar } from "@/components/timeline/TimelineBar";
import { useAIProcess } from "@/hooks/useAIProcess";
import { useVideoSeek } from "@/hooks/useVideoSeek";
import { AI_PROVIDER_CONFIG } from "@/lib/ai/providers";
import { useAiSettingsStore } from "@/store/aiSettingsStore";
import { usePreviewStore } from "@/store/previewStore";
import { useProjectStore } from "@/store/projectStore";

interface PartEditorProps {
  onNext?: () => void;
}

export default function PartEditor({ onNext }: PartEditorProps) {
  const project = useProjectStore((s) => s.project);
  const setParts = useProjectStore((s) => s.setParts);
  const videoSrc = usePreviewStore((s) => s.videoSrc);
  const currentTimeMs = usePreviewStore((s) => s.currentTimeMs);
  const setCurrentTimeMs = usePreviewStore((s) => s.setCurrentTimeMs);
  const setIsPlaying = usePreviewStore((s) => s.setIsPlaying);
  const requestSeek = usePreviewStore((s) => s.requestSeek);
  const hasApiKey = useAiSettingsStore((s) => s.hasActiveProviderKey);
  const activeProvider = useAiSettingsStore((s) => s.activeProvider);
  const { runPartSeparation, isPartSeparationRunning } = useAIProcess();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [separationRun, setSeparationRun] = useState(
    () => (project?.parts.length ?? 0) > 0,
  );

  useVideoSeek(videoRef);

  const durationMs =
    project?.meta.duration_ms ??
    project?.words[project.words.length - 1]?.end_ms ??
    0;

  const handleRunSeparation = useCallback(async () => {
    if (!hasApiKey) return;
    const result = await runPartSeparation();
    if (result !== null) {
      setSeparationRun(true);
    }
  }, [hasApiKey, runPartSeparation]);

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

  const canProceed = separationRun && (project?.parts.length ?? 0) > 0;

  if (!project) {
    return (
      <div className="app-shell flex h-screen items-center justify-center text-white/60">
        <div className="glass-panel-raised px-8 py-6 text-center">
          <p>プロジェクトが読み込まれていません。取り込み画面から開始してください。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-white">
      <header className="glass-header flex shrink-0 items-center justify-between px-6 py-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-label leading-none">Phase 1 — ③ カット編集</p>
          <h1 className="text-lg font-semibold leading-tight tracking-tight">Part 分割・確認</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={isPartSeparationRunning || !hasApiKey}
            onClick={() => void handleRunSeparation()}
            title={!hasApiKey ? "先に API キーを保存してください" : undefined}
            className="glass-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPartSeparationRunning ? "AI 分割中…" : "AI 分割実行"}
          </button>
        </div>
      </header>

      <div className="glass-main flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-6">
        {!hasApiKey && (
          <p className="text-sm text-amber-200/90">
            AI 分割を実行するには、左サイドバー下部の「設定」から{" "}
            {AI_PROVIDER_CONFIG[activeProvider].label} の API
            キーを登録してください。
          </p>
        )}

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-3">
            <TimelineBar
              parts={project.parts}
              words={project.words}
              durationMs={durationMs}
              audioUrl={videoSrc}
              currentTimeMs={currentTimeMs}
              onPartsChange={setParts}
              onSeek={handleSeek}
            />
            <p className="text-xs text-white/45">
              境界はドラッグで調整（最小幅 5 秒・word 境界にスナップ）。Segment
              を右クリックで種別変更・Sub-Segment 分割ができます。
            </p>
          </div>

          <div className="flex min-h-0 flex-col gap-2">
            <p className="text-label">プレビュー</p>
            <div className="glass-preview min-h-0 flex-1">
              {videoSrc ? (
                <video
                  ref={videoRef}
                  src={videoSrc}
                  className="h-full w-full object-contain"
                  controls
                  onTimeUpdate={(e) =>
                    setCurrentTimeMs(
                      Math.round(e.currentTarget.currentTime * 1000),
                    )
                  }
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
              ) : (
                <p className="px-4 text-center text-sm text-white/40">
                  動画プレビューがありません。取り込み画面で動画を選択してください。
                </p>
              )}
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-glass-border pt-4">
          <p className="text-sm text-white/50">
            {!separationRun
              ? "AI 分割を実行し、タイムライン上で境界を確認・調整してください。"
              : project.parts.length === 0
                ? "Part が 1 件以上必要です。"
                : "Part 分割の確認が完了したら次へ進めます。"}
          </p>
          {onNext && (
            <button
              type="button"
              disabled={!canProceed}
              onClick={onNext}
              title={
                !canProceed
                  ? !separationRun
                    ? "先に AI 分割を実行してください"
                    : "Part が設定されていません"
                  : undefined
              }
              className="glass-btn-primary px-5 py-2.5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Importance 判定へ進む
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
