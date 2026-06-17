# AI プロンプト設計仕様

全フェーズ共通: Claude API（`claude-sonnet-4-20250514`）を使用。
レスポンスは必ず JSON のみを返すよう system prompt で指示し、Zod でバリデーションする。

---

## フェーズ一覧

| # | プロンプト | ファイル |
|---|---|---|
| ② | 校正 | `correction.ts` |
| ③ | カット編集（分割・Importance・カット・トランジション） | `cutEditing.ts` |
| ④ | 字幕（フレーズ強調） | `phraseHighlight.ts` |
| ⑤ | テロップ | `telopSuggestion.ts` |
| ⑥ | 図解・説明欄テキスト | `mediaHint.ts` |

---

## 共通ルール

```typescript
// src/lib/ai/client.ts
const BASE_SYSTEM = `
あなたは動画編集アシスタントです。
指示されたタスクを実行し、結果を JSON のみで返してください。
前置き・説明・コードブロック記号（\`\`\`）は一切含めないこと。
`.trim()
```

---

## ② 校正

### 入力

```typescript
// src/lib/ai/prompts/correction.ts

export function buildCorrectionPrompt(words: Word[]): string {
  return `
以下のトランスクリプト（word配列）を校正してください。

対象:
1. 明らかな誤字・脱字・言い間違い（typo / mishearing）
2. 事実誤認の可能性がある箇所（fact_error）
3. 話者判定の誤り（speaker_mismatch）
4. 発話・文の区切りの誤り（boundary_error）

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
      "type": "typo" | "mishearing" | "fact_error" | "speaker_mismatch" | "boundary_error",
      "note": "補足"
    }
  ]
}
`
}
```

---

## ③ カット編集

③ は Part 分割・Importance 判定・カット提案・トランジション挿入を **1 プロンプトまたは連鎖プロンプト** で実行する。
実装では分割 → Importance → カット → トランジションの順に段階実行してもよい。

### ③-1 Part 分割

```typescript
// src/lib/ai/prompts/cutEditing.ts

export function buildPartSeparationPrompt(words: Word[], speakers: Speaker[]): string {
  return `
以下のトランスクリプトを意味的なセグメント（Part）に分割してください。

## 話者情報
${JSON.stringify(speakers)}

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
- 本筋1 → 脱線1 → 本筋2 → … のような交互配置を意識する

## トランスクリプト
${JSON.stringify(words.map(w => ({ id: w.id, speaker: w.speaker, text: w.text, start_ms: w.start_ms })), null, 2)}

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
`
}
```

### ③-2 Importance 判定 + カット提案

```typescript
export function buildCutEditingPrompt(parts: Part[], words: Word[]): string {
  return `
各Partに part_importance（0〜4、5段階）を付与し、除去候補（trim）を提案してください。

## 判定基準
- main:
  - 4: 動画の核心。絶対に残すべき
  - 3: 重要。残すべき
- tangent / reaction:
  - 2: 面白い・関連性が高い（残す価値あり）
  - 1: どちらでもよい
  - 0: 本筋への貢献がない（除去候補）
- transition: 原則 1

importance_reason は1〜2文で根拠を書くこと。
part_importance が 0 の Part は trim: true を推奨。

## Parts
${JSON.stringify(parts.map(p => ({
  id: p.id,
  type: p.type,
  title_draft: p.title_draft,
  text_preview: words
    .filter(w => p.word_ids.includes(w.id))
    .map(w => w.text)
    .join("")
    .slice(0, 200)
})), null, 2)}

## 出力スキーマ
{
  "results": [
    {
      "part_id": "part_001",
      "part_importance": 4,
      "importance_reason": "動画の本題に直結する核心部分",
      "trim": false
    }
  ]
}
`
}
```

### ③-3 トランジション挿入提案

```typescript
export function buildTransitionPrompt(parts: Part[]): string {
  const activeParts = parts.filter(p => !p.trim)

  return `
隣接するPartの境界を分析し、Scene Transitionが必要な箇所を提案してください。

## 挿入基準
- 話題転換が激しい（別テーマへのジャンプ）
- 仕切り直し感がある（「では次に」「話は変わりますが」など）
- 時間的な飛びを演出したい

## Transition種別
- effect: ソフトウェアエフェクト（wipe_left / blur_dissolve / dip_to_black 等）
- clip: 動画素材を使うトランジション（asset_hint で素材のイメージを提示）

## 境界リスト
${JSON.stringify(activeParts.map((p, i) => ({
  boundary_index: i,
  from_part: { id: p.id, title: p.title_draft, type: p.type },
  to_part: activeParts[i + 1]
    ? { id: activeParts[i + 1].id, title: activeParts[i + 1].title_draft, type: activeParts[i + 1].type }
    : null,
  at_ms: p.end_ms
})).filter(b => b.to_part !== null), null, 2)}

## 出力スキーマ
{
  "transitions": [
    {
      "at_ms": 45200,
      "duration_ms": 800,
      "suggestion_reason": "本題への大きな話題転換",
      "confidence": 0.87,
      "type": "effect" | "clip",
      "effect": { "name": "blur_dissolve", "params": {} } | null,
      "clip": {
        "asset_type": "alpha_video" | "video" | "gif",
        "alpha_channel": true | false,
        "placement": "overlay" | "replace",
        "asset_hint": "白フラッシュ系ワイプ素材"
      } | null
    }
  ]
}
`
}
```

> **③ 完了後**: アプリ側で `edited_timeline` と各 word の `edited_start_ms` / `edited_end_ms` を再計算する（プロンプトの出力ではない）。

---

## ④ 字幕（Phrase Highlight）

```typescript
// src/lib/ai/prompts/phraseHighlight.ts

