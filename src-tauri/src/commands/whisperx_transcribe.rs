use crate::commands::sidecar::{parse_sidecar_stdout, SidecarResponse};
use crate::commands::whisperx_setup::{load_whisperx_config, resolve_whisperx_python, runtime_env_pairs};
use crate::python_sidecar::python_script_path;
use serde::Serialize;
use serde_json::Value;
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperxProgressEvent {
    pub stage: String,
    pub label: String,
    pub ratio: f64,
}

fn stage_label(stage: &str) -> String {
    match stage {
        "load_model" => "Whisper モデル読み込み",
        "load_audio" => "音声読み込み",
        "stem" => "ボーカル分離",
        "transcribe" => "文字起こし",
        "align" => "単語アライメント",
        "diarize" => "話者分離",
        "assign_speakers" => "話者ID付与",
        "done" => "完了",
        _ => stage,
    }
    .to_string()
}

fn emit_progress(app: &AppHandle, stage: &str, ratio: f64) {
    let payload = WhisperxProgressEvent {
        stage: stage.to_string(),
        label: stage_label(stage),
        ratio: ratio.clamp(0.0, 1.0),
    };
    let _ = app.emit("whisperx-progress", payload);
}

fn run_whisperx_sync(app: &AppHandle, payload: Value) -> Result<SidecarResponse, String> {
    let python = resolve_whisperx_python(app)?;
    let script_path = python_script_path("whisper_diarization_runner")?;
    let payload_str = serde_json::to_string(&payload).map_err(|e| e.to_string())?;

    let config = load_whisperx_config(app)?;
    let mut extra_env = runtime_env_pairs(app)?;
    extra_env.push(("WHISPERX_DEVICE".into(), config.device.clone()));
    if let Some(ct) = &config.compute_type {
        extra_env.push(("WHISPERX_COMPUTE_TYPE".into(), ct.clone()));
    }
    let mut command = Command::new(&python);
    command
        .arg(&script_path)
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    for (k, v) in &extra_env {
        command.env(k, v);
    }

    if let Ok(path) = crate::runtime_bootstrap::runtime_path_env(app) {
        if let Some(p) = path {
            command.env("PATH", p);
        }
    }
    if let Ok(ff) = crate::runtime_bootstrap::ffmpeg_exe(app) {
        if ff.exists() {
            command.env("FFMPEG_PATH", ff);
        }
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("文字起こしプロセスの起動に失敗: {e}"))?;

    {
        let stdin = child.stdin.as_mut().ok_or("stdin を開けませんでした")?;
        stdin
            .write_all(payload_str.as_bytes())
            .map_err(|e| e.to_string())?;
    }

    let stderr = child.stderr.take().ok_or("stderr を開けませんでした")?;
    let (tx, rx) = mpsc::channel::<(String, f64)>();
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
            let ratio = parsed
                .get("ratio")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            let _ = tx_reader.send((stage.clone(), ratio));
        }
    });

    let app_emit = app.clone();
    let emitter = std::thread::spawn(move || {
        while let Ok((stage, ratio)) = rx.recv() {
            emit_progress(&app_emit, &stage, ratio);
        }
    });

    emit_progress(app, "load_model", 0.02);

    let output = child
        .wait_with_output()
        .map_err(|e| format!("文字起こしプロセスの待機に失敗: {e}"))?;

    drop(tx);
    let _ = reader.join();
    let _ = emitter.join();

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if output.status.success() || !stdout.is_empty() {
        let result = parse_sidecar_stdout(&stdout, &stderr)?;
        if result.ok {
            emit_progress(app, "done", 1.0);
        }
        return Ok(result);
    }

    Err(if stderr.is_empty() {
        format!(
            "文字起こしが終了コード {:?} で失敗",
            output.status.code()
        )
    } else {
        stderr.to_string()
    })
}

/// WhisperX 文字起こし（stderr 進捗を whisperx-progress イベントで配信）
#[tauri::command]
pub async fn run_whisperx_transcription(
    app: AppHandle,
    payload: Value,
) -> Result<SidecarResponse, String> {
    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || run_whisperx_sync(&app_clone, payload))
        .await
        .map_err(|e| e.to_string())?
}
