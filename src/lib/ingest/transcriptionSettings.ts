const STORAGE_KEY = "yuru-transcription-settings";

export type ExpectedSpeakers = "auto" | 2 | 3 | 4;

/** NeMo 話者分離バックエンド（MahmoudAshraf97/whisper-diarization） */
export type DiarizerBackend = "msdd" | "sortformer";

/** MSDD VAD: relaxed=現行（厳しめ）, sensitive=YAML既定（短発話向け） */
export type VadPreset = "relaxed" | "sensitive";

export interface TranscriptionSettings {
  expectedSpeakers: ExpectedSpeakers;
  /** カンマ・改行区切り（例: みずほ銀行, 番組名） */
  vocabularyHints: string;
  whisperModel: "large-v3" | "large-v2";
  diarizer: DiarizerBackend;
  /** Demucs でボーカル分離（BGM 多めの動画向け。トーク系は OFF 推奨） */
  stemming: boolean;
  /** 文末まで話者切替を遅延する NeMo 後処理 */
  realignSpeakersAtSentenceEnd: boolean;
  /** MSDD 内蔵 VAD の感度 */
  vadPreset: VadPreset;
  /** MSDD overlap 検出しきい値（低いほど感度↑） */
  msddSigmoidThreshold: 0.7 | 0.5;
  /** MSDD 推論ウィンドウ長（秒）。短いほど局所変化に追従 */
  msddDiarWindowLength: 50 | 30;
  /** NeMo RTTM と単語ラベルの比較 JSON を動画横に出力 */
  diarizationDebugDump: boolean;
}

const DEFAULTS: TranscriptionSettings = {
  expectedSpeakers: "auto",
  vocabularyHints: "",
  whisperModel: "large-v3",
  diarizer: "msdd",
  stemming: false,
  realignSpeakersAtSentenceEnd: true,
  vadPreset: "relaxed",
  msddSigmoidThreshold: 0.7,
  msddDiarWindowLength: 50,
  diarizationDebugDump: false,
};

export function loadTranscriptionSettings(): TranscriptionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<TranscriptionSettings>;
    return {
      expectedSpeakers:
        parsed.expectedSpeakers === 2 ||
        parsed.expectedSpeakers === 3 ||
        parsed.expectedSpeakers === 4
          ? parsed.expectedSpeakers
          : "auto",
      vocabularyHints:
        typeof parsed.vocabularyHints === "string"
          ? parsed.vocabularyHints
          : DEFAULTS.vocabularyHints,
      whisperModel:
        parsed.whisperModel === "large-v2" ? "large-v2" : "large-v3",
      diarizer:
        parsed.diarizer === "sortformer" ? "sortformer" : DEFAULTS.diarizer,
      stemming:
        typeof parsed.stemming === "boolean"
          ? parsed.stemming
          : DEFAULTS.stemming,
      realignSpeakersAtSentenceEnd:
        typeof parsed.realignSpeakersAtSentenceEnd === "boolean"
          ? parsed.realignSpeakersAtSentenceEnd
          : DEFAULTS.realignSpeakersAtSentenceEnd,
      vadPreset:
        parsed.vadPreset === "sensitive" ? "sensitive" : DEFAULTS.vadPreset,
      msddSigmoidThreshold:
        parsed.msddSigmoidThreshold === 0.5 ? 0.5 : DEFAULTS.msddSigmoidThreshold,
      msddDiarWindowLength:
        parsed.msddDiarWindowLength === 30 ? 30 : DEFAULTS.msddDiarWindowLength,
      diarizationDebugDump:
        typeof parsed.diarizationDebugDump === "boolean"
          ? parsed.diarizationDebugDump
          : DEFAULTS.diarizationDebugDump,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveTranscriptionSettings(settings: TranscriptionSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function parseVocabularyHints(text: string): string[] {
  return text
    .split(/[\n,、，]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
