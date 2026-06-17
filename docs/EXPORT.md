# ⑦ 書き出しフォーマット仕様

本ツールの最終出力は **外部 NLE で追加編集・調整可能な形式** です。最終レンダリング（動画の焼き込み出力）は行いません。

---

## 出力フォルダ構成

```
output/
├─ timeline.fcpxml               ★ NLE取り込みのエントリポイント
├─ timeline.otio                 変換ハブ（AAF等への変換用）
├─ assets/                       ★ FCPXMLが参照する全素材（相対パス）
│   ├─ clip_001.mp4              トリム済みクリップ or 元動画参照
│   ├─ logo.png
│   └─ transitions/
│       ├─ transition_001.webm   アルファ付き（WebM VP9）
│       └─ transition_002.mp4    全画面差し替え用
├─ subtitles/
│   ├─ subtitles.srt             汎用（YouTube等）
│   ├─ subtitles.ass             スタイル付き字幕（DaVinci Fusion等）
│   └─ subtitles.vtt             Web配信用
├─ design_reference/
│   └─ telop_frame.psd           テロップデザイン確認用（レイヤー付き）
├─ media_hints.json              ⑥ 図解・引用メモ（マーカーにも埋め込み済み）
├─ description.txt               ⑥ 動画説明欄用テキスト
└─ project_data.json             マスターデータ（再編集用）
```

---

## timeline.fcpxml の構造

FCPXMLは `opentimelineio` + カスタムシリアライザで生成する。
`assets/` への参照は全て相対パスにする（フォルダを移動しても壊れないように）。

タイムライン上の位置は **編集後タイムライン**（`edited_timeline`）基準で出力する。

### 含める情報

| 情報 | FCPXML での表現 |
|---|---|
| トリム済みクリップ列 | `<clip>` の連続（編集後タイムライン順） |
| 話者字幕 | `<title>` テキストレイヤー（phrase_importance 別スタイル） |
| テロップ（細分化区間） | `<title>` テキストレイヤー |
| 常時オブジェクト（ロゴ等） | `<video>` または `<title>` |
| Scene Transition（effect） | `<transition>` |
| Scene Transition（clip） | `<asset-clip>` で素材を参照 |
| media_hints | `<marker>` コメント（図解メモ） |
| fact_flag | `<marker>` コメント（色: 赤） |

### FCPXML 生成スクリプト

```python
# python/export_fcpxml.py

import opentimelineio as otio
from pathlib import Path

def export_fcpxml(project: dict, style: dict, output_dir: Path):
    """
    project_data.json + style_config.json → timeline.fcpxml
    編集後タイムライン（edited_timeline）基準で出力
    """
    timeline = otio.schema.Timeline(name="ai_video_edit")
    track = otio.schema.Track(name="V1", kind=otio.schema.TrackKind.Video)

    for seg in project["edited_timeline"]["segments"]:
        if seg["type"] != "clip":
            continue
        clip = otio.schema.Clip(
            name=seg.get("title", "clip"),
            source_range=otio.opentime.TimeRange(
                start_time=otio.opentime.RationalTime(seg["source_start_ms"] / 1000 * 25, 25),
                duration=otio.opentime.RationalTime(
                    (seg["source_end_ms"] - seg["source_start_ms"]) / 1000 * 25, 25
                ),
            )
        )
        track.append(clip)

    timeline.tracks.append(track)

    otio.adapters.write_to_file(
        timeline,
        str(output_dir / "timeline.fcpxml"),
        adapter_name="fcpx_xml"
    )

    _inject_text_layers(output_dir / "timeline.fcpxml", project, style)
    _inject_markers(output_dir / "timeline.fcpxml", project)
```

---

## subtitles.ass 生成（④ 字幕）

phrase_importance は 0〜2 の 3 段階。編集後タイムライン基準の `start_ms` / `end_ms` を使用する。

