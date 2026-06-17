import { useCallback, useEffect, useRef, useState } from "react";
import { VideoImportZone } from "@/components/ingest/VideoImportZone";
import { SpeakerPanel } from "@/components/panels/SpeakerPanel";
import { TranscriptionOptionsPanel } from "@/components/panels/TranscriptionOptionsPanel";
import { WhisperXSetupPanel } from "@/components/panels/WhisperXSetupPanel";
import { TranscriptEditorPanel } from "@/components/transcript/TranscriptEditorModal";
import { useTranscriptWordsEdit } from "@/hooks/useTranscriptWordsEdit";
import { useVideoSeek } from "@/hooks/useVideoSeek";
import { deriveIngestStep, type IngestStep } from "@/lib/ingest/deriveIngestStep";
import {
  probeWhisperXEnvironment,
  runWhisperXTranscription,
  type WhisperXEnvironment,
  type WhisperxProgress,
} from "@/lib/ingest/whisperx";
import {
  defaultProjectFileName,
  pickProjectOpenFile,
  pickProjectSaveFile,
  readProjectFile,
  writeProjectFile,
} from "@/lib/project/persistence";
import { syncStyleSpeakerOverride } from "@/lib/speakers";
import { isTauri } from "@/lib/tauri/env";
import {
  fileNameFromPath,
  pickVideoFile,
  toVideoSrc,
} from "@/lib/tauri/video";
import {
  createEmptyProject,
  useProjectStore,
} from "@/store/projectStore";
import { usePreviewStore } from "@/store/previewStore";
import { useStyleStore } from "@/store/styleStore";
import { showBanner, showToast } from "@/store/toastStore";

interface IngestProps {
  onProceedToCorrection?: () => void;
}

