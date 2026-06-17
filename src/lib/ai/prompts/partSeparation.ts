import { z } from "zod";
import { PartTypeSchema } from "@/lib/schema/transcript";
import type { Speaker, Word } from "@/lib/schema/transcript";

export const PartSeparationItemSchema = z.object({
  type: PartTypeSchema,
  start_word_id: z.string(),
  end_word_id: z.string(),
  title_draft: z.string(),
});

export const PartSeparationResponseSchema = z.object({
  parts: z.array(PartSeparationItemSchema),
});

export type PartSeparationItem = z.infer<typeof PartSeparationItemSchema>;
export type PartSeparationResponse = z.infer<typeof PartSeparationResponseSchema>;

export function buildPartSeparationPrompt(
  words: Word[],
  speakers: Speaker[],
): string {
  return `
以下のトランスクリプトを意味的なセグメント（Part）に分割してください。

## 話者情報
${JSON.stringify(speakers, null, 2)}

## セグメント種別
- main: 動画の本筋・テーマに直結する内容
- tangent: 脱線・余談・雑談
- reaction: 相槌・笑い・驚きなど短いリアクション
- transition: 話題転換の橋渡し部分

## ルール
- 各Partは連続した word_ids の範囲で定義する
- start_word_id と end_word_id で範囲を指定すること
- 最小単位は5秒（短すぎるPartは前後に統合）
- title_draft は10文字以内で端的に

## トランスクリプト
${JSON.stringify(
  words.map((w) => ({
    id: w.id,
    speaker: w.speaker,
    text: w.text,
    start_ms: w.start_ms,
  })),
  null,
  2,
)}

## 出力スキーマ
{
  "parts": [
    {
      "type": "main" | "tangent" | "reaction" | "transition",
      "start_word_id": "w0001",
      "end_word_id": "w0042",
      "title_draft": "自己紹介"
    }
  ]
}
`.trim();
}
