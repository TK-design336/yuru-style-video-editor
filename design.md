# Yuru-Style Video Editor — Design System

Glassmorphism（ガラスモーフィズム）を基調としたダーク UI の設計指針です。  
新規画面・コンポーネント追加時は本ドキュメントに従ってください。

---

## コンセプト

- **半透明 + ぼかし**: **Windows では CSS `backdrop-filter` は背後（壁紙・他ウィンドウ）をぼかせない**（DOM 内のみ）。Tauri の `windowEffects`（Windows: `acrylic`、macOS: `underWindowBackground`）で OS ネイティブのぼかしを適用する
- **背景について（重要）**: ウィンドウ背後に見える柄・色は **OS のデスクトップ壁紙** である。アプリ内に背景画像・アセット・装飾パターンを置かない。ネイティブ Acrylic が壁紙と重なった他ウィンドウをまとめてぼかす
- **アクセント**: ビビッドなオレンジ（`#FF6B35`）— CTA・選択状態・ラベルに使用
- **奥行き**: 薄いボーダー + ソフトシャドウ + 必要時のみオレンジのグロー

### Tauri とブラウザ開発

| 環境 | 背景の見え方 |
|------|-------------|
| Tauri（本番） | `transparent: true` + `windowEffects.acrylic`（Rust `setup` でも再適用）。CSS は薄いティントのみ |
| ブラウザ（Vite dev） | 壁紙はないため `html { background: #0a0a0c }` のニュートラル暗色フォールバック |

---

## デザイントークン

定義場所: `tailwind.config.ts` / `src/index.css` の `:root`

### カラー

| トークン | 値 | 用途 |
|---------|-----|------|
| `accent` | `#FF6B35` | プライマリ CTA、アクティブ状態 |
| `accent-soft` | `#FFB088` | リンク、サブラベル |
| `accent-muted` | `#FF8C5A` | ホバー |
| `accent-glow` | `rgba(255, 107, 53, 0.35)` | 選択時の外側グロー |
| `glass` | `rgba(18, 18, 22, 0.72)` | 標準パネル背景 |
| `glass-raised` | `rgba(26, 26, 32, 0.78)` | 一段浮いたパネル |
| `glass-deep` | `rgba(8, 8, 12, 0.85)` | プレビュー枠・入力・ログ |
| `glass-veil` | `rgba(10, 10, 14, 0.62)` | ブラウザ開発時の全画面ティント |
| `glass-veil-native` | `rgba(10, 10, 14, 0.14)` | Tauri 時の薄いティント（ぼかしは Acrylic が担当） |
| `glass-border` | `rgba(255, 255, 255, 0.12)` | 標準ボーダー |
| `glass-border-strong` | `rgba(255, 255, 255, 0.18)` | ボタン・強調ボーダー |

### タイポグラフィ

| 用途 | フォント | Tailwind |
|------|---------|----------|
| UI 本文 | Inter + Noto Sans JP | `font-sans` |
| 数値・ID・HEX | JetBrains Mono | `font-mono` / `.text-meta` |
| フェーズラベル | 大文字 + 字間広め + オレンジ | `.text-label` |

### 角丸

| トークン | 値 | 用途 |
|---------|-----|------|
| `rounded-glass` | 14px | ボタン、入力、小パネル |
| `rounded-glass-lg` | 18px | セグメントコントロール |
| `rounded-glass-xl` | 20px | 大きなコンテナ（将来） |

### ぼかし・影

| トークン | 値 |
|---------|-----|
| `backdrop-blur-glass` | 40px（全画面ベール） |
| `backdrop-blur-glass-panel` | 24px（パネル） |
| `shadow-glass-sm` | 軽い浮き |
| `shadow-accent-glow-sm` | CTA・選択時 |

---

## コンポーネントクラス（`src/index.css`）

新規 UI では **まず以下を使い**、足りない場合のみ Tailwind ユーティリティを追加する。

