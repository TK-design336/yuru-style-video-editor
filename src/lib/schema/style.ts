import { z } from "zod";

// ─── Shared primitives ───────────────────────────────────────

export const ShadowSchema = z.object({
  spread: z.number().nonnegative(),
  offset_x: z.number(),
  offset_y: z.number(),
  color: z.string(),
});

export const AppearFromSchema = z.enum([
  "speaker_side",
  "top",
  "bottom",
  "left",
  "center_left",
  "center",
  "center_right",
  "right",
]);

export const OverlapRuleSchema = z.literal("push_lower_up");

export const TextAlignSchema = z.enum([
  "left",
  "center_left",
  "center",
  "center_right",
  "right",
]);

export const VerticalAlignSchema = z.enum(["top", "middle", "bottom"]);

export const PaddingSchema = z.object({
  top: z.number().nonnegative(),
  bottom: z.number().nonnegative(),
  left: z.number().nonnegative(),
  right: z.number().nonnegative(),
});

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

// ─── Subtitle styles ─────────────────────────────────────────

export const ImportanceLevelSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

export const SubtitleStyleEntrySchema = z.object({
  font: z.string(),
  size_pt: z.number().positive(),
  color: z.string(),
  border_color: z.string(),
  border_width: z.number().nonnegative(),
  shadow: ShadowSchema,
  appear_from: AppearFromSchema,
  linger_ms: z.number().int().nonnegative(),
  overlap_rule: OverlapRuleSchema,
});

export const SubtitleStylesByImportanceSchema = z.object({
  "0": SubtitleStyleEntrySchema,
  "1": SubtitleStyleEntrySchema,
  "2": SubtitleStyleEntrySchema,
  "3": SubtitleStyleEntrySchema,
});

export const CommonTelopStyleSchema = z.object({
  base_color: z.string(),
  border_color: z.string(),
  border_width: z.number().nonnegative(),
  font: z.string(),
  size_pt: z.number().positive(),
  color: z.string(),
  max_chars: z.number().int().positive(),
  align: TextAlignSchema,
  v_align: VerticalAlignSchema,
  padding: PaddingSchema,
});

export const SpeakerSubtitleOverrideSchema = z.object({
  h_align: TextAlignSchema,
  padding_h: z.number().nonnegative(),
  appear_from: AppearFromSchema,
});

export const SubtitleStylesSchema = z.object({
  by_importance: SubtitleStylesByImportanceSchema,
  common_telop: CommonTelopStyleSchema,
  by_speaker: z.record(z.string(), SpeakerSubtitleOverrideSchema),
});

// ─── Persistent objects ────────────────────────────────────────

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const SizeSchema = z.object({
  w: z.number().positive(),
  h: z.number().positive(),
});

export const PersistentObjectSchema = z.object({
  id: z.string(),
  asset: z.string(),
  position: PositionSchema,
  size: SizeSchema,
  rotation_deg: z.number(),
  opacity: z.number().min(0).max(1),
  z_order: z.number().int(),
});

// ─── Scene transition defaults ───────────────────────────────

export const SceneTransitionDefaultsSchema = z.object({
  default_type: z.enum(["effect", "clip"]),
  default_effect: TransitionEffectNameSchema,
  duration_ms: z.number().int().positive(),
  available_effects: z.array(TransitionEffectNameSchema),
});

// ─── Root style config ─────────────────────────────────────────

export const StyleConfigSchema = z.object({
  schema_version: z.string(),
  subtitle_styles: SubtitleStylesSchema,
  persistent_objects: z.array(PersistentObjectSchema),
  scene_transition_defaults: SceneTransitionDefaultsSchema,
});

// ─── Inferred types ──────────────────────────────────────────

export type TextAlign = z.infer<typeof TextAlignSchema>;
export type AppearFrom = z.infer<typeof AppearFromSchema>;
export type Shadow = z.infer<typeof ShadowSchema>;
export type SubtitleStyleEntry = z.infer<typeof SubtitleStyleEntrySchema>;
export type CommonTelopStyle = z.infer<typeof CommonTelopStyleSchema>;
export type SpeakerSubtitleOverride = z.infer<
  typeof SpeakerSubtitleOverrideSchema
>;
export type SubtitleStyles = z.infer<typeof SubtitleStylesSchema>;
export type PersistentObject = z.infer<typeof PersistentObjectSchema>;
export type SceneTransitionDefaults = z.infer<
  typeof SceneTransitionDefaultsSchema
>;
export type StyleConfig = z.infer<typeof StyleConfigSchema>;

export function parseStyleConfig(data: unknown): StyleConfig {
  return StyleConfigSchema.parse(data);
}

export function safeParseStyleConfig(data: unknown) {
  return StyleConfigSchema.safeParse(data);
}

/** DATAMODEL.md の例に基づくデフォルトスタイル */
export function createDefaultStyleConfig(): StyleConfig {
  return {
    schema_version: "1.0.0",
    subtitle_styles: {
      by_importance: {
        "3": {
          font: "NotoSansJP-Bold",
          size_pt: 36,
          color: "#FFFFFF",
          border_color: "#000000",
          border_width: 3,
          shadow: {
            spread: 4,
            offset_x: 2,
            offset_y: 2,
            color: "#00000099",
          },
          appear_from: "speaker_side",
          linger_ms: 1500,
          overlap_rule: "push_lower_up",
        },
        "2": {
          font: "NotoSansJP-Medium",
          size_pt: 30,
          color: "#FFFFFF",
          border_color: "#000000",
          border_width: 2,
          shadow: {
            spread: 3,
            offset_x: 1,
            offset_y: 1,
            color: "#00000088",
          },
          appear_from: "speaker_side",
          linger_ms: 1200,
          overlap_rule: "push_lower_up",
        },
        "1": {
          font: "NotoSansJP-Regular",
          size_pt: 26,
          color: "#EEEEEE",
          border_color: "#000000",
          border_width: 2,
          shadow: {
            spread: 2,
            offset_x: 1,
            offset_y: 1,
            color: "#00000077",
          },
          appear_from: "bottom",
          linger_ms: 1000,
          overlap_rule: "push_lower_up",
        },
        "0": {
          font: "NotoSansJP-Regular",
          size_pt: 22,
          color: "#CCCCCC",
          border_color: "#000000",
          border_width: 1,
          shadow: {
            spread: 1,
            offset_x: 1,
            offset_y: 1,
            color: "#00000066",
          },
          appear_from: "bottom",
          linger_ms: 800,
          overlap_rule: "push_lower_up",
        },
      },
      common_telop: {
        base_color: "#1A1A2E",
        border_color: "#E94560",
        border_width: 2,
        font: "NotoSansJP-Medium",
        size_pt: 28,
        color: "#FFFFFF",
        max_chars: 20,
        align: "center",
        v_align: "top",
        padding: { top: 8, bottom: 8, left: 16, right: 16 },
      },
      by_speaker: {},
    },
    persistent_objects: [
      {
        id: "logo",
        asset: "assets/logo.png",
        position: { x: 32, y: 32 },
        size: { w: 120, h: 40 },
        rotation_deg: 0,
        opacity: 1.0,
        z_order: 10,
      },
    ],
    scene_transition_defaults: {
      default_type: "effect",
      default_effect: "blur_dissolve",
      duration_ms: 600,
      available_effects: [
        "wipe_left",
        "wipe_right",
        "zoom_out",
        "flash_white",
        "blur_dissolve",
        "cut",
        "cross_dissolve",
        "dip_to_black",
      ],
    },
  };
}
