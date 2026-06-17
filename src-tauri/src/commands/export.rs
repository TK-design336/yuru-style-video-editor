use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct PythonExportRequest {
    pub script_name: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct PythonExportResponse {
    pub ok: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

/// Python エクスポートスクリプトを呼び出す（Phase 5 実装予定）
#[tauri::command]
pub async fn run_python_export(
    request: PythonExportRequest,
) -> Result<PythonExportResponse, String> {
    let _ = request;
    Err("run_python_export は Phase 5 で実装予定です".into())
}
