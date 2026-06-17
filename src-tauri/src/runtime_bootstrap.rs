//! WhisperX 用ランタイム（Python 3.12 / ffmpeg）をアプリデータ配下へ自動取得。
//! システムの PATH や既存 Python には触れない。

use std::fs::{self, File};
use std::io::copy;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager};
use zip::ZipArchive;

const PYTHON_VERSION: &str = "3.12.8";
/// MSI インストーラは既存 Python があると 1638 になるため、ポータブル同梱版を使用
const PYTHON_STANDALONE_URL: &str = "https://github.com/astral-sh/python-build-standalone/releases/download/20241206/cpython-3.12.8%2B20241206-x86_64-pc-windows-msvc-install_only.tar.gz";
const GET_PIP_URL: &str = "https://bootstrap.pypa.io/get-pip.py";
const FFMPEG_ZIP_URL: &str =
    "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";

pub fn runtime_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("runtime"))
}

fn downloads_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = runtime_root(app)?.join("downloads");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn bundled_python_home(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_root(app)?.join(format!("python-{PYTHON_VERSION}")))
}

pub fn bundled_python_exe(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(bundled_python_home(app)?.join("python.exe"))
}

pub fn ffmpeg_bin_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_root(app)?.join("ffmpeg").join("bin"))
}

pub fn ffmpeg_exe(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(ffmpeg_bin_dir(app)?.join("ffmpeg.exe"))
}

pub fn runtime_path_env(app: &AppHandle) -> Result<Option<String>, String> {
    let bin = ffmpeg_bin_dir(app)?;
    if !bin.join("ffmpeg.exe").exists() {
        return Ok(None);
    }
    let current = std::env::var("PATH").unwrap_or_default();
    Ok(Some(format!("{};{}", bin.display(), current)))
}

pub fn append_log(log: &mut String, line: &str) {
    log.push_str(line);
    log.push('\n');
}

fn download_file(url: &str, dest: &Path, log: &mut String) -> Result<(), String> {
    if dest.exists() {
        let _ = fs::remove_file(dest);
    }
    append_log(log, &format!("ダウンロード中: {url}"));
    let mut response = reqwest::blocking::get(url).map_err(|e| format!("ダウンロード失敗: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "ダウンロード失敗 (HTTP {}): {url}",
            response.status()
        ));
    }
    let mut out = File::create(dest).map_err(|e| e.to_string())?;
    copy(&mut response, &mut out).map_err(|e| e.to_string())?;
    append_log(log, &format!("保存: {}", dest.display()));
    Ok(())
}

