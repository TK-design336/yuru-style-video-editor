use crate::commands::whisperx_setup::{resolve_whisperx_python, runtime_env_pairs};
use crate::python_sidecar::{run_python_script_with_executable, resolve_python_executable};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
pub struct SidecarRequest {
    pub script_name: String,
    pub payload: Value,
}

#[derive(Debug, Serialize)]
pub struct SidecarResponse {
    pub ok: bool,
    pub data: Option<Value>,
    pub error: Option<String>,
}

fn extract_json_from_stdout(stdout: &str) -> Result<String, String> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Err("stdout が空です".into());
    }
    if serde_json::from_str::<Value>(trimmed).is_ok() {
        return Ok(trimmed.to_string());
    }
    for line in trimmed.lines().rev() {
        let line = line.trim();
        if line.starts_with('{')
            && line.ends_with('}')
            && serde_json::from_str::<Value>(line).is_ok()
        {
            return Ok(line.to_string());
        }
    }
    Err(format!(
        "stdout から JSON を抽出できませんでした（ログが混ざっている可能性があります）:\n{trimmed}"
    ))
}

pub fn parse_sidecar_stdout(stdout: &str, stderr: &str) -> Result<SidecarResponse, String> {
    let json_text = extract_json_from_stdout(stdout)?;
    let parsed: Value = serde_json::from_str(&json_text)
        .map_err(|e| format!("stdout JSON 解析失敗: {e}\n{json_text}"))?;

    let ok = parsed
        .get("ok")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if ok {
        Ok(SidecarResponse {
            ok: true,
            data: parsed.get("data").cloned(),
            error: None,
        })
    } else {
        let error = parsed
            .get("error")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                if stderr.is_empty() {
                    None
                } else {
                    Some(stderr.to_string())
                }
            })
            .unwrap_or_else(|| "Python サイドカーがエラーを返しました".into());

        Ok(SidecarResponse {
            ok: false,
            data: parsed.get("data").cloned(),
            error: Some(error),
        })
    }
}

fn resolve_python_for_request(app: &AppHandle, request: &SidecarRequest) -> Result<String, String> {
    if request.script_name == "whisperx_setup" {
        return Ok(resolve_python_executable());
    }
    let is_probe = request
        .payload
        .get("mode")
        .and_then(|v| v.as_str())
        == Some("probe");
    if is_probe {
        return resolve_whisperx_python(app).or_else(|_| Ok(resolve_python_executable()));
    }
    resolve_whisperx_python(app)
}

fn run_python_sidecar_sync(app: &AppHandle, request: &SidecarRequest) -> Result<SidecarResponse, String> {
    let python = resolve_python_for_request(app, request)?;
    let extra_env: Vec<(String, String)> = runtime_env_pairs(app)?;
    let env_refs: Vec<(&str, &str)> = extra_env
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();

    let output = run_python_script_with_executable(&python, &request.script_name, &request.payload, &env_refs)?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() && stdout.is_empty() {
        return Err(if stderr.is_empty() {
            format!("Python が終了コード {:?} で失敗", output.status.code())
        } else {
            stderr
        });
    }

    parse_sidecar_stdout(&stdout, &stderr)
}

/// Python サイドカーを起動（stdin JSON → stdout JSON）
#[tauri::command]
pub async fn run_python_sidecar(
    app: AppHandle,
    request: SidecarRequest,
) -> Result<SidecarResponse, String> {
    let request_clone = SidecarRequest {
        script_name: request.script_name.clone(),
        payload: request.payload.clone(),
    };

    tokio::task::spawn_blocking(move || run_python_sidecar_sync(&app, &request_clone))
        .await
        .map_err(|e| e.to_string())?
}
