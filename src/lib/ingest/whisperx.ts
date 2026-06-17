import { z } from "zod";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ProjectData, Word } from "@/lib/schema/transcript";
import { WordSchema } from "@/lib/schema/transcript";
import {
  parseVocabularyHints,
  loadTranscriptionSettings,
} from "@/lib/ingest/transcriptionSettings";
import {
  getTranscriptionStats,
  syncSpeakersAfterTranscription,
} from "@/lib/speakers";
import { isTauri } from "@/lib/tauri/env";

const WhisperXWordSchema = WordSchema.omit({ correction: true }).extend({
  correction: z.null().optional(),
});

const WhisperXDataSchema = z.object({
  words: z.array(WhisperXWordSchema),
  duration_ms: z.number().int().nonnegative().optional(),
  diarization_engine: z.string().nullish(),
  is_demo: z.boolean().nullish(),
  note: z.string().nullish(),
  device_used: z.string().nullish(),
  compute_type: z.string().nullish(),
  diarization_debug_path: z.string().nullish(),
});

export type WhisperxProgress = {
  stage: string;
  label: string;
  ratio: number;
};

export type WhisperxProbeProgress = {
  stage: string;
  label: string;
  ratio: number;
};

const WhisperXEnvironmentSchema = z.object({
  ready: z.boolean(),
  whisperx_available: z.boolean(),
  ffmpeg_available: z.boolean(),
  hf_token_set: z.boolean(),
  hf_gated_ready: z.boolean().optional(),
  hf_missing_gated: z.array(z.string()).optional(),
  cuda_available: z.boolean(),
  cuda_works: z.boolean().optional(),
  cuda_device_name: z.string().nullable().optional(),
  torch_version: z.string().nullable().optional(),
  pytorch_is_cpu_build: z.boolean().optional(),
  cuda_error: z.string().nullable().optional(),
  python_version: z.string().optional(),
  python_supported: z.boolean().optional(),
  python_executable: z.string().optional(),
  messages: z.array(z.string()),
});

export type WhisperXEnvironment = z.infer<typeof WhisperXEnvironmentSchema>;

export type WhisperXTranscribeResult =
  | {
      success: true;
      project: ProjectData;
      wordCount: number;
      speakerIds: string[];
      exceedsDetectedLimit: boolean;
      engine: string;
      isDemo: boolean;
      note?: string;
      qualityWarning?: string;
      deviceUsed?: string;
      diarizationDebugPath?: string;
    }
  | { success: false; error: string; environment?: WhisperXEnvironment };

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.9;
  return Math.min(1, Math.max(0, value));
}

/** WhisperX 出力をプロジェクト保存用に正規化（Zod 失敗で画面が進まないのを防ぐ） */
function wordsFromWhisperX(
  raw: z.infer<typeof WhisperXWordSchema>[],
): Word[] {
  const words: Word[] = [];
  for (const w of raw) {
    const start_ms = Math.max(0, Math.round(w.start_ms));
    let end_ms = Math.max(0, Math.round(w.end_ms));
    if (end_ms < start_ms) {
      end_ms = start_ms + 1;
    }
    const parsed = WhisperXWordSchema.safeParse({
      ...w,
      start_ms,
      end_ms,
      confidence: clampConfidence(w.confidence),
    });
    if (!parsed.success) {
      continue;
    }
    words.push({ ...parsed.data, correction: null });
  }
  return words;
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

async function invokeSidecar(payload: Record<string, unknown>): Promise<{
  ok: boolean;
  data?: unknown;
  error?: string;
}> {
  return invoke("run_python_sidecar", {
    request: {
      script_name: "whisper_diarization_runner",
      payload,
    },
  });
}

/** WhisperX 本番実行に必要な環境（Python / ffmpeg / HF トークン） */
export async function probeWhisperXEnvironment(
  options: {
    force?: boolean;
    onProgress?: (progress: WhisperxProbeProgress) => void;
  } = {},
): Promise<
  | { success: true; environment: WhisperXEnvironment }
  | { success: false; error: string }
> {
  if (!isTauri()) {
    return {
      success: false,
      error: "環境チェックは Tauri デスクトップ版でのみ利用できます",
    };
  }

  const unlisten = options.onProgress
    ? await listen<WhisperxProbeProgress>("whisperx-probe-progress", (event) => {
        options.onProgress?.(event.payload);
      })
    : null;

  try {
    const response = await invoke<{
      ok: boolean;
      data?: unknown;
      error?: string;
    }>("probe_whisperx_environment", {
      force: options.force ?? false,
    });

    if (!response.ok || !response.data) {
      return {
        success: false,
        error: response.error ?? "環境チェックに失敗しました",
      };
    }

    const parsed = WhisperXEnvironmentSchema.safeParse(response.data);
    if (!parsed.success) {
      return {
        success: false,
        error: `環境チェック結果の形式が不正です: ${parsed.error.message}`,
      };
    }

    return { success: true, environment: parsed.data };
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error
          ? `環境チェックの呼び出しに失敗: ${e.message}`
          : `環境チェックの呼び出しに失敗: ${String(e)}`,
    };
  } finally {
    if (unlisten) {
      await unlisten();
    }
  }
}

function transcriptionQualityWarning(
  durationMs: number,
  wordCount: number,
  isDemo: boolean,
): string | undefined {
  if (isDemo) {
    return (
      "デモ用の固定サンプルです。2時間の動画でも数語しか出ません。" +
      "実際の内容を文字起こしするには WhisperX 環境を整えてから本番ボタンを使ってください。"
    );
  }
  if (durationMs >= 5 * 60 * 1000 && wordCount < 80) {
    return (
      `動画は約 ${Math.round(durationMs / 60000)} 分ですが、単語は ${wordCount} 件だけです。` +
      "処理が途中で止まったか、音声トラックが空の可能性があります。"
    );
  }
  return undefined;
}

