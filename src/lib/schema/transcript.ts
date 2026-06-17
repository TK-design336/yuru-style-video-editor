import { z } from "zod";

// ─── Enums ───────────────────────────────────────────────────

export const SpeakerPositionSchema = z.enum([
  "left",
  "center_left",
  "center",
  "center_right",
  "right",
]);
export type SpeakerPosition = z.infer<typeof SpeakerPositionSchema>;

/** WhisperX 直後に保持する話者IDの上限（マージ前は多めに保持） */
export const MAX_DETECTED_SPEAKERS = 30;

/** マージ・ラベル設定完了後の本番上限 */
export const MAX_SPEAKERS = 4;

export const CorrectionTypeSchema = z.enum([
  "typo",
  "mishearing",
  "fact_error",
]);

export const PartTypeSchema = z.enum([
  "main",
  "tangent",
  "reaction",
  "transition",
]);

export const TelopPositionSchema = z.enum([
  "top_left",
  "top_center",
  "top_right",
  "bottom_left",
  "bottom_center",
  "bottom_right",
]);

export const SceneTransitionTypeSchema = z.enum(["effect", "clip"]);

export const TransitionEffectNameSchema = z.enum([
  "wipe_left",
  "wipe_right",
  "zoom_out",
  "flash_white",
  "blur_dissolve",
  "cut",
  "cross_dissolve",
  "dip_to_black",
]);

export const ClipAssetTypeSchema = z.enum(["video", "alpha_video", "gif"]);

export const ClipPlacementSchema = z.enum(["overlay", "replace"]);

export const MediaHintSuggestionTypeSchema = z.enum([
  "figure",
  "citation",
  "graph",
  "article",
]);

export const UrlRelevanceSchema = z.enum(["high", "medium", "low"]);

// ─── Meta ────────────────────────────────────────────────────

export const SpeakerSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** 会話上の役割（ホスト、ゲストなど）— AI 話者修正の参考情報 */
  role: z.string().default(""),
  /** 話し方・立ち位置などの自由記述 — AI 話者修正の参考情報 */
  attributes: z.string().default(""),
  position: SpeakerPositionSchema,
  color: z.string(),
});

export const MetaSchema = z.object({
  schema_version: z.string(),
  source_video: z.string(),
  source_video_path: z.string(),
  duration_ms: z.number().int().nonnegative(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  speakers: z
    .array(SpeakerSchema)
    .max(MAX_DETECTED_SPEAKERS, {
      message: `検出話者は最大${MAX_DETECTED_SPEAKERS}人までです`,
    }),
});

// ─── Words ───────────────────────────────────────────────────

export const CorrectionSchema = z.object({
  original: z.string(),
  fixed: z.string(),
  type: CorrectionTypeSchema,
  note: z.string(),
  approved: z.boolean(),
});

export const WordSchema = z.object({
  id: z.string(),
  speaker: z.string(),
  text: z.string(),
  start_ms: z.number().int().nonnegative(),
  end_ms: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  correction: z.union([z.null(), CorrectionSchema]),
  /** 手動分割: この単語の直後で発話ブロックを区切る（話者が同じでも別ブロック） */
  utterance_break_after: z.boolean().optional(),
});

// ─── Parts (recursive, max 2 levels in practice) ─────────────

export const TelopSchema = z.object({
  text: z.string(),
  start_ms: z.number().int().nonnegative(),
  duration_ms: z.number().int().positive(),
  position: TelopPositionSchema,
});

export const PartSceneTransitionRefSchema = z.object({
  id: z.string(),
});

export type Telop = z.infer<typeof TelopSchema>;

export interface Part {
  id: string;
  type: z.infer<typeof PartTypeSchema>;
  start_ms: number;
  end_ms: number;
  word_ids: string[];
  title_draft?: string;
  part_importance?: number;
  importance_reason?: string;
  trim: boolean;
  sub_parts: Part[];
  telop?: Telop | null;
  scene_transition?: z.infer<typeof PartSceneTransitionRefSchema> | null;
}

export const PartSchema: z.ZodType<Part> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: PartTypeSchema,
    start_ms: z.number().int().nonnegative(),
    end_ms: z.number().int().nonnegative(),
    word_ids: z.array(z.string()),
    title_draft: z.string().optional(),
    part_importance: z.number().int().min(0).max(4).optional(),
    importance_reason: z.string().optional(),
    trim: z.boolean(),
    telop: z.union([z.null(), TelopSchema]).optional(),
    scene_transition: z
      .union([z.null(), PartSceneTransitionRefSchema])
      .optional(),
    sub_parts: z.array(PartSchema),
  }),
);

