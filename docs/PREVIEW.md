# プレビューエンジン設計

---

## アーキテクチャ概要

```
Tauri WebView
├─ <video id="source">          元動画（ローカルファイル, asset protocol経由）
│
├─ <canvas id="overlay">        字幕・テロップ・常時オブジェクト描画
│   └─ requestAnimationFrame で video.currentTime に同期
│
├─ <div id="transition-layer">  Scene Transition エフェクト（CSS / WebGL）
│
└─ タイムラインバー（Canvas or SVG）
    ├─ Partブロック（ドラッグで境界調整）— ③ カット編集
    ├─ フレーズマーカー（⬛）— ④ 字幕
    ├─ Telopマーカー（🏷）— ⑤ テロップ
    ├─ Media Hintマーカー（📎）— ⑥ 図解
    └─ Transitionマーカー（⚡）— ③ カット編集
```

---

## 編集後タイムラインとプレビュー同期

③ カット編集完了後、プレビューは **編集後タイムライン**（`edited_timeline`）を基準に動作する。

```typescript
// src/hooks/useTimelineMapping.ts

/** 編集後タイムライン上の位置 → 元動画の currentTime */
export function editedToSourceMs(editedMs: number, timeline: EditedTimeline): number {
  for (const seg of timeline.segments) {
    if (editedMs >= seg.edited_start_ms && editedMs < seg.edited_end_ms) {
      if (seg.type === "transition") return seg.source_start_ms
      const offset = editedMs - seg.edited_start_ms
      return seg.source_start_ms + offset
    }
  }
  return 0
}

/** 元動画の位置 → 編集後タイムライン上の位置（trim区間はスキップ） */
export function sourceToEditedMs(sourceMs: number, timeline: EditedTimeline): number {
  // trim された区間に入ったら次の有効セグメント先頭へジャンプ
  // ...
}
```

④ 字幕・⑤ テロップのプレビューは `edited_start_ms` 基準で表示タイミングを判定する。

---

## トリムプレビュー実装（段階的）

### Phase 1（MVP）: currentTime ジャンプ方式

trim: true の Part を skipList として保持し、video.currentTime がその区間に入った瞬間に次の有効 Part 先頭にジャンプする。

```typescript
// src/hooks/useVideoSync.ts

export function useVideoSync(videoRef: RefObject<HTMLVideoElement>, project: ProjectData) {
  const trimmedRanges = useMemo(() =>
    project.parts
      .filter(p => p.trim)
      .map(p => ({ start: p.start_ms / 1000, end: p.end_ms / 1000 })),
    [project.parts]
  )

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      const t = video.currentTime
      for (const range of trimmedRanges) {
        if (t >= range.start && t < range.end) {
          video.currentTime = range.end
          break
        }
      }
    }

    video.addEventListener("timeupdate", handleTimeUpdate)
    return () => video.removeEventListener("timeupdate", handleTimeUpdate)
  }, [trimmedRanges])
}
```

### Phase 2: ffmpeg セグメント結合

Rust サイドで `ffmpeg-next` を使い、trim区間を除いたクリップをオンデマンド結合。
トランジション挿入区間も含めた編集後タイムライン用の一時ファイルをプレビューに使う。

```rust
// src-tauri/src/commands/ffmpeg.rs（実装方針）

#[tauri::command]
pub async fn build_preview_clip(
    source_path: String,
    active_ranges: Vec<(u64, u64)>,
    output_path: String,
) -> Result<String, String> {
    // ffmpeg の concat demuxer を使って結合
    todo!()
}
```

---

## Canvas 字幕描画エンジン（④ 字幕）

```typescript
// src/components/preview/SubtitleRenderer.tsx

interface ActiveSubtitle {
  text: string
  phraseImportance: 0 | 1 | 2
  speaker: string
  y: number
}

export function useSubtitleRenderer(
  canvasRef: RefObject<HTMLCanvasElement>,
  videoRef: RefObject<HTMLVideoElement>,
  project: ProjectData,
  styleConfig: StyleConfig
) {
  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    let animFrameId: number

    const render = () => {
      const ctx = canvas.getContext("2d")!
      const currentEditedMs = sourceToEditedMs(video.currentTime * 1000, project.edited_timeline)

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      renderPersistentObjects(ctx, styleConfig.persistent_objects)

      const activeSubtitles = getActiveSubtitles(currentEditedMs, project, styleConfig)
      const layouted = resolveOverlaps(activeSubtitles, canvas.height, styleConfig)

      for (const sub of layouted) {
        renderSubtitle(ctx, sub, styleConfig)
      }

      animFrameId = requestAnimationFrame(render)
    }

    animFrameId = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animFrameId)
  }, [project, styleConfig])
}
```

