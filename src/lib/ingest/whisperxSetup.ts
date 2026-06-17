import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/tauri/env";

export type WhisperxSetupStatus = {
  hf_token_configured: boolean;
  python_executable: string;
  python_version: string | null;
  python_supported: boolean;
  venv_ready: boolean;
  ffmpeg_ready: boolean;
  auto_bootstrap: boolean;
  requirements_path: string;
};

export type WhisperxInstallResult = {
  success: boolean;
  log: string;
  error?: string;
};

export async function getWhisperxSetupStatus(): Promise<
  | { success: true; status: WhisperxSetupStatus }
  | { success: false; error: string }
> {
  if (!isTauri()) {
    return { success: false, error: "Tauri デスクトップ版でのみ利用できます" };
  }
  try {
    const status = await invoke<WhisperxSetupStatus>("get_whisperx_setup_status");
    return { success: true, status };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function saveWhisperxHfToken(
  token: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!isTauri()) {
    return { success: false, error: "Tauri デスクトップ版でのみ利用できます" };
  }
  try {
    await invoke("save_whisperx_hf_token", { token });
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export type WhisperxConfig = {
  device: string;
  compute_type: string | null;
  hf_token_configured: boolean;
};

export async function getWhisperxConfig(): Promise<
  | { success: true; config: WhisperxConfig }
  | { success: false; error: string }
> {
  if (!isTauri()) {
    return { success: false, error: "Tauri デスクトップ版でのみ利用できます" };
  }
  try {
    const config = await invoke<WhisperxConfig>("get_whisperx_config");
    return { success: true, config };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function saveWhisperxComputeSettings(
  device: "auto" | "cuda" | "cpu",
  computeType?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!isTauri()) {
    return { success: false, error: "Tauri デスクトップ版でのみ利用できます" };
  }
  try {
    await invoke("save_whisperx_compute_settings", {
      device,
      compute_type: computeType ?? null,
    });
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function installPytorchCuda(): Promise<
  | { success: true; result: WhisperxInstallResult }
  | { success: false; error: string }
> {
  if (!isTauri()) {
    return { success: false, error: "Tauri デスクトップ版でのみ利用できます" };
  }
  try {
    const result = await invoke<WhisperxInstallResult>("install_pytorch_cuda");
    return { success: true, result };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function installWhisperxPackages(): Promise<
  | { success: true; result: WhisperxInstallResult }
  | { success: false; error: string }
> {
  if (!isTauri()) {
    return { success: false, error: "Tauri デスクトップ版でのみ利用できます" };
  }
  try {
    const result = await invoke<WhisperxInstallResult>("install_whisperx_packages");
    return { success: true, result };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