fn extract_zip_to_dir(zip_path: &Path, dest: &Path, log: &mut String) -> Result<(), String> {
    if dest.exists() {
        fs::remove_dir_all(dest).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;

    let file = File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let rel = entry.name().replace('\\', "/");
        if rel.contains("..") {
            continue;
        }
        let is_dir = entry.is_dir() || rel.ends_with('/');
        let out_path = dest.join(&rel);
        if is_dir {
            fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut outfile = File::create(&out_path).map_err(|e| e.to_string())?;
        copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;
    }

    append_log(log, &format!("展開: {}", dest.display()));
    Ok(())
}

#[cfg(windows)]
fn python_dev_headers_ready(home: &Path) -> bool {
    home.join("include").join("Python.h").exists()
}

#[cfg(windows)]
fn pip_ready(python: &Path) -> bool {
    Command::new(python)
        .args(["-m", "pip", "--version"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(windows)]
fn find_portable_python_root(dir: &Path) -> Option<PathBuf> {
    let direct = dir.join("python.exe");
    if direct.exists() && dir.join("include").join("Python.h").exists() {
        return Some(dir.to_path_buf());
    }
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if path.join("python.exe").exists() && path.join("include").join("Python.h").exists() {
            return Some(path);
        }
    }
    None
}

#[cfg(windows)]
fn copy_dir_all(src: &Path, dst: &Path, log: &mut String) -> Result<(), String> {
    if !src.is_dir() {
        return Err(format!("コピー元がディレクトリではありません: {}", src.display()));
    }
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&from, &to, log)?;
        } else {
            fs::copy(&from, &to).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(windows)]
fn install_portable_python_windows(
    app: &AppHandle,
    home: &Path,
    log: &mut String,
) -> Result<(), String> {
    let tar_path = downloads_dir(app)?.join("python-3.12.8-standalone.tar.gz");
    download_file(PYTHON_STANDALONE_URL, &tar_path, log)?;

    if home.exists() {
        append_log(log, "既存の Python フォルダを削除して再配置します…");
        fs::remove_dir_all(home).map_err(|e| e.to_string())?;
    }

    let staging = runtime_root(app)?.join("python-3.12.8-staging");
    if staging.exists() {
        fs::remove_dir_all(&staging).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&staging).map_err(|e| e.to_string())?;

    append_log(
        log,
        "Python 3.12 ポータブル版を展開中（開発ヘッダ付き・レジストリ不要）…",
    );

    let tar_status = Command::new("tar")
        .args([
            "-xzf",
            &tar_path.to_string_lossy(),
            "-C",
            &staging.to_string_lossy(),
        ])
        .status()
        .map_err(|e| {
            format!(
                "tar コマンドの起動に失敗: {e}（Windows 10 以降では tar が標準搭載されています）"
            )
        })?;

    if !tar_status.success() {
        return Err(format!(
            "Python アーカイブの展開に失敗しました (exit {:?})",
            tar_status.code()
        ));
    }

    let root = find_portable_python_root(&staging).ok_or_else(|| {
        format!(
            "展開後に python.exe / include/Python.h が見つかりません: {}",
            staging.display()
        )
    })?;

    append_log(log, &format!("Python ルート: {}", root.display()));
    fs::create_dir_all(home).map_err(|e| e.to_string())?;
    copy_dir_all(&root, home, log)?;
    let _ = fs::remove_dir_all(&staging);

    Ok(())
}

#[cfg(windows)]
pub fn ensure_bundled_python(app: &AppHandle, log: &mut String) -> Result<PathBuf, String> {
    let home = bundled_python_home(app)?;
    let exe = home.join("python.exe");

    if exe.exists() && pip_ready(&exe) && python_dev_headers_ready(&home) {
        append_log(log, &format!("Python 3.12（同梱・開発ヘッダ付き）: {}", exe.display()));
        return Ok(exe);
    }

    if home.exists() && (!exe.exists() || !python_dev_headers_ready(&home)) {
        append_log(
            log,
            "埋め込み版または不完全な Python を検出しました。フル版に置き換えます…",
        );
    }

    install_portable_python_windows(app, &home, log)?;

    if !exe.exists() {
        return Err(format!(
            "Python のインストール後に python.exe が見つかりません: {}",
            exe.display()
        ));
    }

    if !python_dev_headers_ready(&home) {
        return Err(
            "Python.h（開発ヘッダ）が見つかりません。ctc-forced-aligner のビルドに必要です。"
                .into(),
        );
    }

    if !pip_ready(&exe) {
        append_log(log, "pip が無いため get-pip.py で導入します…");
        let get_pip = downloads_dir(app)?.join("get-pip.py");
        download_file(GET_PIP_URL, &get_pip, log)?;
        let status = Command::new(&exe)
            .arg(&get_pip)
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() || !pip_ready(&exe) {
            return Err("pip のセットアップに失敗しました。".into());
        }
    }

    append_log(log, "Python 3.12 ポータブル版の配置が完了しました（include/Python.h を確認済み）。");
    Ok(exe)
}

#[cfg(not(windows))]
pub fn ensure_bundled_python(_app: &AppHandle, log: &mut String) -> Result<PathBuf, String> {
    append_log(log, "自動 Python 取得は Windows 版のみ対応しています。");
    Err("Windows 以外では手動で Python 3.12 を用意してください".into())
}

fn extract_ffmpeg_from_zip(zip_path: &Path, bin_dir: &Path, log: &mut String) -> Result<(), String> {
    fs::create_dir_all(bin_dir).map_err(|e| e.to_string())?;
    let file = File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut extracted = 0u32;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().replace('\\', "/");
        let file_name = name.rsplit('/').next().unwrap_or("");
        if file_name != "ffmpeg.exe" && file_name != "ffprobe.exe" {
            continue;
        }
        let out_path = bin_dir.join(file_name);
        let mut out = File::create(&out_path).map_err(|e| e.to_string())?;
        copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        extracted += 1;
    }

    if extracted == 0 {
        return Err("ffmpeg の ZIP 内に ffmpeg.exe が見つかりませんでした".into());
    }
    append_log(log, &format!("ffmpeg を配置: {}", bin_dir.display()));
    Ok(())
}

#[cfg(windows)]
pub fn ensure_bundled_ffmpeg(app: &AppHandle, log: &mut String) -> Result<PathBuf, String> {
    let bin_dir = ffmpeg_bin_dir(app)?;
    let ffmpeg = bin_dir.join("ffmpeg.exe");
    if ffmpeg.exists() {
        append_log(log, &format!("ffmpeg（同梱）: {}", ffmpeg.display()));
        return Ok(bin_dir);
    }

    let zip_path = downloads_dir(app)?.join("ffmpeg-win64.zip");
    download_file(FFMPEG_ZIP_URL, &zip_path, log)?;
    append_log(log, "ffmpeg を展開中…");
    extract_ffmpeg_from_zip(&zip_path, &bin_dir, log)?;

    if !ffmpeg.exists() {
        return Err("ffmpeg.exe の配置に失敗しました".into());
    }
    Ok(bin_dir)
}