④ 字幕フェーズでは phrase_importance（0〜2）ごとの表示スタイルを `StylePanel` で調整し、プレビューに即時反映する。

---

## テロッププレビュー（⑤ テロップ）

```typescript
// telop_segments[] を編集後タイムライン基準で描画
const activeTelop = getActiveTelop(currentEditedMs, project.telop_segments)
if (activeTelop) {
  renderTelop(ctx, activeTelop, styleConfig)
}
```

⑤ テロップフェーズでは文案・位置・表示時間を手動調整し、プレビューで確認する。

---

## タイムラインバー

### コンポーネント構成

```
TimelineBar
├─ WaveformTrack（wavesurfer.js 波形）
├─ PartBlocks（③ カット編集）
│   └─ PartBlock × N
│       ├─ ドラッグハンドル（左端 / 右端）
│       ├─ part_importance 表示（0〜4）
│       ├─ trim ON/OFF
│       └─ 右クリックメニュー（種別変更 / Sub-Part分割）
├─ MarkerTrack
│   ├─ PhraseMarker（⬛）— ④ phrase_importance 0〜2
│   ├─ TelopMarker（🏷）— ⑤ 細分化区間
│   ├─ MediaHintMarker（📎）— ⑥ 図解メモ
│   └─ TransitionMarker（⚡）— ③ トランジション
└─ PlayheadCursor（編集後タイムライン上の現在位置）
```

### PartBlock のドラッグ実装方針

```typescript
// src/components/timeline/PartBlock.tsx

const handleDragEnd = (partId: string, newEndMs: number) => {
  const snapped = snapToNearestWordBoundary(newEndMs, project.words)
  updatePartBoundary(partId, snapped)
  recalculateEditedTimeline()  // ③ 変更時は必ず再計算
}
```

---

## Scene Transition エフェクト実装（③ カット編集）

### エフェクト（CSS / WebGL）

```typescript
// src/components/preview/TransitionRenderer.tsx

const EFFECT_IMPLEMENTATIONS: Record<string, (progress: number) => CSSProperties> = {
  "blur_dissolve": (p) => ({
    filter: `blur(${(1 - Math.abs(p * 2 - 1)) * 20}px)`,
    opacity: p < 0.5 ? 1 - p * 2 : (p - 0.5) * 2
  }),
  "flash_white": (p) => ({
    backgroundColor: `rgba(255,255,255,${1 - Math.abs(p * 2 - 1)})`
  }),
  "wipe_left": (p) => ({
    clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`
  }),
  "dip_to_black": (p) => ({
    backgroundColor: `rgba(0,0,0,${1 - Math.abs(p * 2 - 1)})`
  })
}
```

### clip 素材（動画・アルファ動画・GIF）

```typescript
// type: "clip" の場合はトランジション区間中に別の <video> / <img> を overlay 表示
// alpha_video は取り込み時に WebM VP9 に変換してプレビューに使う
```

---

## ⑥ 図解フェーズのプレビュー

⑥ 図解は動画への直接反映を行わない。タイムライン上に Media Hint マーカーを表示し、クリックでパネルにメモ内容（Mermaid / 検索クエリ / 説明欄テキスト）を表示する。

---

## 話者ラベル編集UI（① 文字起こし）

```typescript
// src/components/panels/SpeakerPanel.tsx

// ① 文字起こし完了直後に表示する専用ステップ
// 操作:
//  - 各 SPK_N に対してラベル（名前）を入力
//  - position を left / right / center から選択
//  - color をカラーピッカーで選択
//  - 試聴ボタン: その話者の最初の発言箇所に video.currentTime をジャンプ
//  - マージ: 誤って分かれた話者を1人にまとめる
```
