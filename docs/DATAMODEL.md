# データモデル仕様

プロジェクトのマスターデータは `project_data.json` として管理する。
全 AI フェーズはこのファイルを読み込み、対応フィールドを追記・更新して書き戻す。

---

## フェーズとデータの対応

| フェーズ | 主な読み書きフィールド |
|---|---|
| ⓪ マルチトラック同期（予定） | `meta.audio_sources`（オフセット・confidence） |
| ① 文字起こし | `meta`, `words[]` |
| ② 校正 | `words[].correction` |
| ③ カット編集 | `parts[]`, `scene_transitions[]`, `edited_timeline` |
| ④ 字幕 | `phrases[]`, `style_config.json` |
| ⑤ テロップ | `telop_segments[]` |
| ⑥ 図解 | `media_hints[]`, `description_text` |
| ⑦ 書き出し | 上記すべてを読み取り `output/` を生成 |

---

## project_data.json 完全スキーマ

```jsonc
{
  // ─── メタ情報 ───────────────────────────────────────────
  "meta": {
    "schema_version": "1.1.0",
    "source_video": "interview_20260517.mp4",
    "source_video_path": "/absolute/path/to/interview_20260517.mp4",
    "duration_ms": 3720000,
    "created_at": "2026-05-17T10:00:00Z",
    "updated_at": "2026-05-17T12:34:56Z",

    // 音声ソース（⓪ 同期・① 文字起こしの入力定義）
    // 混合音声モード: 動画内トラックのみ → ⓪ をスキップ
    // 話者別トラックモード: 動画 + ピンマイク等 N 本 → ⓪ で同期後 ① へ
    "audio_sources": {
      "mode": "per_speaker",           // "mixed" | "per_speaker"
      "mixed_path": null,              // mode=mixed 時: 混合音声ファイル（省略時は動画内音声）
      "tracks": [                        // mode=per_speaker 時
        {
          "speaker_id": "SPK_0",
          "path": "/absolute/path/to/host_mic.wav",
          "offset_ms": 120,              // ⓪ 同期で算出（動画タイムライン基準）
          "sync_confidence": 0.92        // ⓪ 同期の信頼度 0〜1
        },
        {
          "speaker_id": "SPK_1",
          "path": "/absolute/path/to/guest_mic.wav",
          "offset_ms": -45,
          "sync_confidence": 0.41
        }
      ],
      "sync_completed_at": "2026-06-18T12:00:00Z"
    },

    "speakers": [
      {
        "id": "SPK_0",
        "label": "田中（ホスト）",
        "position": "left",
        "color": "#4FC3F7"
      },
      {
        "id": "SPK_1",
        "label": "佐藤（ゲスト）",
        "position": "right",
        "color": "#F48FB1"
      }
    ]
  },

  // ─── 単語列（① 文字起こし出力） ────────────────────────
  "words": [
    {
      "id": "w0001",
      "speaker": "SPK_0",
      "text": "そうですね",
      "start_ms": 1200,              // 元動画上のタイムスタンプ
      "end_ms": 1800,
      "confidence": 0.97,

      // ③ カット編集後に追記（カット・トランジション反映後）
      "edited_start_ms": 1200,
      "edited_end_ms": 1800,

      // ② 校正で追記
      "correction": null
      // or:
      // "correction": {
      //   "original": "そうですね",
      //   "fixed": "そういうことですね",
      //   "type": "typo",           // typo | mishearing | fact_error
      //   "note": "聞き間違い",
      //   "approved": true
      // }
    }
  ],

  // ─── 編集後タイムライン（③ カット編集で生成） ─────────
  "edited_timeline": {
    "duration_ms": 2850000,          // カット・トランジション反映後の総尺
    "segments": [
      {
        "id": "seg_001",
        "source_start_ms": 0,
        "source_end_ms": 45000,
        "edited_start_ms": 0,
        "edited_end_ms": 45000,
        "type": "clip"               // clip | transition
      }
      // transition セグメントは edited 上で尺を消費する
    ]
  },

  // ─── Parts（③ カット編集で生成） ───────────────────────
  "parts": [
    {
      "id": "part_001",
      "type": "main",                  // main | tangent | reaction | transition
      "start_ms": 0,                   // 元動画上の範囲
      "end_ms": 45000,
      "edited_start_ms": 0,            // 編集後タイムライン上の範囲
      "edited_end_ms": 45000,
      "word_ids": ["w0001", "w0002"],

      "title_draft": "自己紹介",

      "part_importance": 4,            // 0〜4（5段階）
      "importance_reason": "本編の導入。視聴者定着に必要",

      "trim": false,                   // true = 除去対象

      "sub_parts": [],

      // Part 境界のトランジション参照（③ で設定）
      "scene_transition": null
      // or: { "id": "st_001" }
    }
  ],

  // ─── Scene Transitions（③ カット編集で生成） ───────────
  "scene_transitions": [
    {
      "id": "st_001",
      "at_ms": 45200,                   // 編集後タイムライン上の位置
      "source_at_ms": 45200,            // 元動画上の参照位置
      "duration_ms": 800,
      "suggestion_reason": "話題が自己紹介から本題へ切り替わる",
      "confidence": 0.87,
      "type": "clip",                   // effect | clip

      "effect": null,
      "clip": {
        "asset_type": "alpha_video",
        "alpha_channel": true,
        "placement": "overlay",
        "asset_path": null,
        "asset_hint": "白フラッシュ系ワイプ素材"
      }
    }
  ],

  // ─── フレーズ強調（④ 字幕） ─────────────────────────────
  "phrases": [
    {
      "id": "ph_001",
      "word_ids": ["w0042", "w0043", "w0044"],
      "text_snapshot": "量子コンピューター",
      "bold": true,
      "phrase_importance": 2,          // 0〜2（3段階）
      "start_ms": 18400,               // 編集後タイムライン基準
      "end_ms": 19200,

      "fact_flag": null
    }
  ],

  // ─── テロップ（⑤ 細分化区間） ─────────────────────────
  "telop_segments": [
    {
      "id": "tel_001",
      "ref_part_id": "part_003",
      "word_ids": ["w0100", "w0101"],
      "start_ms": 120500,              // 編集後タイムライン基準
      "end_ms": 135000,
      "text": "【量子コンピュータの基礎】",
      "position": "top_left",
      "duration_ms": 5000
    }
  ],

  // ─── 図解・引用メモ（⑥ 図解） ─────────────────────────
  "media_hints": [
    {
      "id": "mh_001",
      "ref_part_id": "part_003",
      "ref_word_ids": ["w0210", "w0211"],
      "trigger_text_snapshot": "量子もつれの仕組みって",
      "start_ms": 18400,               // 編集後タイムライン基準

      "suggestion_type": "figure",       // figure | citation | graph | article | correction_note

      "search_queries": [
        "量子もつれ 仕組み 図解",
        "quantum entanglement diagram simple"
      ],

      "related_urls": [
        {
          "url": "https://example.com/quantum-entanglement",
          "title": "量子もつれとは — 理化学研究所",
          "relevance": "high"
        }
      ],

      // Mermaid や画像生成の出力（任意）
      "mermaid": null,
      "generated_image_path": null,

      "note": "量子もつれの概念図があると理解が上がる"
    }
  ],

  // ─── 説明欄テキスト（⑥ 図解で生成） ───────────────────
  "description_text": "本動画では量子コンピュータの基礎について..."
}
```