| クラス | 用途 |
|--------|------|
| `.app-shell` | ページ最外殻。Tauri 時は `::before` で薄いティントのみ |
| `.glass-main` | メインカラムの追加ティント（ヘッダー下の作業領域） |
| `.glass-surface` | `backdrop-filter` 付き基底（他 glass-* の内部で使用） |
| `.glass-panel` | 標準カード・セクション |
| `.glass-panel-raised` | サイドバーカード、API キーパネル等 |
| `.glass-panel-deep` | 動画プレビュー内側、ネストした設定ブロック |
| `.glass-header` | 画面上部ヘッダー |
| `.glass-sidebar` | 右サイドバー領域 |
| `.glass-input` | `input` / `select` / `textarea` |
| `.glass-btn-primary` | メインアクション（オレンジ） |
| `.glass-btn-secondary` | サブアクション（半透明 pill） |
| `.glass-btn-ghost` | 枠線のみ・低強調 |
| `.glass-segment` + `.glass-segment-item` + `.glass-segment-item-active` | タブ・ステップ切替 |
| `.glass-preview` | 動画・メディアプレビュー枠 |
| `.glass-progress-track` / `.glass-progress-fill` | 進捗バー |
| `.glass-card-selected` | 選択中カード（オレンジグロー） |
| `.glass-toast` | 通知トースト |
| `.text-label` | フェーズ表示（例: `Phase 1 — ① 文字起こし`） |
| `.text-meta` | モノスペースの補助情報 |

---

## レイアウトパターン

```
┌─────────────────────────────────────────────┐
│  glass-header（フェーズラベル + タイトル + ナビ） │
├──────────────────────────┬──────────────────┤
│  メイン（プレビュー・一覧）    │  glass-sidebar   │
│  glass-panel で区切る      │  話者・設定       │
└──────────────────────────┴──────────────────┘
```

- ページ背景に `bg-surface` 等の **不透明色を敷かない**
- 区切り線は `border-glass-border`
- 右サイドバー幅: 380px（lg: 420px）— `Ingest.tsx` 参照

---

## セマンティックカラー（状態表示）

ガラス基調を保ちつつ、意味は色で伝える。

| 状態 | 配色例 |
|------|--------|
| 成功 | `border-emerald-500/30 bg-emerald-500/10 text-emerald-100` |
| 警告 | `border-amber-500/30 bg-amber-500/10 text-amber-100` |
| エラー | `border-red-500/30 bg-red-500/10 text-red-200` |
| 要確認（校正） | `border-red-500/40 bg-red-500/5` |

状態バッジは `.glass-panel` と組み合わせ、`rounded-glass` を維持する。

---

## やってはいけないこと

1. **背景画像・グラデーション・アセットを UI 背景に追加しない**（壁紙は OS 側）
2. **透明な隙間を残さない** — パネル単体の blur だけに頼らず、必ず `.app-shell` または `.glass-main` で覆う
3. **不透明な `#1A1A2E` 等で画面全体を塗りつぶさない**（ガラス効果が失われる）
4. **ピンク系アクセント（旧 `#E94560`）に戻さない**
5. **`rounded-md` だけのフラット UI に戻さない** — 原則 `rounded-glass` 以上
6. **`backdrop-filter` だけで背後をぼかそうとしない** — Windows Tauri では効かない

---

## 新コンポーネント追加チェックリスト

- [ ] 最外殻は `.app-shell` または親の glass コンテナ内
- [ ] カード・セクションは `.glass-panel` 系
- [ ] ボタンは `.glass-btn-*` のいずれか
- [ ] フォーム要素は `.glass-input`
- [ ] 技術的数値は `.text-meta` / `font-mono`
- [ ] アクティブ・選択状態にオレンジグローを検討
- [ ] 背景画像を使っていないことを確認

---

## 関連ファイル

| ファイル | 役割 |
|---------|------|
| `tailwind.config.ts` | カラー・影・blur・radius のトークン |
| `src/index.css` | CSS 変数 + `@layer components` |
| `index.html` | Inter / Noto Sans JP / JetBrains Mono |
| `src/main.tsx` | Tauri 時に `tauri-transparent` クラス付与 |
| `src-tauri/tauri.conf.json` | `transparent: true` + `windowEffects` |
| `src-tauri/src/lib.rs` | 起動時 `set_effects`（Windows: Acrylic） |

字幕・エクスポート用の色（`src/lib/schema/style.ts`）は UI とは別系統。将来プレビューを合わせる場合は `base_color` を glass トーンに更新すること。
