use crate::commands::sidecar::{parse_sidecar_stdout, SidecarResponse};
use crate::commands::whisperx_setup::{
    resolve_whisperx_python, runtime_env_pairs, whisperx_data_dir,
};
use crate::python_sidecar::python_script_path;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use tauri::{AppHandle, Emitter};

const CACHE_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperxProbeProgressEvent {
    pub stage: String,
    pub label: String,
    pub ratio: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProbeCacheFile {
    version: u32,
    python_executable: String,
    probe_stamp: u64,
    light_fingerprint: LightFingerprint,
    environment: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct LightFingerprint {
    ready: bool,
    whisperx_available: bool,
    ffmpeg_available: bool,
    python_executable: String,
    python_version: String,
}

fn probe_stamp_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(whisperx_data_dir(app)?.join("probe_stamp"))
}

fn probe_cache_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(whisperx_data_dir(app)?.join("probe_cache.json"))
}

pub fn read_probe_stamp(app: &AppHandle) -> u64 {
    let Ok(path) = probe_stamp_path(app) else {
        return 0;
    };
    let Ok(text) = fs::read_to_string(path) else {
        return 0;
    };
    text.trim().parse().unwrap_or(0)
}

fn load_probe_cache(app: &AppHandle) -> Option<ProbeCacheFile> {
    let path = probe_cache_path(app).ok()?;
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn save_probe_cache(
    app: &AppHandle,
    python_executable: &str,
    light: &LightFingerprint,
    environment: &Value,
) -> Result<(), String> {
    let path = probe_cache_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let cache = ProbeCacheFile {
        version: CACHE_VERSION,
        python_executable: python_executable.to_string(),
        probe_stamp: read_probe_stamp(app),
        light_fingerprint: light.clone(),
        environment: environment.clone(),
    };
    let text = serde_json::to_string_pretty(&cache).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

fn light_fingerprint_from_value(data: &Value) -> Option<LightFingerprint> {
    Some(LightFingerprint {
        ready: data.get("ready")?.as_bool()?,
        whisperx_available: data.get("whisperx_available")?.as_bool()?,
        ffmpeg_available: data.get("ffmpeg_available")?.as_bool()?,
        python_executable: data
            .get("python_executable")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        python_version: data
            .get("python_version")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

fn merge_light_with_cached_full(light: &Value, cached_env: &Value) -> Value {
    let mut merged = cached_env.clone();
    if let Some(obj) = merged.as_object_mut() {
        for key in [
            "ready",
            "whisperx_available",
            "ffmpeg_available",
            "python_version",
            "python_supported",
            "python_executable",
            "messages",
        ] {
            if let Some(v) = light.get(key) {
                obj.insert(key.to_string(), v.clone());
            }
        }
    }
    merged
}

fn cache_is_valid(
    cache: &ProbeCacheFile,
    python_executable: &str,
    stamp: u64,
    light: &LightFingerprint,
) -> bool {
    cache.version == CACHE_VERSION
        && cache.python_executable == python_executable
        && cache.probe_stamp == stamp
        && cache.light_fingerprint == *light
}

fn emit_probe_progress(app: &AppHandle, stage: &str, label: &str, ratio: f64) {
    let payload = WhisperxProbeProgressEvent {
        stage: stage.to_string(),
        label: label.to_string(),
        ratio: ratio.clamp(0.0, 1.0),
    };
    let _ = app.emit("whisperx-probe-progress", payload);
}

fn resolve_python_for_probe(app: &AppHandle) -> Result<String, String> {
    resolve_whisperx_python(app).or_else(|_| {
        Ok(crate::python_sidecar::resolve_python_executable())
    })
}

fn run_probe_subprocess(
    app: &AppHandle,
    python: &str,
    depth: &str,
    emit_events: bool,
) -> Result<SidecarResponse, String> {
    let script_path = python_script_path("whisper_diarization_runner")?;
    let payload = json!({ "mode": "probe", "depth": depth });
    let payload_str = serde_json::to_string(&payload).map_err(|e| e.to_string())?;

    let extra_env = runtime_env_pairs(app)?;
    let mut command = Command::new(python);
    command
        .arg(script_path)
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    for (k, v) in &extra_env {
        command.env(k, v);
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("環境チェック用 Python の起動に失敗 ({python}): {e}"))?;

    {
        let stdin = child.stdin.as_mut().ok_or("stdin を開けませんでした")?;
        stdin
            .write_all(payload_str.as_bytes())
            .map_err(|e| e.to_string())?;
    }

    let stderr = child.stderr.take().ok_or("stderr を開けませんでした")?;
    let (tx, rx) = mpsc::channel::<(String, String, f64)>();
    let tx_reader = tx.clone();
    let reader = std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().flatten() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let Ok(parsed) = serde_json::from_str::<Value>(line) else {
                continue;
            };
            if parsed.get("progress").and_then(|v| v.as_bool()) != Some(true) {
                continue;
            }
            let stage = parsed
                .get("stage")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let label = parsed
                .get("label")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let ratio = parsed
                .get("ratio")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            let _ = tx_reader.send((stage, label, ratio));
        }
    });

    let app_emit = app.clone();
    let emitter = std::thread::spawn(move || {
        while let Ok((stage, label, ratio)) = rx.recv() {
            if emit_events {
                emit_probe_progress(&app_emit, &stage, &label, ratio);
            }
        }
    });

    if emit_events {
        emit_probe_progress(
            app,
            "probe_start",
            if depth == "light" {
                "基本環境を確認中"
            } else {
                "文字起こし環境を確認中"
            },
            0.02,
        );
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("環境チェック Python の待機に失敗: {e}"))?;

    drop(tx);
    let _ = reader.join();
    let _ = emitter.join();

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr_text = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() && stdout.is_empty() {
        return Err(if stderr_text.is_empty() {
            format!(
                "環境チェックが終了コード {:?} で失敗",
                output.status.code()
            )
        } else {
            stderr_text
        });
    }

    parse_sidecar_stdout(&stdout, &stderr_text)
}

fn probe_sync(app: &AppHandle, force: bool) -> Result<Value, String> {
    let python = resolve_python_for_probe(app)?;
    let stamp = read_probe_stamp(app);

    emit_probe_progress(app, "probe_light", "基本環境を確認中", 0.05);
    let light_response = run_probe_subprocess(app, &python, "light", true)?;
    if !light_response.ok {
        return Err(
            light_response
                .error
                .unwrap_or_else(|| "基本環境チェックに失敗しました".into()),
        );
    }
    let light_data = light_response
        .data
        .ok_or("基本環境チェックの結果が空です")?;
    let light_fp = light_fingerprint_from_value(&light_data)
        .ok_or("基本環境チェック結果の形式が不正です")?;

    if !force {
        if let Some(cache) = load_probe_cache(app) {
            if cache_is_valid(&cache, &python, stamp, &light_fp) {
                emit_probe_progress(app, "probe_cache", "保存済みの GPU 情報を適用中", 0.92);
                let merged = merge_light_with_cached_full(&light_data, &cache.environment);
                emit_probe_progress(app, "probe_done", "確認完了", 1.0);
                return Ok(merged);
            }
        }
    }

    emit_probe_progress(app, "probe_full", "PyTorch / CUDA を詳細確認中", 0.55);
    let full_response = run_probe_subprocess(app, &python, "full", true)?;
    if !full_response.ok {
        return Err(
            full_response
                .error
                .unwrap_or_else(|| "詳細環境チェックに失敗しました".into()),
        );
    }
    let full_data = full_response
        .data
        .ok_or("詳細環境チェックの結果が空です")?;

    if let Some(fp) = light_fingerprint_from_value(&light_data) {
        let _ = save_probe_cache(app, &python, &fp, &full_data);
    }

    emit_probe_progress(app, "probe_done", "確認完了", 1.0);
    Ok(full_data)
}

/// 文字起こし環境を確認（軽量チェック毎回 + 詳細はキャッシュ利用）
#[tauri::command]
pub async fn probe_whisperx_environment(
    app: AppHandle,
    force: Option<bool>,
) -> Result<SidecarResponse, String> {
    let force = force.unwrap_or(false);
    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || {
        match probe_sync(&app_clone, force) {
            Ok(data) => Ok(SidecarResponse {
                ok: true,
                data: Some(data),
                error: None,
            }),
            Err(error) => Ok(SidecarResponse {
                ok: false,
                data: None,
                error: Some(error),
            }),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
