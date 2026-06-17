mod commands;
mod preview;
mod python_sidecar;
mod runtime_bootstrap;

use commands::{
    debug_log, export, ffmpeg, project, sidecar, whisperx_probe, whisperx_setup,
    whisperx_transcribe,
};
use tauri::Manager;

fn apply_platform_window_glass(app: &tauri::App) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    #[cfg(target_os = "windows")]
    {
        use tauri::window::{Color, Effect, EffectsBuilder};
        let _ = window.set_effects(
            EffectsBuilder::new()
                .effect(Effect::Acrylic)
                .color(Color(18, 18, 22, 200))
                .build(),
        );
    }

    #[cfg(target_os = "macos")]
    {
        use tauri::window::{Effect, EffectState, EffectsBuilder};
        let _ = window.set_effects(
            EffectsBuilder::new()
                .effect(Effect::UnderWindowBackground)
                .state(EffectState::Active)
                .build(),
        );
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            apply_platform_window_glass(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            debug_log::log_ai_debug,
            project::pick_video_file,
            project::pick_project_open_file,
            project::pick_project_save_file,
            project::read_text_file,
            project::write_text_file,
            ffmpeg::build_preview_clip,
            export::run_python_export,
            sidecar::run_python_sidecar,
            whisperx_setup::get_whisperx_setup_status,
            whisperx_setup::save_whisperx_hf_token,
            whisperx_setup::clear_whisperx_hf_token,
            whisperx_setup::install_whisperx_packages,
            whisperx_setup::get_whisperx_config,
            whisperx_setup::save_whisperx_compute_settings,
            whisperx_setup::install_pytorch_cuda,
            whisperx_probe::probe_whisperx_environment,
            whisperx_transcribe::run_whisperx_transcription,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
