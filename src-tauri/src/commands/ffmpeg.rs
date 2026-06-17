use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct TimeRangeMs {
    pub start_ms: u64,
    pub end_ms: u64,
}

#[derive(Debug, Serialize)]
pub struct BuildPreviewClipResult {
    pub output_path: String,
}

/// trim 区間を除いたプレビュー用クリップを結合する（Phase 2 実装予定）
#[tauri::command]
pub async fn build_preview_clip(
    source_path: String,
    active_ranges: Vec<TimeRangeMs>,
    output_path: String,
) -> Result<BuildPreviewClipResult, String> {
    let _ = (source_path, active_ranges, output_path);
    Err("build_preview_clip は Phase 2 で実装予定です".into())
}