// ─── Phrases ─────────────────────────────────────────────────

export const FactFlagSchema = z.object({
  note: z.string(),
  overlay_text: z.string(),
  approved: z.boolean(),
});

export const PhraseSchema = z.object({
  id: z.string(),
  word_ids: z.array(z.string()),
  text_snapshot: z.string(),
  bold: z.boolean(),
  phrase_importance: z.number().int().min(0).max(3),
  fact_flag: z.union([z.null(), FactFlagSchema]),
});

// ─── Scene Transitions ─────────────────────────────────────────

export const TransitionEffectSchema = z.object({
  name: TransitionEffectNameSchema,
  params: z.record(z.unknown()).default({}),
});

export const TransitionClipSchema = z.object({
  asset_type: ClipAssetTypeSchema,
  alpha_channel: z.boolean(),
  placement: ClipPlacementSchema,
  asset_path: z.string().nullable(),
  asset_hint: z.string(),
});

export const SceneTransitionSchema = z.object({
  id: z.string(),
  at_ms: z.number().int().nonnegative(),
  duration_ms: z.number().int().positive(),
  suggestion_reason: z.string(),
  confidence: z.number().min(0).max(1),
  type: SceneTransitionTypeSchema,
  effect: z.union([z.null(), TransitionEffectSchema]),
  clip: z.union([z.null(), TransitionClipSchema]),
});

// ─── Media Hints ─────────────────────────────────────────────

export const RelatedUrlSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  relevance: UrlRelevanceSchema,
});

export const MediaHintSchema = z.object({
  id: z.string(),
  ref_part_id: z.string(),
  ref_word_ids: z.array(z.string()),
  trigger_text_snapshot: z.string(),
  start_ms: z.number().int().nonnegative(),
  suggestion_type: MediaHintSuggestionTypeSchema,
  search_queries: z.array(z.string()),
  related_urls: z.array(RelatedUrlSchema),
  note: z.string(),
});

// ─── Project (master) ──────────────────────────────────────────

export const ProjectDataSchema = z.object({
  meta: MetaSchema,
  words: z.array(WordSchema),
  parts: z.array(PartSchema),
  phrases: z.array(PhraseSchema),
  scene_transitions: z.array(SceneTransitionSchema),
  media_hints: z.array(MediaHintSchema),
});

// ─── Inferred types ──────────────────────────────────────────

export type Speaker = z.infer<typeof SpeakerSchema>;
export type Meta = z.infer<typeof MetaSchema>;
export type Correction = z.infer<typeof CorrectionSchema>;
export type Word = z.infer<typeof WordSchema>;
export type Phrase = z.infer<typeof PhraseSchema>;
export type FactFlag = z.infer<typeof FactFlagSchema>;
export type SceneTransition = z.infer<typeof SceneTransitionSchema>;
export type MediaHint = z.infer<typeof MediaHintSchema>;
export type ProjectData = z.infer<typeof ProjectDataSchema>;

export function parseProjectData(data: unknown): ProjectData {
  return ProjectDataSchema.parse(data);
}

export function safeParseProjectData(data: unknown) {
  return ProjectDataSchema.safeParse(data);
}