export default function Ingest({ onProceedToCorrection }: IngestProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useVideoSeek(videoRef);

  const project = useProjectStore((s) => s.project);
  const isDirty = useProjectStore((s) => s.isDirty);
  const setProject = useProjectStore((s) => s.setProject);
  const loadProject = useProjectStore((s) => s.loadProject);
  const clearProject = useProjectStore((s) => s.clearProject);
  const markClean = useProjectStore((s) => s.markClean);
  const { pushWords, undo, redo } = useTranscriptWordsEdit();
  const setSpeakerOverride = useStyleStore((s) => s.setSpeakerOverride);

  const videoSrc = usePreviewStore((s) => s.videoSrc);
  const videoPath = usePreviewStore((s) => s.videoPath);
  const setVideo = usePreviewStore((s) => s.setVideo);
  const setDurationMs = usePreviewStore((s) => s.setDurationMs);
  const setCurrentTimeMs = usePreviewStore((s) => s.setCurrentTimeMs);
  const setIsPlaying = usePreviewStore((s) => s.setIsPlaying);

  const [step, setStep] = useState<IngestStep>(() =>
    deriveIngestStep(videoPath, project),
  );
  const [projectFilePath, setProjectFilePath] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [whisperEnv, setWhisperEnv] = useState<WhisperXEnvironment | null>(null);
  const [envCheckError, setEnvCheckError] = useState<string | null>(null);
  const [envChecking, setEnvChecking] = useState(false);
  const [envCheckLabel, setEnvCheckLabel] = useState<string | null>(null);
  const [transcriptionProgress, setTranscriptionProgress] =
    useState<WhisperxProgress | null>(null);
  const [transcriptionDone, setTranscriptionDone] = useState(
    () => (project?.words.length ?? 0) > 0,
  );
  const speakerAsideRef = useRef<HTMLElement>(null);

  const showSpeakerPanel =
    step === "speakers" || step === "done" || transcriptionDone;
  const wordCount = project?.words.length ?? 0;
  const showTranscript = showSpeakerPanel && wordCount > 0;
  const durationMs = project?.meta.duration_ms ?? 0;
  const durationMin =
    durationMs > 0 ? Math.max(1, Math.round(durationMs / 60000)) : null;

  const refreshEnvironment = useCallback(async (force = false) => {
    if (!isTauri()) return;
    setEnvChecking(true);
    setEnvCheckError(null);
    setEnvCheckLabel("基本環境を確認中");
    const result = await probeWhisperXEnvironment({
      force,
      onProgress: (progress) => setEnvCheckLabel(progress.label),
    });
    setEnvChecking(false);
    setEnvCheckLabel(null);
    if (!result.success) {
      setWhisperEnv(null);
      setEnvCheckError(result.error);
      return;
    }
    setWhisperEnv(result.environment);
  }, []);

  useEffect(() => {
    if (videoPath && step === "transcribe" && isTauri()) {
      void refreshEnvironment();
    }
  }, [videoPath, step, refreshEnvironment]);

  const applyVideoPath = useCallback(
    (path: string) => {
      const name = fileNameFromPath(path);
      const src = toVideoSrc(path);
      setVideo(path, src);
      setProjectFilePath(null);

      const empty = createEmptyProject({
        source_video: name,
        source_video_path: path,
      });
      const result = setProject(empty);
      if (!result.success) {
        setStatusMessage(result.error);
        return false;
      }
      setTranscriptionDone(false);

      setStep("transcribe");
      setStatusMessage(`動画を読み込みました: ${name}`);
      return true;
    },
    [setProject, setVideo],
  );

  const loadProjectFromPath = useCallback(
    async (path: string) => {
      try {
        const raw = await readProjectFile(path);
        const result = loadProject(raw);
        if (!result.success) {
          setStatusMessage(result.error);
          showToast(result.error, "error");
          return;
        }
        setProjectFilePath(path);
        const video = result.data.meta.source_video_path;
        if (video) {
          setVideo(video, toVideoSrc(video));
        } else {
          setVideo(null, null);
        }
        const nextStep = deriveIngestStep(video || null, result.data);
        setStep(nextStep);
        setTranscriptionDone(result.data.words.length > 0);
        setStatusMessage(
          `プロジェクトを読み込みました: ${fileNameFromPath(path)}`,
        );
        showBanner("プロジェクトを読み込みました", "success");
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : `読み込みに失敗しました: ${String(e)}`;
        setStatusMessage(msg);
        showToast(msg, "error");
      }
    },
    [loadProject, setVideo],
  );

  const handlePickVideo = useCallback(async () => {
    if (!isTauri()) {
      setStatusMessage(
        "ブラウザプレビューでは動画選択は未対応です。Tauri で起動してください。",
      );
      return;
    }
    setStatusMessage(null);
    const path = await pickVideoFile();
    if (!path) return;
    applyVideoPath(path);
  }, [applyVideoPath]);

  const handleOpenProject = useCallback(async () => {
    if (!isTauri()) {
      setStatusMessage("プロジェクトの読み込みは Tauri 環境でのみ利用できます。");
      return;
    }
    const path = await pickProjectOpenFile();
    if (!path) return;
    await loadProjectFromPath(path);
  }, [loadProjectFromPath]);

  const handleSaveProject = useCallback(async () => {
    const snapshot = useProjectStore.getState().project;
    if (!snapshot) {
      showToast("保存するプロジェクトがありません", "error");
      return;
    }
    if (!isTauri()) return;

    let path = projectFilePath;
    if (!path) {
      path = await pickProjectSaveFile(
        defaultProjectFileName(snapshot.meta.source_video || "project"),
      );
      if (!path) return;
    }
    try {
      await writeProjectFile(path, snapshot);
      setProjectFilePath(path);
      markClean();
      showToast("プロジェクトを保存しました", "success");
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : `保存に失敗しました: ${String(e)}`;
      showToast(msg, "error");
    }
  }, [projectFilePath, markClean]);

  const handleRemoveVideo = useCallback(() => {
    const current = useProjectStore.getState().project;
    const dirty = useProjectStore.getState().isDirty;
    const hasWork =
      dirty || (current?.words.length ?? 0) > 0 || (current?.parts.length ?? 0) > 0;

    if (hasWork) {
      const proceed = window.confirm(
        "現在のプロジェクトに未保存の変更または作業内容があります。\n先にプロジェクトを保存することをお勧めします。\n\nこのまま動画を取り除き、別の動画を選び直しますか？",
      );
      if (!proceed) return;
    }

    clearProject();
    setVideo(null, null);
    setProjectFilePath(null);
    setStep("select");
    setTranscriptionDone(false);
    setStatusMessage(null);
    setWhisperEnv(null);
  }, [clearProject, setVideo]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;

    const ms = Math.round(video.duration * 1000);
    setDurationMs(ms);

    if (project && project.meta.duration_ms === 0) {
      loadProject({
        ...project,
        meta: { ...project.meta, duration_ms: ms },
      });
    }
  }, [project, loadProject, setDurationMs]);

  const runTranscription = useCallback(
    async (forceDemo: boolean) => {
      if (!project?.meta.source_video_path) {
        setStatusMessage("先に動画ファイルを選択してください。");
        return;
      }

      if (!forceDemo && whisperEnv && !whisperEnv.ready) {
        setStatusMessage(
          "文字起こし環境が未整備のため本番実行できません。下のセットアップを完了してください。",
        );
        return;
      }

      if (
        !forceDemo &&
        whisperEnv &&
        (whisperEnv.pytorch_is_cpu_build || !whisperEnv.cuda_available) &&
        durationMin &&
        durationMin >= 10
      ) {
        const proceed = window.confirm(
          `PyTorch が CPU 版のため、約${durationMin}分の動画は RAM を大量に使い非常に遅くなります（GPU 0% のまま）。\n\n` +
            "セットアップで「PyTorch (GPU版 / RTX 50対応) をインストール」→「環境を再確認」してから実行することを強く推奨します。\n\n" +
            "このまま CPU で続行しますか？",
        );
        if (!proceed) return;
      }

      setTranscriptionDone(false);
      setIsTranscribing(true);
      setTranscriptionProgress({
        stage: "load_model",
        label: "準備中…",
        ratio: 0,
      });
      setStatusMessage(
        forceDemo
          ? "デモ用サンプルを読み込み中…（実動画の内容ではありません）"
          : durationMin && durationMin >= 30
            ? `Whisper + NeMo で全編を処理中…（約${durationMin}分の動画は数十分〜数時間かかることがあります）`
            : "Whisper + NeMo で文字起こし・話者識別を実行中…",
      );

      let result: Awaited<ReturnType<typeof runWhisperXTranscription>>;
      try {
        result = await runWhisperXTranscription(project, {
          forceDemo,
          onProgress: setTranscriptionProgress,
        });
      } catch (e) {
        setIsTranscribing(false);
        setTranscriptionProgress(null);
        setStatusMessage(
          e instanceof Error
            ? `予期しないエラー: ${e.message}`
            : `予期しないエラー: ${String(e)}`,
        );
        return;
      } finally {
        setIsTranscribing(false);
        setTranscriptionProgress(null);
      }

      if (!result.success) {
        if (result.environment) {
          setWhisperEnv(result.environment);
        }
        setStatusMessage(result.error);
        return;
      }

      const saved = setProject(result.project);
      if (!saved.success) {
        setStatusMessage(
          `文字起こし結果の保存に失敗しました（画面は進みません）:\n${saved.error}`,
        );
        return;
      }

      setStep("speakers");
      setTranscriptionDone(true);
      showBanner(
        "文字起こしが完了しました\n次は画面右の「話者ラベル」パネルでマージと表示名を設定してください。",
        "success",
      );
      requestAnimationFrame(() => {
        speakerAsideRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });

      const engineLabel = result.isDemo
        ? "デモ（固定サンプル・実動画ではない）"
        : "Whisper + NeMo（本番）";
      const idList = result.speakerIds.join(", ");
      let msg =
        `① ${engineLabel} 完了: 単語 ${result.wordCount} 件を話者ID付きで保存しました。\n` +
        `検出された話者ID (${result.speakerIds.length}件): ${idList}\n` +
        `② 右のパネル「話者ラベル」で、誤分割のマージ・表示名・位置を設定してください。`;

      if (result.qualityWarning) {
        msg += `\n\n⚠ ${result.qualityWarning}`;
      }
      if (result.exceedsDetectedLimit) {
        msg += `\n※ 話者IDが多すぎます。マージして4人以下にしてください。`;
      } else if (result.speakerIds.length > 4) {
        msg += `\n話者が ${result.speakerIds.length} 人です。マージして4人以下にしてください。`;
      }
      if (result.note) {
        msg += `\n${result.note}`;
      }
      if (result.deviceUsed) {
        msg += `\n実行デバイス: ${result.deviceUsed}`;
      }
      if (result.diarizationDebugPath) {
        msg += `\n話者分離デバッグ: ${result.diarizationDebugPath}`;
      }
      setStatusMessage(msg);
    },
    [project, setProject, whisperEnv, durationMin],
  );

  const handleTranscriptSeek = useCallback(
    (startMs: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = startMs / 1000;
      setCurrentTimeMs(startMs);
    },
    [setCurrentTimeMs],
  );

  const handleSpeakersComplete = useCallback(() => {
    const speakers = useProjectStore.getState().project?.meta.speakers ?? [];
    for (const speaker of speakers) {
      syncStyleSpeakerOverride(speaker, setSpeakerOverride);
    }
    setStep("done");
    const wc = useProjectStore.getState().project?.words.length ?? 0;
    setStatusMessage(
      `話者設定が完了しました（単語 ${wc} 件・話者 ${speakers.length} 人）。\n` +
        "右下の「校正へ進む」から AI 校正フェーズに移れます。",
    );
  }, [setSpeakerOverride]);

  const canRunProduction = Boolean(whisperEnv?.ready) && !isTranscribing;
  const showProgress = isTranscribing && transcriptionProgress;

  return (
    <div className="flex h-full min-h-0 flex-col text-white">
      <header className="glass-header flex shrink-0 items-center justify-between px-6 py-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-label leading-none">Phase 1 — ① 文字起こし</p>
          <h1 className="text-lg font-semibold leading-tight tracking-tight">
            動画取り込み・話者ラベル設定
          </h1>
        </div>
        {videoPath && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void handleRemoveVideo()}
              className="glass-btn-ghost px-3 py-1.5 text-sm"
            >
              動画を取り除く
            </button>
            {(isDirty || wordCount > 0) && (
              <button
                type="button"
                onClick={() => void handleSaveProject()}
                className="glass-btn-secondary hidden px-3 py-1.5 text-sm sm:inline-flex"
              >
                プロジェクトを保存
              </button>
            )}
            <button
              type="button"
              disabled={!canRunProduction || isTranscribing}
              title={
                !whisperEnv?.ready
                  ? "セットアップを完了すると有効になります"
                  : undefined
              }
              onClick={() => void runTranscription(false)}
              className="glass-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isTranscribing ? "文字起こし中…" : "文字起こしを実行"}
            </button>
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1 gap-0">
        <section className="glass-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-r border-glass-border">
          <div
            className={`shrink-0 border-b border-glass-border px-6 ${
              showProgress ? "pb-3 pt-3" : "pb-3 pt-2"
            }`}
          >
            {showProgress && (
              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between text-xs text-white/70">
                  <span>{transcriptionProgress.label}</span>
                  <span className="text-meta">
                    {Math.round(transcriptionProgress.ratio * 100)}%
                  </span>
                </div>
                <div className="glass-progress-track">
                  <div
                    className="glass-progress-fill"
                    style={{
                      width: `${Math.round(transcriptionProgress.ratio * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {videoSrc ? (
              <div className="glass-preview h-[clamp(14rem,40vh,28rem)] w-full">
                <video
                  ref={videoRef}
                  src={videoSrc}
                  className="h-full w-full object-contain"
                  controls
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={(e) =>
                    setCurrentTimeMs(
                      Math.round(e.currentTarget.currentTime * 1000),
                    )
                  }
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
              </div>
            ) : (
              <VideoImportZone
                disabled={isTranscribing}
                onPickVideo={() => void handlePickVideo()}
                onOpenProject={() => void handleOpenProject()}
                onVideoPathDropped={(path) => applyVideoPath(path)}
                onProjectPathDropped={(path) => void loadProjectFromPath(path)}
              />
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-6 py-4">
            {videoPath && step === "transcribe" && (
              <>
                <TranscriptionOptionsPanel disabled={isTranscribing} />
                <div className="mb-3">
                  <WhisperXSetupPanel
                    environment={whisperEnv}
                    error={envCheckError}
                    checking={envChecking}
                    checkingLabel={envCheckLabel}
                    durationMin={durationMin}
                    isTranscribing={isTranscribing}
                    onEnvironmentChange={(force) => void refreshEnvironment(force)}
                  />
                </div>
                <button
                  type="button"
                  disabled={isTranscribing}
                  onClick={() => void runTranscription(true)}
                  className="glass-btn-ghost mb-3 border-amber-500/30 text-amber-100 hover:bg-amber-500/10 disabled:opacity-50"
                >
                  デモサンプルのみ（UI確認用）
                </button>
              </>
            )}

            {showTranscript && project && (
              <TranscriptEditorPanel
                words={project.words}
                speakers={project.meta.speakers}
                layout="panel"
                className="mb-4 shrink-0"
                onSeek={handleTranscriptSeek}
                onWordsChange={pushWords}
                onUndo={undo}
                onRedo={redo}
                hideHeaderAiFix
                playbackSync
              />
            )}

            {statusMessage && (
              <div className="glass-panel shrink-0 px-3 py-2">
                <p className="whitespace-pre-line break-words text-sm text-white/70">
                  {statusMessage}
                </p>
              </div>
            )}
          </div>
        </section>

        <aside
          ref={speakerAsideRef}
          className="glass-sidebar flex min-h-0 w-[380px] shrink-0 flex-col overflow-hidden p-4 lg:w-[420px]"
        >
          {step === "done" && (
            <div className="glass-panel-raised mb-3 shrink-0 px-3 py-2 text-sm">
              <p className="font-medium text-white">取り込みフェーズはここまで</p>
              <p className="mt-2 text-white/60">
                文字起こしと話者ラベル設定まで完了しています。次は
                AI によるトランスクリプト校正です。
              </p>
              {onProceedToCorrection && (
                <button
                  type="button"
                  onClick={onProceedToCorrection}
                  className="glass-btn-primary mt-3 w-full"
                >
                  校正へ進む
                </button>
              )}
              <p className="mt-2 text-xs text-white/45">
                話者の表示名は下の一覧から引き続き編集できます。
              </p>
            </div>
          )}
          {showSpeakerPanel ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <SpeakerPanel
                videoRef={videoRef}
                onComplete={
                  step === "speakers" ? handleSpeakersComplete : undefined
                }
              />
            </div>
          ) : (
            <div className="flex h-full flex-col justify-center gap-3 text-sm text-white/50">
              <p>先に動画を選択し、文字起こしを実行してください。</p>
              <p className="text-xs">
                AI 校正などは API キーが必要です。左サイドバー下部の「設定」から使用する AI とキーを登録できます。
              </p>
              <p className="text-xs">
                処理はすべてこの PC 上で行われます。NeMo モデルは初回実行時に自動ダウンロードされます（HF キー不要）。
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