export function buildPhraseHighlightPrompt(words: Word[]): string {
  const activeWords = words.filter(w => w.edited_start_ms != null)

  return `
以下のトランスクリプト（カット編集後）から、字幕強調すべきフレーズを抽出してください。

## 強調対象
- 解説において核心となるキーワード・概念
- 視聴者が聞き逃してはいけない重要セリフ
- 大きなリアクション（笑い・驚き・感嘆）

## phrase_importance 基準（3段階: 0〜2）
- 2: 重要フレーズ・聞き逃せないセリフ
- 1: やや強調したいフレーズ
- 0: 大きめの返事・リアクション、通常表示

## トランスクリプト（word単位）
${JSON.stringify(activeWords.map(w => ({ id: w.id, text: w.text, start_ms: w.edited_start_ms })), null, 2)}

## 出力スキーマ
{
  "phrases": [
    {
      "word_ids": ["w0042", "w0043"],
      "text_snapshot": "量子コンピューター",
      "bold": true,
      "phrase_importance": 2
    }
  ]
}
`
}
```

---

## ⑤ テロップ

トランスクリプトを Part より細かい区間に細分化し、各区間にテロップ文案を提案する。

```typescript
// src/lib/ai/prompts/telopSuggestion.ts

export function buildTelopPrompt(parts: Part[], words: Word[]): string {
  return `
トランスクリプトを細かな区間に細分化し、各区間にテロップテキストを提案してください。

## ルール
- max_chars: 20文字以内
- 視聴者が一目で「何の話か」わかる端的な表現
- trim: true の Part 内の word はスキップ
- Part 内をさらに2〜5区間程度に細分化してよい

## Parts（残存分のみ）
${JSON.stringify(parts.filter(p => !p.trim).map(p => ({
  id: p.id,
  title_draft: p.title_draft,
  words: words
    .filter(w => p.word_ids.includes(w.id) && w.edited_start_ms != null)
    .map(w => ({ id: w.id, text: w.text, start_ms: w.edited_start_ms }))
})), null, 2)}

## 出力スキーマ
{
  "telop_segments": [
    {
      "ref_part_id": "part_001",
      "start_word_id": "w0010",
      "end_word_id": "w0025",
      "text": "【自己紹介】",
      "position": "top_left",
      "duration_ms": 5000
    }
  ]
}
`
}
```

---

## ⑥ 図解・説明欄テキスト

```typescript
// src/lib/ai/prompts/mediaHint.ts

export function buildMediaHintPrompt(parts: Part[], words: Word[]): string {
  return `
トランスクリプトを分析し、図解・注釈・引用・訂正があると理解が深まる箇所を提案してください。
また、動画の説明欄（YouTube等）用テキストも生成してください。

## 提案形式
- search_queries: 図解・記事を検索するクエリ（日本語・英語各1〜2件）
- related_urls: 関連する公的機関・Wikipedia・著名記事のURL（架空URLは不可）
- suggestion_type: figure | citation | graph | article | correction_note
- mermaid: 概念図を Mermaid 記法で出力できる場合は記載（任意）

## ルール
- 1動画あたり最大10件
- 明らかに説明図があった方がいい箇所のみ
- trim: true の Part内はスキップ
- 実際の動画への反映は外部NLEで行う。メモ・素材として出力する

## トランスクリプト
${JSON.stringify(parts.filter(p => !p.trim).map(p => ({
  part_id: p.id,
  text: words.filter(w => p.word_ids.includes(w.id)).map(w => ({
    id: w.id, text: w.text, start_ms: w.edited_start_ms
  }))
})), null, 2)}

## 出力スキーマ
{
  "media_hints": [
    {
      "ref_part_id": "part_003",
      "ref_word_ids": ["w0210", "w0211"],
      "trigger_text_snapshot": "量子もつれの仕組みって",
      "start_ms": 18400,
      "suggestion_type": "figure",
      "search_queries": ["量子もつれ 仕組み 図解"],
      "related_urls": [{ "url": "https://...", "title": "...", "relevance": "high" }],
      "mermaid": "graph LR\n  A --> B",
      "note": "量子もつれの概念図があると理解が上がる"
    }
  ],
  "description_text": "本動画では..."
}
`
}
```

---

## プロンプト実行タイミング

| フェーズ | 実行タイミング | 並列可否 |
|---|---|---|
| ② 校正 | ユーザーが「AI校正」ボタン押下時 | — |
| ③ カット編集 | ユーザーが「AIカット編集」ボタン押下時（分割→Importance→トランジション） | 段階実行 |
| ④ 字幕 | ③ 完了後、ユーザー操作時 | — |
| ⑤ テロップ | ④ 完了後、ユーザー操作時 | — |
| ⑥ 図解 | ⑤ 完了後、ユーザー操作時 | — |

④⑤⑥ は互いに依存するため順次実行。⑥ 内の media_hints と description_text は同一プロンプトで生成する。
