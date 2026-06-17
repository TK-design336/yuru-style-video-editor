use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "mkv", "webm", "avi", "m4v"];

#[tauri::command]
pub async fn pick_video_file(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<String>>();

    app.dialog()
        .file()
        .set_title("動画ファイルを選択")
        .add_filter("動画", VIDEO_EXTENSIONS)
        .pick_file(move |path| {
            let value = path.map(|p| p.to_string());
            let _ = tx.send(value);
        });

    rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || fs::read_to_string(path).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn write_text_file(path: String, contents: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let path_buf = PathBuf::from(&path);
        if let Some(parent) = path_buf.parent() {
            if !parent.as_os_str().is_empty() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
        }
        fs::write(path_buf, contents).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

const PROJECT_EXTENSIONS: &[&str] = &["json"];

#[tauri::command]
pub async fn pick_project_open_file(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<String>>();

    app.dialog()
        .file()
        .set_title("プロジェクトを開く")
        .add_filter("Yuru プロジェクト", PROJECT_EXTENSIONS)
        .pick_file(move |path| {
            let value = path.map(|p| p.to_string());
            let _ = tx.send(value);
        });

    rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pick_project_save_file(
    app: AppHandle,
    default_name: Option<String>,
) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<String>>();

    let mut dialog = app
        .dialog()
        .file()
        .set_title("プロジェクトを保存")
        .add_filter("Yuru プロジェクト", PROJECT_EXTENSIONS);

    if let Some(name) = default_name.filter(|s| !s.is_empty()) {
        dialog = dialog.set_file_name(name);
    }

    dialog.save_file(move |path| {
        let value = path.map(|p| p.to_string());
        let _ = tx.send(value);
    });

    rx.await.map_err(|e| e.to_string())
}
