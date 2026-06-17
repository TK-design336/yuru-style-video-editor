# スクリーンショット配置ガイド

README では **実画面キャプチャ** のみ `docs/screenshots/` 直下を参照します。  
完成イメージ（ゴール像）は `docs/screenshots/goal/` に置き、README の「ゴール像」セクションでのみ使用します。

## ワークフローとファイル名の対応

新ワークフローは **①〜⑦** の 7 フェーズです。既存のファイル名（`00-`, `01-` 等）はレガシー命名ですが、画像パスは互換のため当面維持します。新規キャプチャは下表の推奨名で保存してください。

| 新フェーズ | 内容 | 既存ファイル名（レガシー） | 推奨ファイル名（新規） |
|---|---|---|---|
| ① 文字起こし | 動画選択・文字起こし・話者ラベル | `00-ingest-*.png` | `01-transcription-*.png` |
| ② 校正 | トランスクリプト確認・校正候補（1 枚） | `01-correction.png` | `02-correction.png` |
| ③ カット編集 | Part分割・Importance・カット・トランジション | `02-part-separation.png`, `03-importance.png`, `07-shift-animation.png` | `03-cut-editing-*.png` |
| ④ 字幕 | ボールド強調・phrase_importance・プレビュー | `05-phrase-bold.png` | `04-subtitle-*.png` |
| ⑤ テロップ | 細分化区間テロップ・プレビュー | `06-telop.png` | `05-telop-*.png` |
| ⑥ 図解 | 図解メモ・説明欄テキスト | `08-media-hints.png` | `06-diagram-*.png` |
| ⑦ 書き出し | NLE 向け出力画面 | — | `07-export.png` |

## 配置ルール

| 種別 | パス | 用途 |
|---|---|---|
| 実画面 | `docs/screenshots/{ファイル名}.png` | 実装済み・実装中画面の説明 |
| ゴール像 | `docs/screenshots/goal/goal-{名前}.png` | 未実装 UI のイメージ（参考用） |

推奨サイズ: 幅 1440px 前後（16:9）。ファイル名は上表のとおり。

---

## 実画面キャプチャ一覧（用意するもの）

### 共通

| ファイル名 | 撮影内容 | README 掲載箇所 |
|---|---|---|
| `common-ai-settings.png` | ヘッダー「AI API 設定」モーダル（プロバイダ選択・キー入力が見える状態） | 共通 UI |

### ① 文字起こし

| ファイル名 | 撮影内容 | README 掲載箇所 |
|---|---|---|
| `00-ingest-select.png` | 動画選択直後。プレビューと「Whisper + NeMo で文字起こし」ボタンが見える | ①・実装済み |
| `00-ingest-transcribe.png` | 文字起こし実行中（進捗バー表示時） | ①・実装済み |
| `00-ingest-speakers.png` | 文字起こし完了後。右サイドバー「話者ラベル」＋トランスクリプト一覧 | ①・実装済み |

### ② 校正

| ファイル名 | 撮影内容 | README 掲載箇所 |
|---|---|---|
| `01-correction.png` | 校正画面全体。文字起こしと校正候補（承認/却下 UI）が **1 枚に収まる** ように撮影（大画面・2 カラム表示時など） | ②・実装済み |

### ③ カット編集

| ファイル名 | 撮影内容 | README 掲載箇所 |
|---|---|---|
| `02-part-separation.png` | Part 分割画面。波形タイムラインに main/tangent 等の色分けブロック＋動画プレビュー | ③・一部実装済み |
| `03-importance.png` | Part ごとの Importance（0〜4）表示・カット提案・理由テキスト | ③・予定 |
| `07-shift-animation.png` | Part 境界のトランジション挿入提案＋プレビュー | ③・予定 |

### ④〜⑦（未実装 — ゴール像 or 実装後に差し替え）

| ファイル名 | 撮影内容 | README 掲載箇所 |
|---|---|---|
| `05-phrase-bold.png` | 字幕プレビュー上のボールド強調＋ phrase_importance（0〜2）調整 UI | ④・予定 |
| `06-telop.png` | 細分化区間テロップのプレビュー＋手動調整パネル | ⑤・予定 |
| `08-media-hints.png` | 図解・引用・訂正メモ＋説明欄テキスト生成 | ⑥・予定 |
| `07-export.png` | ⑦ 書き出し画面（出力形式選択・完了表示） | ⑦・予定 |

> `04-trim-proposal.png` と `08-provisional-output.png` は旧ワークフロー用。③ に統合されたカット提案と、廃止された動画仮出力のため、新規撮影は不要。

---

## ゴール像（参考イメージ・既存）

`goal/` 内の画像は AI 生成または暫定キャプチャであり、**実画面ではありません**。  
実画面が揃い次第、README のゴール像セクションを差し替えるか削除してください。

| ファイル | 内容 |
|---|---|
| `goal-ingest-select.png` | ① 文字起こし画面イメージ |
| `goal-ingest-speakers.png` | ① 話者ラベル設定イメージ |
| `goal-correction.png` | ② 校正画面イメージ |
| `goal-part-editor.png` | ③ カット編集（Part 分割）画面イメージ |

未実装フェーズ用のゴール像（`goal-subtitle.png`, `goal-export.png` 等）は、デザインが固まり次第追加してください。
