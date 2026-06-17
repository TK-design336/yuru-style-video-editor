# AI-Driven Dialogue Video Editor — 設計仕様書

## プロジェクト概要

対話形式動画（対談・インタビュー等）に特化した AI 駆動の半自動編集ツール。
文字起こしから FCPXML 出力まで、AI と人間が交互に関与しながら編集を進める。

最終成果物は `output/timeline.fcpxml` + `output/assets/` を NLE（DaVinci Resolve / Adobe Premiere / Final Cut Pro）に取り込むことで、カット構造・字幕・テロップ・トランジション・マーカーが一括復元される。**本ツール内での最終レンダリングは行わない。**

---

## 編集ワークフロー（7 フェーズ + ⓪ 前処理）

| # | フェーズ | 概要 |
|---|---|---|
| ⓪ | マルチトラック同期（予定） | 動画 + 話者別音声 N 本のオフセット合わせ。混合音声のみの場合はスキップ |
| ① | 文字起こし | 話者ラベル・タイムスタンプ付き word 単位トランスクリプション |
| ② | 校正 | 誤字・話者判定・区切りの修正提案 → 人間が承認 |
| ③ | カット編集 | Part 分割 + Importance（0〜4）+ カット提案 + トランジション挿入。タイムスタンプ再計算 |
| ④ | 字幕 | ボールド + phrase_importance（0〜2）+ 表示スタイル。プレビューで手動調整 |
| ⑤ | テロップ | 細分化区間ごとの文案提案。プレビューで手動調整 |
| ⑥ | 図解 | 図解・注釈・引用・訂正のタイムスタンプ付きメモ + 説明欄テキスト（外部 NLE 用） |
| ⑦ | 書き出し | NLE 取り込み用形式の出力（非レンダリング） |

---

## 技術スタック

| レイヤー | 技術 |
|---|---|
| デスクトップシェル | Tauri v2（Rust + WebView2） |
| フロントエンド | React 18 + TypeScript + Vite |
| スタイリング | Tailwind CSS v3 |
| タイムラインUI | wavesurfer.js（波形） + 自作Partブロック描画（Canvas） |
| 字幕プレビュー | Canvas API（video.currentTime に同期） |
| AI処理 | Claude API（claude-sonnet-4-20250514） |
| 文字起こし | WhisperX（Python サイドカープロセス, word-level + diarization） |
| 動画処理 | ffmpeg（Rustバインド: `ffmpeg-next` crate） |
| FCPXML生成 | Python: `opentimelineio` + カスタムFCPXMLシリアライザ |
| 字幕生成 | Python: `pysubs2`（ASS / SRT / VTT） |
| PSD生成 | Python: `psd-tools` |
| プロセス間通信 | Tauri Commands（Rust ↔ React） + Python サイドカー |

---

## リポジトリ構成

