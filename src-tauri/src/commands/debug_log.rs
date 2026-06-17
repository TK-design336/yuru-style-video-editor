#[tauri::command]
pub fn log_ai_debug(label: String, message: String, detail: Option<String>) {
    eprintln!("=== [AI debug] {label}: {message} ===");
    if let Some(body) = detail {
        eprintln!("{body}");
    }
    eprintln!("=== [AI debug] end ===");
}