#[cfg(not(windows))]
pub fn ensure_bundled_ffmpeg(_app: &AppHandle, log: &mut String) -> Result<PathBuf, String> {
    append_log(log, "自動 ffmpeg 取得は Windows 版のみ対応しています。");
    Err("Windows 以外では ffmpeg を PATH に追加してください".into())
}

pub fn run_with_runtime_env(
    app: &AppHandle,
    program: &Path,
    args: &[&str],
    extra_env: &[(&str, &str)],
    log: &mut String,
) -> Result<(), String> {
    let mut command = Command::new(program);
    command.args(args);
    if let Some(path) = runtime_path_env(app)? {
        command.env("PATH", path);
    }
    if let Ok(ffmpeg) = ffmpeg_exe(app) {
        command.env("FFMPEG_PATH", ffmpeg);
    }
    for (k, v) in extra_env {
        command.env(k, v);
    }
    append_log(log, &format!("実行: {} {}", program.display(), args.join(" ")));
    let output = command
        .output()
        .map_err(|e| format!("コマンド起動失敗: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !stdout.trim().is_empty() {
        append_log(log, &stdout);
    }
    if !stderr.trim().is_empty() {
        append_log(log, &stderr);
    }
    if !output.status.success() {
        return Err(format!(
            "コマンド失敗 (exit {:?}): {}",
            output.status.code(),
            program.display()
        ));
    }
    Ok(())
}

#[cfg(windows)]
fn create_venv_windows(
    app: &AppHandle,
    base_python: &Path,
    venv_dir: &Path,
    extra_env: &[(&str, &str)],
    log: &mut String,
) -> Result<(), String> {
    if venv_dir.exists() {
        fs::remove_dir_all(venv_dir).map_err(|e| e.to_string())?;
    }

    append_log(log, "専用 venv を作成中…");
    let venv_ok = run_with_runtime_env(
        app,
        base_python,
        &["-m", "venv", &venv_dir.to_string_lossy()],
        extra_env,
        log,
    );

    if venv_ok.is_ok() && venv_dir.join("Scripts").join("python.exe").exists() {
        return Ok(());
    }

    append_log(log, "venv が使えないため virtualenv で作成します…");
    run_with_runtime_env(
        app,
        base_python,
        &["-m", "pip", "install", "virtualenv"],
        extra_env,
        log,
    )?;
    run_with_runtime_env(
        app,
        base_python,
        &["-m", "virtualenv", &venv_dir.to_string_lossy()],
        extra_env,
        log,
    )
}

pub fn create_venv_and_install_whisperx(
    app: &AppHandle,
    venv_dir: &Path,
    requirements: &Path,
    extra_env: &[(&str, &str)],
    log: &mut String,
) -> Result<PathBuf, String> {
    let base_python = ensure_bundled_python(app, log)?;
    let _ffmpeg = ensure_bundled_ffmpeg(app, log)?;

    #[cfg(windows)]
    {
        create_venv_windows(app, &base_python, venv_dir, extra_env, log)?;
    }

    #[cfg(not(windows))]
    {
        if venv_dir.exists() {
            fs::remove_dir_all(venv_dir).map_err(|e| e.to_string())?;
        }
        append_log(log, "専用 venv を作成中…");
        run_with_runtime_env(
            app,
            &base_python,
            &["-m", "venv", &venv_dir.to_string_lossy()],
            extra_env,
            log,
        )?;
    }

    #[cfg(windows)]
    let venv_python = venv_dir.join("Scripts").join("python.exe");
    #[cfg(not(windows))]
    let venv_python = venv_dir.join("bin").join("python");

    if !venv_python.exists() {
        return Err(format!(
            "venv の Python が見つかりません: {}",
            venv_python.display()
        ));
    }

    append_log(log, "pip を更新中…");
    run_with_runtime_env(
        app,
        &venv_python,
        &["-m", "pip", "install", "--upgrade", "pip", "wheel"],
        extra_env,
        log,
    )?;

    append_log(
        log,
        "WhisperX をインストール中（PyTorch 含む・十数分かかることがあります）…",
    );
    run_with_runtime_env(
        app,
        &venv_python,
        &[
            "-m",
            "pip",
            "install",
            "-r",
            &requirements.to_string_lossy(),
        ],
        extra_env,
        log,
    )?;

    append_log(log, "WhisperX のインストールが完了しました。");
    Ok(venv_python)
}
