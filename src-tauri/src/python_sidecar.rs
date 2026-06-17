use serde_json::Value;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};

pub fn resolve_python_executable() -> String {
    if Command::new("python")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        return "python".into();
    }
    "python3".into()
}

pub fn python_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../python")
}

pub fn python_script_path(script_name: &str) -> Result<PathBuf, String> {
    let file_name = match script_name {
        "whisperx_runner" | "whisper_diarization_runner" => {
            "whisper_diarization_runner.py"
        }
        "whisperx_setup" => "whisperx_setup.py",
        other => return Err(format!("未知のスクリプト: {other}")),
    };

    let script_path = python_dir().join(file_name);
    if !script_path.exists() {
        return Err(format!(
            "Python スクリプトが見つかりません: {}",
            script_path.display()
        ));
    }
    Ok(script_path)
}

pub fn run_python_script_with_executable(
    python_executable: &str,
    script_name: &str,
    payload: &Value,
    extra_env: &[(&str, &str)],
) -> Result<Output, String> {
    let script_path = python_script_path(script_name)?;
    let payload_str = serde_json::to_string(payload).map_err(|e| e.to_string())?;

    let mut command = Command::new(python_executable);
    command
        .arg(script_path)
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    for (key, value) in extra_env {
        command.env(key, value);
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("Python の起動に失敗 ({python_executable}): {e}"))?;

    {
        let stdin = child.stdin.as_mut().ok_or("stdin を開けませんでした")?;
        stdin
            .write_all(payload_str.as_bytes())
            .map_err(|e| e.to_string())?;
    }

    child
        .wait_with_output()
        .map_err(|e| format!("Python プロセスの待機に失敗: {e}"))
}

pub fn run_python_script(
    script_name: &str,
    payload: &Value,
    extra_env: &[(&str, &str)],
) -> Result<Output, String> {
    let python = resolve_python_executable();
    run_python_script_with_executable(&python, script_name, payload, extra_env)
}