```
ai-video-editor/
├── src-tauri/                        # Tauri / Rust
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/
│   │   │   ├── ffmpeg.rs             # 動画処理コマンド
│   │   │   ├── export.rs             # ⑦ 書き出し生成コマンド
│   │   │   └── sidecar.rs            # Python サイドカー呼び出し
│   │   └── preview/
│   │       └── clip_server.rs        # ローカル動画配信（トリムプレビュー用）
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── src/                              # React フロントエンド
│   ├── App.tsx
│   ├── pages/
│   │   ├── Ingest.tsx                # ⓪ 同期（予定）+ ① 文字起こし・話者ラベル設定
│   │   ├── Correction.tsx            # ② 校正
│   │   ├── CutEditor.tsx             # ③ カット編集（分割・Importance・カット・トランジション）
│   │   ├── SubtitleEditor.tsx        # ④ 字幕
│   │   ├── TelopEditor.tsx           # ⑤ テロップ
│   │   ├── DiagramEditor.tsx         # ⑥ 図解・説明欄テキスト
│   │   └── Export.tsx                # ⑦ 書き出し
│   ├── components/
│   │   ├── timeline/
│   │   │   ├── TimelineBar.tsx       # タイムラインバー本体
│   │   │   ├── PartBlock.tsx         # Part ブロック（ドラッグ対応）
│   │   │   ├── MarkerPin.tsx         # phrase / media_hint / transition マーカー
│   │   │   └── WaveformTrack.tsx     # wavesurfer.js ラッパー
│   │   ├── preview/
│   │   │   ├── PreviewPlayer.tsx     # <video> + <canvas> オーバーレイ合成
│   │   │   ├── SubtitleRenderer.tsx  # Canvas字幕描画エンジン
│   │   │   └── TransitionRenderer.tsx
│   │   ├── panels/
│   │   │   ├── SpeakerPanel.tsx      # 話者ラベル編集
│   │   │   ├── SyncPanel.tsx         # ⓪ マルチトラック同期 UI（予定）
│   │   │   ├── StylePanel.tsx        # 字幕・テロップスタイル設定
│   │   │   ├── MediaHintPanel.tsx    # 図解・引用メモ表示
│   │   │   └── TransitionPanel.tsx   # トランジション設定
│   │   └── ui/                       # 共通UIコンポーネント
│   ├── store/
│   │   ├── projectStore.ts           # Zustand: project_data.json の状態管理
│   │   ├── styleStore.ts             # Zustand: スタイル設定
│   │   └── previewStore.ts           # Zustand: プレビュー再生状態
│   ├── hooks/
│   │   ├── useVideoSync.ts           # video.currentTime ↔ タイムライン同期
│   │   ├── useTimelineMapping.ts     # ③ 後の編集後タイムスタンプ変換
│   │   ├── useAIProcess.ts           # Claude API 呼び出しフック
│   │   └── useExport.ts              # ⑦ 書き出し生成フック
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── client.ts             # Claude API クライアント
│   │   │   ├── sync.ts               # ⓪ sync_media.py ラッパー（予定）
│   │   │   └── prompts/              # フェーズごとのプロンプト定義
│   │   │       ├── correction.ts
│   │   │       ├── cutEditing.ts     # ③ 分割・Importance・カット・トランジション統合
│   │   │       ├── phraseHighlight.ts
│   │   │       ├── telopSuggestion.ts
│   │   │       └── mediaHint.ts
│   │   └── schema/
│   │       ├── transcript.ts         # Zod スキーマ（project_data.json）
│   │       └── style.ts              # Zod スキーマ（style_config.json）
│   └── types/
│       └── index.ts
│
├── python/                           # Python サイドカー群
│   ├── whisperx_runner.py            # ① 文字起こし・話者識別
│   ├── sync_media.py                 # ⓪ マルチトラック同期（予定）
│   ├── export_fcpxml.py              # FCPXML生成
│   ├── export_subtitles.py           # ASS / SRT / VTT 生成
│   └── export_psd.py                 # PSD参照フレーム生成
│
├── output/                           # ⑦ 生成物（NLEに渡すフォルダ）
│   ├── timeline.fcpxml
│   ├── timeline.otio
│   ├── assets/
│   ├── subtitles/
│   ├── design_reference/
│   ├── media_hints.json
│   ├── description.txt
│   └── project_data.json
│
├── docs/
│   ├── README.md                     # 本ファイル
│   ├── DATAMODEL.md                  # データモデル仕様
│   ├── SYNC.md                       # ⓪ マルチトラック同期設計（予定）
│   ├── AI_PROMPTS.md                 # AIプロンプト設計
│   ├── PREVIEW.md                    # プレビューエンジン設計
│   ├── EXPORT.md                     # ⑦ 書き出しフォーマット仕様
│   └── STYLE_CONFIG.md               # スタイル設定リファレンス
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
└── .cursor/
    └── rules/                        # Cursor ルール（後述）
```

---

## NLE移送手順（エンドユーザー向け）

### DaVinci Resolve（推奨）

1. `output/` フォルダをプロジェクト作業フォルダに配置
2. `File > Import > Timeline > output/timeline.fcpxml`
3. `assets/` への相対パスが自動解決される
4. マーカーに `media_hints`（図解メモ）が表示される
5. `description.txt` を動画説明欄にコピー

### Adobe Premiere Pro

1. `output/` フォルダを配置
2. `File > Import > output/timeline.fcpxml`
3. 字幕が崩れた場合 → `subtitles/subtitles.srt` を Captions トラックに追加

### Final Cut Pro

1. `output/` フォルダを配置
2. `File > Import > XML > output/timeline.fcpxml`（最も忠実に復元）

---

## 開発フェーズ

| フェーズ | 内容 |
|---|---|
| Phase 0（予定） | ⓪ マルチトラック同期（`sync_media.py`・`SyncPanel`・`meta.audio_sources`・RMS 話者分離） |
| Phase 1 | ①② データモデル確立・WhisperX連携・校正UI |
| Phase 2 | ③ カット編集UI（Part分割・Importance・カット提案・トランジション・タイムスタンプ再計算） |
| Phase 3 | ④ 字幕・phrase_importance・プレビュー |
| Phase 4 | ⑤ テロップ（細分化区間）・プレビュー |
| Phase 5 | ⑥ 図解メモ・説明欄テキスト |
| Phase 6 | ⑦ FCPXML / ASS / PSD / media_hints / description.txt 書き出し |
| Phase 7 | プレビューシームレス化（ffmpegセグメント結合） |