---

## タイムスタンプの扱い

| フィールド | 基準 |
|---|---|
| `words[].start_ms` / `end_ms` | 元動画の絶対位置（不変） |
| `words[].edited_start_ms` / `edited_end_ms` | ③ カット編集後の編集タイムライン上の位置 |
| `parts[].start_ms` / `end_ms` | 元動画上の範囲 |
| `parts[].edited_start_ms` / `edited_end_ms` | 編集後タイムライン上の範囲 |
| `phrases[]`, `telop_segments[]`, `media_hints[]` の `start_ms` | **編集後タイムライン基準**（④ 以降） |

③ 完了時に `edited_timeline` を再計算する。カット（trim）でセグメントを除去し、トランジション挿入で編集後タイムライン上の尺を加算する。

---

## `meta.audio_sources`（⓪ マルチトラック同期 — 予定）

ピンマイク等・複数マイク撮影時の音声入力形態を表す。① 文字起こしの前段ステップ（⓪ 同期）と連携する。詳細は [SYNC.md](./SYNC.md) を参照。

| `mode` | 意味 | ⓪ 同期 |
|---|---|---|
| `mixed` | 単一の混合音声（動画内トラックまたは別ファイル 1 本） | スキップ |
| `per_speaker` | 話者別トラック配列（動画 + 音声 N 本） | 実行 |

