use crate::commands::sidecar::parse_sidecar_stdout;
use crate::python_sidecar::{run_python_script_with_executable, python_dir};
use crate::runtime_bootstrap::{
    append_log, bundled_python_exe, ensure_bundled_ffmpeg, ensure_bundled_python, ffmpeg_exe,
    runtime_path_env,
};
use serde_json::json;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager};

fn default_device() -> String {
    "auto".into()
}

fn default_diarize_model() -> String {
    "pyannote/speaker-diarization-3.1".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhisperxConfigFile {
    #[serde(default)]
    pub hf_token: String,
    #[serde(default = "default_device")]
    pub device: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compute_type: Option<String>,
    #[serde(default = "default_diarize_model")]
    pub diarize_model: String,
}

impl Default for WhisperxConfigFile {
    fn default() -> Self {
        Self {
            hf_token: String::new(),
            device: default_device(),
            compute_type: None,
            diarize_model: default_diarize_model(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct WhisperxConfigResponse {
    pub device: String,
    pub compute_type: Option<String>,
    pub diarize_model: String,
    pub hf_token_configured: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct WhisperxRuntimeFile {
    python_executable: String,
    python_version: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct WhisperxSetupStatus {
    pub hf_token_configured: bool,
    pub python_executable: String,
    pub python_version: Option<String>,
    pub python_supported: bool,
    pub venv_ready: bool,
    pub ffmpeg_ready: bool,
    pub auto_bootstrap: bool,
    pub requirements_path: String,
}

#[derive(Debug, Serialize)]
pub struct WhisperxInstallResult {
    pub success: bool,
    pub log: String,
    pub error: Option<String>,
}

pub fn whisperx_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("whisperx"))
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(whisperx_data_dir(app)?.join("config.json"))
}

fn runtime_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(whisperx_data_dir(app)?.join("runtime.json"))
}

pub fn whisperx_venv_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("whisperx-venv"))
}

#[cfg(windows)]
fn venv_python_path(venv_dir: &Path) -> PathBuf {
    venv_dir.join("Scripts").join("python.exe")
}

#[cfg(not(windows))]
fn venv_python_path(venv_dir: &Path) -> PathBuf {
    venv_dir.join("bin").join("python")
}

fn save_runtime(app: &AppHandle, python_executable: &str, python_version: Option<&str>) -> Result<(), String> {
    let path = runtime_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let runtime = WhisperxRuntimeFile {
        python_executable: python_executable.to_string(),
        python_version: python_version.map(|s| s.to_string()),
    };
    let text = serde_json::to_string_pretty(&runtime).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

fn load_runtime(app: &AppHandle) -> Option<WhisperxRuntimeFile> {
    let path = runtime_path(app).ok()?;
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn python_version_label(exe: &str) -> Option<String> {
    let output = Command::new(exe)
        .args([
            "-c",
            "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let label = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if label.is_empty() {
        None
    } else {
        Some(label)
    }
}

fn version_supported(label: &str) -> bool {
    let mut parts = label.split('.');
    let major: u32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let minor: u32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    (major, minor) >= (3, 10) && (major, minor) < (3, 14)
}

pub fn runtime_env_pairs(app: &AppHandle) -> Result<Vec<(String, String)>, String> {
    let mut pairs = hf_token_env_pairs(app)?;
    if let Some(path) = runtime_path_env(app)? {
        pairs.push(("PATH".into(), path));
    }
    if let Ok(ff) = ffmpeg_exe(app) {
        if ff.exists() {
            pairs.push(("FFMPEG_PATH".into(), ff.to_string_lossy().into_owned()));
        }
    }
    Ok(pairs)
}

pub fn resolve_whisperx_python(app: &AppHandle) -> Result<String, String> {
    if let Some(runtime) = load_runtime(app) {
        let exe = runtime.python_executable;
        if Path::new(&exe).exists() {
            return Ok(exe);
        }
    }

    let venv_dir = whisperx_venv_dir(app)?;
    let venv_py = venv_python_path(&venv_dir);
    if venv_py.exists() {
        let exe = venv_py.to_string_lossy().into_owned();
        let ver = python_version_label(&exe);
        save_runtime(app, &exe, ver.as_deref())?;
        return Ok(exe);
    }

    Err(
        "WhisperX 用の環境がありません。「環境を自動セットアップ」を実行してください。"
            .into(),
    )
}

pub fn load_whisperx_config(app: &AppHandle) -> Result<WhisperxConfigFile, String> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(WhisperxConfigFile::default());
    }
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

fn save_whisperx_config_file(app: &AppHandle, config: &WhisperxConfigFile) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

pub fn load_hf_token(app: &AppHandle) -> Result<Option<String>, String> {
    let parsed = load_whisperx_config(app)?;
    let token = parsed.hf_token.trim().to_string();
    if token.is_empty() {
        Ok(None)
    } else {
        Ok(Some(token))
    }
}

pub fn hf_token_env_pairs(app: &AppHandle) -> Result<Vec<(String, String)>, String> {
    let Some(token) = load_hf_token(app)? else {
        return Ok(Vec::new());
    };
    Ok(vec![
        ("HF_TOKEN".into(), token.clone()),
        ("HUGGING_FACE_HUB_TOKEN".into(), token),
    ])
}

#[tauri::command]
pub fn get_whisperx_config(app: AppHandle) -> Result<WhisperxConfigResponse, String> {
    let config = load_whisperx_config(&app)?;
    Ok(WhisperxConfigResponse {
        device: config.device,
        compute_type: config.compute_type,
        diarize_model: config.diarize_model,
        hf_token_configured: load_hf_token(&app)?.is_some(),
    })
}

#[tauri::command]
pub fn save_whisperx_compute_settings(
    app: AppHandle,
    device: String,
    compute_type: Option<String>,
) -> Result<(), String> {
    let device = device.trim().to_lowercase();
    if !["auto", "cuda", "cpu"].contains(&device.as_str()) {
        return Err("device は auto / cuda / cpu のいずれかです".into());
    }
    let mut config = load_whisperx_config(&app)?;
    config.device = device;
    config.compute_type = compute_type.filter(|s| !s.trim().is_empty());
    save_whisperx_config_file(&app, &config)
}

fn write_hf_token(app: &AppHandle, token: &str) -> Result<(), String> {
    let mut config = load_whisperx_config(app)?;
    config.hf_token = token.to_string();
    save_whisperx_config_file(app, &config)
}

#[tauri::command]
pub fn get_whisperx_setup_status(app: AppHandle) -> Result<WhisperxSetupStatus, String> {
    let requirements_path = python_dir()
        .join("requirements.txt")
        .display()
        .to_string();

    let venv_dir = whisperx_venv_dir(&app)?;
    let venv_py = venv_python_path(&venv_dir);
    let venv_ready = venv_py.exists();

    let ffmpeg_ready = ffmpeg_exe(&app).map(|p| p.exists()).unwrap_or(false);

    let (python_executable, python_version, python_supported) =
        match resolve_whisperx_python(&app) {
            Ok(exe) => {
                let ver = python_version_label(&exe);
                let supported = ver.as_deref().map(version_supported).unwrap_or(true);
                (exe, ver, supported)
            }
            Err(_) => {
                let bundled = bundled_python_exe(&app)
                    .unwrap_or_else(|_| PathBuf::from("（未セットアップ）"));
                (
                    bundled.to_string_lossy().into_owned(),
                    Some("3.12".into()),
                    true,
                )
            }
        };

    Ok(WhisperxSetupStatus {
        hf_token_configured: load_hf_token(&app)?.is_some(),
        python_executable,
        python_version,
        python_supported,
        venv_ready,
        ffmpeg_ready,
        auto_bootstrap: cfg!(windows),
        requirements_path,
    })
}

#[tauri::command]
pub fn save_whisperx_hf_token(app: AppHandle, token: String) -> Result<(), String> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return Err("トークンが空です".into());
    }
    if !trimmed.starts_with("hf_") {
        return Err("Hugging Face のトークンは通常 hf_ で始まります".into());
    }
    write_hf_token(&app, trimmed)
}

#[tauri::command]
pub fn clear_whisperx_hf_token(app: AppHandle) -> Result<(), String> {
    let path = config_path(&app)?;
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn install_whisperx_packages(app: AppHandle) -> Result<WhisperxInstallResult, String> {
    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || install_sync(&app_clone))
        .await
        .map_err(|e| e.to_string())?
}

fn invalidate_environment_probe_cache(app: &AppHandle) -> Result<(), String> {
    let dir = whisperx_data_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp_path = dir.join("probe_stamp");
    let current = fs::read_to_string(&stamp_path)
        .ok()
        .and_then(|s| s.trim().parse::<u64>().ok())
        .unwrap_or(0);
    fs::write(stamp_path, (current + 1).to_string()).map_err(|e| e.to_string())?;
    let cache_path = dir.join("probe_cache.json");
    if cache_path.exists() {
        fs::remove_file(cache_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn install_sync(app: &AppHandle) -> Result<WhisperxInstallResult, String> {
    let mut log = String::new();
    append_log(
        &mut log,
        "自動セットアップを開始します（Python 3.12 / ffmpeg / venv / Whisper + NeMo）。",
    );
    append_log(
        &mut log,
        "すべてアプリ専用フォルダ内で完結し、システムの Python や PATH は変更しません。",
    );

    let requirements = python_dir().join("requirements.txt");
    if !requirements.exists() {
        return Ok(WhisperxInstallResult {
            success: false,
            log,
            error: Some("requirements.txt が見つかりません".into()),
        });
    }

    let base_python = match ensure_bundled_python(app, &mut log) {
        Ok(p) => p,
        Err(e) => {
            return Ok(WhisperxInstallResult {
                success: false,
                log,
                error: Some(e),
            });
        }
    };
    if let Err(e) = ensure_bundled_ffmpeg(app, &mut log) {
        append_log(&mut log, &format!("ffmpeg 警告: {e}"));
    }

    let venv_dir = whisperx_venv_dir(app)?;
    let base_exe = base_python.to_string_lossy().into_owned();
    append_log(&mut log, &format!("pip インストール用 Python: {base_exe}"));

    let payload = json!({
        "mode": "install",
        "venv_dir": venv_dir.to_string_lossy(),
        "python_executable": base_exe,
    });

    let extra = runtime_env_pairs(app)?;
    let extra_refs: Vec<(&str, &str)> = extra
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();

    let output = match run_python_script_with_executable(
        &base_exe,
        "whisperx_setup",
        &payload,
        &extra_refs,
    ) {
        Ok(o) => o,
        Err(e) => {
            return Ok(WhisperxInstallResult {
                success: false,
                log,
                error: Some(e),
            });
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !stdout.trim().is_empty() {
        append_log(&mut log, &stdout);
    }
    if !stderr.trim().is_empty() {
        append_log(&mut log, &stderr);
    }

    let parsed = match parse_sidecar_stdout(stdout.trim(), stderr.trim()) {
        Ok(p) => p,
        Err(e) => {
            return Ok(WhisperxInstallResult {
                success: false,
                log: tail_log(&log),
                error: Some(e),
            });
        }
    };

    if !parsed.ok {
        return Ok(WhisperxInstallResult {
            success: false,
            log: tail_log(&log),
            error: parsed
                .error
                .or_else(|| Some("依存パッケージのインストールに失敗しました".into())),
        });
    }

    let data = parsed.data.unwrap_or(json!({}));
    if let Some(exe) = data.get("python_executable").and_then(|v| v.as_str()) {
        let ver = data
            .get("python_version")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| python_version_label(exe));
        save_runtime(app, exe, ver.as_deref())?;
        append_log(&mut log, &format!("venv Python を登録: {exe}"));
    }

    if nvidia_gpu_detected() {
        append_log(
            &mut log,
            "NVIDIA GPU を検出しました。venv に GPU 版 PyTorch を入れます…",
        );
        match install_pytorch_cuda_sync(app) {
            Ok(gpu_result) => {
                append_log(&mut log, &gpu_result.log);
                if let Some(err) = gpu_result.error {
                    append_log(&mut log, &format!("GPU PyTorch: {err}"));
                }
            }
            Err(e) => append_log(&mut log, &format!("GPU PyTorch スキップ: {e}")),
        }
    }

    let _ = invalidate_environment_probe_cache(app);

    Ok(WhisperxInstallResult {
        success: true,
        log: tail_log(&log),
        error: None,
    })
}

fn tail_log(log: &str) -> String {
    if log.len() > 16000 {
        log[log.len() - 16000..].to_string()
    } else {
        log.to_string()
    }
}

#[tauri::command]
pub async fn install_pytorch_cuda(app: AppHandle) -> Result<WhisperxInstallResult, String> {
    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || install_pytorch_cuda_sync(&app_clone))
        .await
        .map_err(|e| e.to_string())?
}

fn pip_output_to_log(log: &mut String, output: &std::process::Output) {
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !stdout.is_empty() {
        append_log(log, &stdout);
    }
    if !stderr.is_empty() {
        append_log(log, &stderr);
    }
}

fn nvidia_gpu_detected() -> bool {
    Command::new("nvidia-smi")
        .args(["--query-gpu=name", "--format=csv,noheader"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

const VERIFY_CUDA_PY: &str = r#"
import json, sys
try:
    import torch
    out = {
        "torch_version": torch.__version__,
        "cuda_available": bool(torch.cuda.is_available()),
        "cuda_works": False,
        "device_name": None,
        "error": None,
    }
    if out["cuda_available"]:
        out["device_name"] = torch.cuda.get_device_name(0)
        torch.zeros(1, device="cuda")
        out["cuda_works"] = True
    print(json.dumps(out))
except Exception as e:
    print(json.dumps({"error": str(e), "cuda_works": False}))
    sys.exit(1)
"#;

fn verify_cuda_in_venv(python: &str, log: &mut String) -> Result<bool, String> {
    let output = Command::new(python)
        .args(["-c", VERIFY_CUDA_PY])
        .output()
        .map_err(|e| format!("CUDA 検証の起動に失敗: {e}"))?;
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    append_log(log, &format!("CUDA 検証: {text}"));
    if !output.status.success() {
        return Ok(false);
    }
    let parsed: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("検証 JSON 解析失敗: {e}"))?;
    Ok(parsed
        .get("cuda_works")
        .and_then(|v| v.as_bool())
        .unwrap_or(false))
}

fn install_pytorch_cuda_sync(app: &AppHandle) -> Result<WhisperxInstallResult, String> {
    let python = resolve_whisperx_python(app)?;
    let mut log = String::new();
    append_log(
        &mut log,
        "venv の PyTorch を GPU 版に差し替えます（CUDA 12.8 nightly / cu128）。",
    );
    append_log(
        &mut log,
        "RTX 50 シリーズ (Blackwell) は cu124 では動きません。数 GB のダウンロードがあります。",
    );

    let uninstall = Command::new(&python)
        .args([
            "-m",
            "pip",
            "uninstall",
            "-y",
            "torch",
            "torchaudio",
            "torchvision",
        ])
        .output()
        .map_err(|e| format!("pip uninstall の起動に失敗: {e}"))?;
    pip_output_to_log(&mut log, &uninstall);

    let install = Command::new(&python)
        .args([
            "-m",
            "pip",
            "install",
            "--pre",
            "torch",
            "torchaudio",
            "torchvision",
            "--index-url",
            "https://download.pytorch.org/whl/nightly/cu128",
        ])
        .output()
        .map_err(|e| format!("pip install の起動に失敗: {e}"))?;
    pip_output_to_log(&mut log, &install);

    if !install.status.success() {
        return Ok(WhisperxInstallResult {
            success: false,
            log,
            error: Some(format!(
                "pip install が終了コード {:?} で失敗しました",
                install.status.code()
            )),
        });
    }

    match verify_cuda_in_venv(&python, &mut log) {
        Ok(true) => {
            append_log(
                &mut log,
                "PyTorch (GPU版) のインストールと CUDA 動作確認が完了しました。「環境を再確認」を押してください。",
            );
            let _ = invalidate_environment_probe_cache(app);
            Ok(WhisperxInstallResult {
                success: true,
                log,
                error: None,
            })
        }
        Ok(false) => Ok(WhisperxInstallResult {
            success: false,
            log,
            error: Some(
                "PyTorch は入りましたが GPU での演算テストに失敗しました。ドライバを更新するか、ログを確認してください。"
                    .into(),
            ),
        }),
        Err(e) => Ok(WhisperxInstallResult {
            success: false,
            log,
            error: Some(e),
        }),
    }
}