```python
# python/export_subtitles.py

import pysubs2

def export_ass(project: dict, style: dict, output_dir: Path):
    subs = pysubs2.SSAFile()

    for importance in range(3):
        s = style["subtitle_styles"]["by_importance"][str(importance)]
        subs.styles[f"importance_{importance}"] = pysubs2.SSAStyle(
            fontname=s["font"],
            fontsize=s["size_pt"],
            primarycolor=pysubs2.Color.from_rgb_str(s["color"]),
            outlinecolor=pysubs2.Color.from_rgb_str(s["border_color"]),
            outline=s["border_width"],
            shadow=s["shadow"]["spread"],
        )

    for phrase in project["phrases"]:
        if not phrase["bold"]:
            continue

        event = pysubs2.SSAEvent(
            start=phrase["start_ms"],
            end=phrase["end_ms"] + style["subtitle_styles"]["by_importance"][str(phrase["phrase_importance"])]["linger_ms"],
            text=phrase["text_snapshot"],
            style=f"importance_{phrase['phrase_importance']}"
        )
        subs.events.append(event)

    subs.sort()
    subs.save(str(output_dir / "subtitles" / "subtitles.ass"))
    subs.save(str(output_dir / "subtitles" / "subtitles.srt"), format_="srt")
    subs.save(str(output_dir / "subtitles" / "subtitles.vtt"), format_="vtt")
```

---

## telop_frame.psd 生成（⑤ テロップ）

```python
# python/export_psd.py

def export_psd(project: dict, style: dict, output_dir: Path, video_w=1920, video_h=1080):
    """
    レイヤー構成:
    Layer 5: テロップ（telop_segments 単位）
    Layer 4: phrase字幕（importance別グループ）
    Layer 3: 常時オブジェクト（ロゴ等）
    Layer 2: 背景（動画フレームのプレースホルダー）
    """
    pass
```

---

## media_hints.json + description.txt（⑥ 図解）

```python
def export_media_hints_and_description(project: dict, output_dir: Path):
    import json

    hints = project.get("media_hints", [])
    with open(output_dir / "media_hints.json", "w", encoding="utf-8") as f:
        json.dump({"media_hints": hints}, f, ensure_ascii=False, indent=2)

    description = project.get("description_text", "")
    with open(output_dir / "description.txt", "w", encoding="utf-8") as f:
        f.write(description)
```

Mermaid や生成画像がある場合は `assets/diagrams/` にコピーし、`media_hints.json` 内のパスを相対参照する。

---

## NLE別取り込み手順（ユーザー向け）

### DaVinci Resolve（推奨）

```
1. output/ フォルダをプロジェクト作業フォルダに配置
2. File > Import > Timeline > output/timeline.fcpxml
   └─ assets/ への相対パスが自動解決
3. マーカーに media_hints（図解メモ）が表示される
4. description.txt を動画説明欄にコピー
5. 必要なら subtitles/subtitles.ass を Fusion で追加
```

### Adobe Premiere Pro

```
1. output/ フォルダを配置
2. File > Import > output/timeline.fcpxml
3. 字幕が崩れた場合 → subtitles/subtitles.srt を Captions トラックに追加
4. media_hints のマーカーコメントを参照して図解を手動配置
```

### Final Cut Pro

```
1. output/ フォルダを配置
2. File > Import > XML > output/timeline.fcpxml（最も忠実に復元）
```

### 残る手作業（全NLE共通）

| 作業 | 理由 |
|---|---|
| フォント確認 | NLE環境に同名フォントがない場合に代替フォントが当たる |
| media_hints の図解配置 | ⑥ の設計方針どおり外部 NLE で人力配置（マーカーコメントを参照） |
| Scene Transition clip 素材の差し替え | `asset_hint` を参考に自分で素材を用意・配置 |
| テロップデザインの微調整 | `design_reference/telop_frame.psd` を参考に |
| 最終レンダリング | 本ツールは行わない。NLE で実施 |

---

## alpha_video 変換（ProRes 4444 → WebM）

ブラウザ（WebView2）は ProRes 4444 を再生できないため、
③ カット編集のプレビュー用に Rust サイドで ffmpeg を使い WebM VP9 に変換する。
⑦ 書き出しの FCPXML は元の ProRes 4444（.mov）のパスを参照させる。

```rust
// src-tauri/src/commands/ffmpeg.rs

#[tauri::command]
pub async fn convert_alpha_video_for_preview(
    src_path: String,
    dst_path: String,
) -> Result<(), String> {
    // ffmpeg -i src.mov -c:v libvpx-vp9 -pix_fmt yuva420p dst.webm
    todo!()
}
```
