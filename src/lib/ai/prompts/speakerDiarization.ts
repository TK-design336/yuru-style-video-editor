import { z } from "zod";
import type { Speaker } from "@/lib/schema/transcript";
import type { Utterance } from "@/lib/transcript/utterances";

export const SpeakerDiarizationUtteranceSchema = z.object({
  speaker: z.string(),
  text: z.string(),
});

export const SpeakerDiarizationResponseSchema = z.object({
  utterances: z.array(SpeakerDiarizationUtteranceSchema),
});

export type SpeakerDiarizationUtterance = z.infer<
  typeof SpeakerDiarizationUtteranceSchema
>;
export type SpeakerDiarizationResponse = z.infer<
  typeof SpeakerDiarizationResponseSchema
>;

export function utterancesToSpeakerLines(utterances: Utterance[]): string {
  return utterances
    .map((u) => `${u.speaker}: ${u.text}`)
    .join("\n");
}

/** AI 話者修正用に SPK ごとのプロフィールを整形する */
export function formatSpeakerProfilesForAi(speakers: Speaker[]): string {
  return speakers
    .map((s) => {
      const lines = [`### ${s.id}`];
      if (s.label.trim()) lines.push(`- 表示名: ${s.label.trim()}`);
      if (s.role.trim()) lines.push(`- 役割: ${s.role.trim()}`);
      if (s.attributes.trim()) lines.push(`- 属性・特徴: ${s.attributes.trim()}`);
      if (!s.label.trim() && !s.role.trim() && !s.attributes.trim()) {
        lines.push(
          "- （プロフィール未設定 — トランスクリプトから推定してください）",
        );
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

export function buildSpeakerDiarizationPrompt(
  utterances: Utterance[],
  speakers: Speaker[],
): string {
  const speakerProfiles = formatSpeakerProfilesForAi(speakers);
  const lines = utterancesToSpeakerLines(utterances);

  return `
以下は動画の文字起こし結果です。各行は「話者ID: セリフ」の形式です。
話者分離の見直しと、テキストの軽微な校正を行い、修正後のトランスクリプトを出力してください。

## 作業手順（この順序で内部的に検討してから出力すること）

### 1. 話者の属性を把握する
まず「話者プロフィール」と入力トランスクリプトを読み、各話者の属性を把握してください。
- **ユーザーが入力したプロフィール（役割・属性）を最優先で参照**すること
- プロフィールにない情報は、発話内容・話し方・会話の立ち位置から補完してよい
- どの話者ID（SPK_N）がどの人物・役割に対応するかを明確にすること

### 2. 現在の話者分離が適切か評価する
把握した話者属性を踏まえ、現状の割り振りが会話の流れとして自然かを判断してください。
- 別の話者のセリフが混ざっていないか
- 同一話者の連続発話が不必要に分割されていないか
- 話者の入れ替わりタイミングが会話の文脈と矛盾していないか
- 質問と回答、相槌、ツッコミなどの役割が話者と一致しているか

### 3. 必要なら構造を修正する
評価の結果、不自然な箇所があれば以下を行ってください。
- **分割**: 1 ブロック内に複数話者のセリフが混在している場合
- **マージ**: 同一話者の連続セリフが不必要に分かれている場合
- **話者の再割り振り**: 話者IDの付け間違いを修正する場合
時系列順序は必ず保ち、発話の意味内容が欠落しないようにしてください。

### 4. 出力時にテキストを校正する
最終的な各セリフの text には、以下の校正も反映してください。
- **不自然なスペースの除去**: 単語の途中に入った余分な空白、連続スペース、分割ミスによる不自然な区切り
- **語句の間違い**: 明らかな誤字・脱字・聞き間違い（音声認識由来の誤変換）
- ただし話者の口調や意図的な言い回しは変えないこと
- 内容の意味を変える大幅な書き換えや、推測による事実の追加は行わないこと

## 制約
- 使用できる話者IDは以下のみ: ${speakers.map((s) => s.id).join(", ")}
- 出力の発話順序は時系列を保つこと
- 入力の発話内容が欠落・重複しないこと（校正による語句修正は可）
- 説明文・分析メモは出力に含めず、JSON のみ返すこと

## 話者プロフィール（SPK ごとの参考情報）
${speakerProfiles}

## 入力トランスクリプト
${lines}

## 出力スキーマ（JSON のみ）
{
  "utterances": [
    { "speaker": "SPK_0", "text": "校正済みのセリフ本文" },
    { "speaker": "SPK_1", "text": "校正済みのセリフ本文" }
  ]
}
`.trim();
}