`per_speaker` モードでは各 `tracks[]` に `offset_ms`（動画基準のシフト量）と `sync_confidence`（0〜1）を保存する。`sync_confidence < 0.6` のトラックは UI 上で人手微調整を想定する。

① 文字起こし時の話者分離方針（`per_speaker` 時）:

- 文字起こし入力: 同期済み話者トラックの統合ミックス
- 話者 ID 付与: 各時刻で **RMS エネルギーが最大のトラック** を話者と判定（ピンマイク分離を利用）

---

## style_config.json 完全スキーマ

スタイル設定はプロジェクトデータと分離して管理する（テンプレートとして使い回せるようにする）。

```jsonc
{
  "schema_version": "1.1.0",

  // ─── phrase_importance 別字幕スタイル（④ 字幕） ────────
  "subtitle_styles": {
    "by_importance": {
      "2": {
        "font": "NotoSansJP-Bold",
        "size_pt": 36,
        "color": "#FFFFFF",
        "border_color": "#000000",
        "border_width": 3,
        "shadow": {
          "spread": 4,
          "offset_x": 2,
          "offset_y": 2,
          "color": "#00000099"
        },
        "appear_from": "speaker_side",
        "linger_ms": 1500,
        "overlap_rule": "push_lower_up"
      },
      "1": {
        "font": "NotoSansJP-Medium",
        "size_pt": 30,
        "color": "#FFFFFF",
        "border_color": "#000000",
        "border_width": 2,
        "shadow": { "spread": 3, "offset_x": 1, "offset_y": 1, "color": "#00000088" },
        "appear_from": "speaker_side",
        "linger_ms": 1200,
        "overlap_rule": "push_lower_up"
      },
      "0": {
        "font": "NotoSansJP-Regular",
        "size_pt": 26,
        "color": "#EEEEEE",
        "border_color": "#000000",
        "border_width": 2,
        "shadow": { "spread": 2, "offset_x": 1, "offset_y": 1, "color": "#00000077" },
        "appear_from": "bottom",
        "linger_ms": 1000,
        "overlap_rule": "push_lower_up"
      }
    },

    // ─── テロップ（⑤） ───────────────────────────────────
    "common_telop": {
      "base_color": "#1A1A2E",
      "border_color": "#E94560",
      "border_width": 2,
      "font": "NotoSansJP-Medium",
      "size_pt": 28,
      "color": "#FFFFFF",
      "max_chars": 20,
      "align": "center",
      "v_align": "top",
      "padding": { "top": 8, "bottom": 8, "left": 16, "right": 16 }
    },

    "by_speaker": {
      "SPK_0": {
        "h_align": "left",
        "padding_h": 40,
        "appear_from": "left"
      },
      "SPK_1": {
        "h_align": "right",
        "padding_h": 40,
        "appear_from": "right"
      }
    }
  },

  "persistent_objects": [
    {
      "id": "logo",
      "asset": "assets/logo.png",
      "position": { "x": 32, "y": 32 },
      "size": { "w": 120, "h": 40 },
      "rotation_deg": 0,
      "opacity": 1.0,
      "z_order": 10
    }
  ],

  "scene_transition_defaults": {
    "default_type": "effect",
    "default_effect": "blur_dissolve",
    "duration_ms": 600,
    "available_effects": [
      "wipe_left", "wipe_right", "zoom_out",
      "flash_white", "blur_dissolve", "cut",
      "cross_dissolve", "dip_to_black"
    ]
  }
}
```

---

## Zod スキーマ実装方針

`src/lib/schema/transcript.ts` と `src/lib/schema/style.ts` に上記を Zod で定義する。
AI からのレスポンスは必ず Zod でバリデーションしてから state に反映すること。

```typescript
// src/lib/schema/transcript.ts（抜粋イメージ）
import { z } from "zod"

export const WordSchema = z.object({
  id: z.string(),
  speaker: z.string(),
  text: z.string(),
  start_ms: z.number(),
  end_ms: z.number(),
  edited_start_ms: z.number().optional(),
  edited_end_ms: z.number().optional(),
  confidence: z.number(),
  correction: z.union([z.null(), CorrectionSchema])
})

export const PhraseSchema = z.object({
  id: z.string(),
  word_ids: z.array(z.string()),
  text_snapshot: z.string(),
  bold: z.boolean(),
  phrase_importance: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  start_ms: z.number(),
  end_ms: z.number()
})

// ... Part / SceneTransition / TelopSegment / MediaHint / EditedTimeline を定義
```