/**
 * ① WhisperX: 全単語 + 話者ID をそのまま保存（書き換え・マージなし）
 * ② 話者スタブ一覧のみ生成（ラベル・位置は次ステップ）
 */
async function getComputePayload(): Promise<{
  device: string;
  compute_type?: string;
}> {
  try {
    const config = await invoke<{
      device: string;
      compute_type: string | null;
    }>("get_whisperx_config");
    return {
      device: config.device || "auto",
      compute_type: config.compute_type ?? undefined,
    };
  } catch {
    return { device: "auto" };
  }
}

export async function runWhisperXTranscription(
  baseProject: ProjectData,
  options: {
    forceDemo?: boolean;
    onProgress?: (progress: WhisperxProgress) => void;
  } = {},
): Promise<WhisperXTranscribeResult> {
  if (!isTauri()) {
    return {
      success: false,
      error: "WhisperX 連携は Tauri デスクトップ版でのみ利用できます",
    };
  }

  const forceDemo = options.forceDemo ?? false;

  if (!forceDemo) {
    const probe = await probeWhisperXEnvironment();
    if (!probe.success) {
      return { success: false, error: probe.error };
    }
    if (!probe.environment.ready) {
      return {
        success: false,
        error: probe.environment.messages.join("\n"),
        environment: probe.environment,
      };
    }
  }

  const compute = await getComputePayload();
  const txSettings = loadTranscriptionSettings();
  const vocabulary_hints = parseVocabularyHints(txSettings.vocabularyHints);

  const diarize: Record<string, number> = {};
  if (txSettings.expectedSpeakers === "auto") {
    diarize.min_speakers = 2;
    diarize.max_speakers = 10;
  } else {
    diarize.num_speakers = txSettings.expectedSpeakers;
  }

  const payload = {
    source_video_path: baseProject.meta.source_video_path,
    language: "ja",
    duration_ms: baseProject.meta.duration_ms,
    force_demo: forceDemo,
    ...diarize,
    device: compute.device,
    compute_type: compute.compute_type,
    model: txSettings.whisperModel,
    vocabulary_hints,
    stemming: txSettings.stemming,
    diarizer: txSettings.diarizer,
    realign_speakers_at_sentence_end: txSettings.realignSpeakersAtSentenceEnd,
    vad_preset: txSettings.vadPreset,
    msdd_sigmoid_threshold: txSettings.msddSigmoidThreshold,
    msdd_diar_window_length: txSettings.msddDiarWindowLength,
    diarization_debug_dump: txSettings.diarizationDebugDump,
  };

  const unlisten = options.onProgress
    ? await listen<WhisperxProgress>("whisperx-progress", (event) => {
        options.onProgress?.(event.payload);
      })
    : null;

  let response: { ok: boolean; data?: unknown; error?: string };
  try {
    if (forceDemo) {
      response = await invokeSidecar(payload);
    } else {
      response = await invoke<{ ok: boolean; data?: unknown; error?: string }>(
        "run_whisperx_transcription",
        { payload },
      );
    }
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error
          ? `WhisperX の呼び出しに失敗: ${e.message}`
          : `WhisperX の呼び出しに失敗: ${String(e)}`,
    };
  } finally {
    if (unlisten) {
      await unlisten();
    }
  }

  if (!response.ok || !response.data) {
    const envParsed = response.data
      ? WhisperXEnvironmentSchema.safeParse(response.data)
      : null;
    return {
      success: false,
      error: response.error ?? "WhisperX の実行に失敗しました",
      environment: envParsed?.success ? envParsed.data : undefined,
    };
  }

  const parsed = WhisperXDataSchema.safeParse(response.data);
  if (!parsed.success) {
    return {
      success: false,
      error: `WhisperX 出力の形式が不正です:\n${formatZodIssues(parsed.error)}`,
    };
  }

  const words = wordsFromWhisperX(parsed.data.words);
  if (words.length === 0) {
    return {
      success: false,
      error:
        "WhisperX は終了しましたが、保存できる単語が0件でした。音声トラックや処理ログを確認してください。",
    };
  }

  const isDemo =
    parsed.data.is_demo === true || parsed.data.diarization_engine === "demo";

  if (!forceDemo && isDemo) {
    return {
      success: false,
      error:
        "本番処理なのにデモ出力が返されました。Python 環境を確認してください。",
    };
  }

  const duration_ms =
    parsed.data.duration_ms && parsed.data.duration_ms > 0
      ? parsed.data.duration_ms
      : baseProject.meta.duration_ms;

  const transcribed: ProjectData = {
    ...baseProject,
    meta: {
      ...baseProject.meta,
      duration_ms,
      speakers: [],
    },
    words,
    parts: [],
    phrases: [],
    scene_transitions: [],
    media_hints: [],
  };

  const project = syncSpeakersAfterTranscription(transcribed);
  const stats = getTranscriptionStats(project);
  const qualityWarning = transcriptionQualityWarning(
    duration_ms,
    stats.wordCount,
    isDemo,
  );

  return {
    success: true,
    project,
    wordCount: stats.wordCount,
    speakerIds: stats.speakerIds,
    exceedsDetectedLimit: stats.exceedsDetectedLimit,
    engine: parsed.data.diarization_engine ?? "unknown",
    isDemo,
    note: parsed.data.note ?? undefined,
    qualityWarning,
    deviceUsed: parsed.data.device_used ?? undefined,
    diarizationDebugPath: parsed.data.diarization_debug_path ?? undefined,
  };
}
