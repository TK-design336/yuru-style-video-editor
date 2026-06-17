import { z } from "zod";
import type { Word } from "@/lib/schema/transcript";
import { CorrectionTypeSchema } from "@/lib/schema/transcript";

export const CorrectionItemSchema = z.object({
  word_id: z.string(),
  original: z.string(),
  fixed: z.string(),
  type: CorrectionTypeSchema,
  note: z.string(),
});

export const CorrectionResponseSchema = z.object({
  corrections: z.array(CorrectionItemSchema),
});

export type CorrectionItem = z.infer<typeof CorrectionItemSchema>;
export type CorrectionResponse = z.infer<typeof CorrectionResponseSchema>;

export function buildCorrectionPrompt(words: Word[]): string {
  return `
以下のトランスクリプト（word配列）を校正してください。

対象:
1. 明らかな誤字・脱字・言い間違い（typo / mishearing）
2. 事実誤認の可能性がある箇所（fact_error）

修正不要な箇所は corrections を空配列にしてください。
確信がない場合は fact_error として note に理由を書いてください。

## トランスクリプト
${JSON.stringify(words, null, 2)}

## 出力スキーマ
{
  "corrections": [
    {
      "word_id": "w0001",
      "original": "元のテキスト",
      "fixed": "修正後テキスト",
      "type": "typo" | "mishearing" | "fact_error",
      "note": "補足"
    }
  ]
}
`.trim();
}
