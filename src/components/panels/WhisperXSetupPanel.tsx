import { useCallback, useEffect, useState } from "react";
import { useAnimatedEllipsis } from "@/hooks/useAnimatedEllipsis";
import type { WhisperXEnvironment } from "@/lib/ingest/whisperx";
import {
  getWhisperxConfig,
  getWhisperxSetupStatus,
  installPytorchCuda,
  installWhisperxPackages,
  saveWhisperxComputeSettings,
} from "@/lib/ingest/whisperxSetup";

interface WhisperXSetupPanelProps {
  environment: WhisperXEnvironment | null;
  error: string | null;
  checking: boolean;
  checkingLabel?: string | null;
  durationMin: number | null;
  isTranscribing?: boolean;
  onEnvironmentChange: (force?: boolean) => void;
}

export function WhisperXSetupPanel({
  environment,
  error,
  checking,
  checkingLabel = null,
  durationMin,
  isTranscribing = false,
  onEnvironmentChange,
}: WhisperXSetupPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [pythonExe, setPythonExe] = useState("");
  const [pythonVersion, setPythonVersion] = useState<string | null>(null);
  const [ffmpegReady, setFfmpegReady] = useState(false);
  const [venvReady, setVenvReady] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState<string | null>(null);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [devicePref, setDevicePref] = useState<"auto" | "cuda" | "cpu">("auto");
  const [installingCuda, setInstallingCuda] = useState(false);

  const installEllipsis = useAnimatedEllipsis(installing);
  const cudaInstallEllipsis = useAnimatedEllipsis(installingCuda);
  const checkingEllipsis = useAnimatedEllipsis(checking && !environment);

  const refreshSetupStatus = useCallback(async () => {
    const [statusResult, configResult] = await Promise.all([
      getWhisperxSetupStatus(),
      getWhisperxConfig(),
    ]);
    if (statusResult.success) {
      setPythonExe(statusResult.status.python_executable);
      setPythonVersion(statusResult.status.python_version);
      setFfmpegReady(statusResult.status.ffmpeg_ready);
      setVenvReady(statusResult.status.venv_ready);
    }
    if (configResult.success) {
      const d = configResult.config.device;
      if (d === "cuda" || d === "cpu" || d === "auto") {
        setDevicePref(d);
      }
    }
  }, []);

  useEffect(() => {
    void refreshSetupStatus();
  }, [refreshSetupStatus]);

  useEffect(() => {
    if (environment?.ready) {
      setExpanded(false);
    }
  }, [environment?.ready]);

  useEffect(() => {
    if (isTranscribing) {
      setExpanded(false);
    }
  }, [isTranscribing]);

  const handleDeviceChange = async (device: "auto" | "cuda" | "cpu") => {
    setDevicePref(device);
    const result = await saveWhisperxComputeSettings(device);
    if (!result.success) {
      setLocalMessage(result.error);
      return;
    }
    setLocalMessage(
      device === "auto"
        ? "実行デバイス: 自動（CUDA が使えれば GPU）"
        : device === "cuda"
          ? "実行デバイス: GPU (CUDA) を優先"
          : "実行デバイス: CPU のみ",
    );
    onEnvironmentChange();
  };

  const handleInstallCuda = async () => {
    setInstallingCuda(true);
    setLocalMessage("PyTorch (GPU版) をインストール中…");
    const result = await installPytorchCuda();
    setInstallingCuda(false);
    if (!result.success) {
      setLocalMessage(result.error);
      return;
    }
    if (result.result.success) {
      setLocalMessage(
        "PyTorch (GPU版) のインストールが完了しました。「環境を再確認」を押してください。",
      );
      onEnvironmentChange();
    } else {
      setLocalMessage(
        result.result.error ?? "GPU版 PyTorch のインストールに失敗しました",
      );
    }
  };

  const handleInstall = async () => {
    setInstalling(true);
    setInstallLog(
      "Python 3.12・ffmpeg を取得し、\n" +
        "venv に Whisper + NeMo（話者分離）をインストールします（初回は数 GB・十数分かかることがあります）…",
    );
    setLocalMessage(null);
    const result = await installWhisperxPackages();
    setInstalling(false);
    if (!result.success) {
      setLocalMessage(result.error);
      return;
    }
    setInstallLog(result.result.log || "(ログなし)");
    if (result.result.success) {
      setVenvReady(true);
      setLocalMessage(
        "インストールが完了しました。「環境を再確認」を押してから文字起こしを実行してください。",
      );
      void refreshSetupStatus();
      onEnvironmentChange();
    } else {
      setLocalMessage(result.result.error ?? "インストールに失敗しました");
    }
  };

  if (checking && !environment) {
    return (
      <p className="mb-3 text-xs text-white/50">
        {checkingLabel ?? "文字起こし環境を確認しています"}
        {checkingEllipsis}
      </p>
    );
  }

  if (error && !environment) {
    return (
      <p className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
        {error}
      </p>
    );
  }

  if (!environment) return null;

  const packagesReady = environment.whisperx_available;
  const needsReinstall = venvReady && !packagesReady;

  const items = [
    {
      ok: packagesReady,
      label: "Whisper + NeMo（Python パッケージ）",
    },
    {
      ok: environment.ffmpeg_available || ffmpegReady,
      label: "ffmpeg（アプリ同梱 or PATH）",
    },
    {
      ok: environment.cuda_available,
      label: environment.cuda_device_name
        ? `CUDA: ${environment.cuda_device_name}`
        : environment.pytorch_is_cpu_build
          ? `CUDA 未使用（PyTorch ${environment.torch_version ?? "CPU版"}）`
          : "CUDA（任意・GPU 推奨）",
      optional: !environment.pytorch_is_cpu_build,
    },
  ];

  const onCpuPyTorch =
    environment.pytorch_is_cpu_build === true || !environment.cuda_available;

  const deviceSummary =
    devicePref === "cuda"
      ? environment.cuda_available
        ? "GPU"
        : "GPU（未検出）"
      : devicePref === "cpu"
        ? "CPU"
        : environment.cuda_available
          ? "自動→GPU"
          : "自動→CPU";

  const showCollapsed = environment.ready && !expanded;

  if (showCollapsed) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="glass-panel mb-2 flex w-full items-center justify-between gap-2 border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-left text-xs text-emerald-100 hover:bg-emerald-500/15"
      >
        <span>
          ✓ 環境準備完了（Whisper + NeMo・ffmpeg）・実行: {deviceSummary}
          {isTranscribing ? " — 文字起こし中" : ""}
        </span>
        <span className="shrink-0 text-white/50">詳細 ▼</span>
      </button>
    );
  }

  return (
    <div
      className={`glass-panel w-full min-w-0 px-3 py-3 text-xs leading-relaxed ${
        environment.ready
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
          : "border-amber-500/40 bg-amber-500/10 text-amber-100"
      }`}
    >
      {environment.ready && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-[10px] text-white/50 hover:text-white/80"
          >
            折りたたむ ▲
          </button>
        </div>
      )}

      <p className="text-sm font-medium">
        {environment.ready
          ? "本番の文字起こしを実行できます"
          : "セットアップ（アプリ内で完了できます）"}
      </p>

      <p className="mt-2 text-white/70">
        <strong className="font-medium">Whisper（書き起こし）</strong>と
        <strong className="font-medium"> NVIDIA NeMo MSDD（話者分離）</strong>
        を使用します。Hugging Face トークンは不要です。
        Python 3.12・ffmpeg・依存パッケージはすべてアプリ専用 venv に入ります。
      </p>

      {needsReinstall && (
        <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-1.5 text-amber-100">
          venv はありますが、NeMo など新しい依存が未インストールです（旧 WhisperX のままの可能性があります）。
          下の「依存パッケージをインストール」を押してください。
        </p>
      )}

      {durationMin !== null && durationMin >= 60 && environment.ready && (
        <p className="mt-2 text-white/70">
          約 {durationMin} 分の動画は処理に長時間かかります。完了までウィンドウを閉じないでください。
        </p>
      )}

      <ul className="mt-3 space-y-1">
        {items.map((item) => (
          <li key={item.label} className="flex gap-2">
            <span>{item.ok ? "✓" : item.optional ? "○" : "✗"}</span>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>

      {!packagesReady && environment.messages.length > 0 && (
        <ul className="glass-panel-deep mt-2 space-y-0.5 px-2 py-1.5 text-[11px] text-white/65">
          {environment.messages.map((msg) => (
            <li key={msg}>{msg}</li>
          ))}
        </ul>
      )}

      {pythonExe && (
        <p className="mt-2 break-all text-white/50">
          Python: {pythonExe}
          {pythonVersion ? ` (${pythonVersion})` : ""}
        </p>
      )}

      <div className="glass-panel-deep mt-3 w-full min-w-0 p-3">
        <p className="font-medium text-white/90">実行デバイス</p>
        <p className="mt-1 text-white/60">
          {onCpuPyTorch ? (
            <>
              現在 <strong>CPU 版 PyTorch</strong>
              {environment.torch_version
                ? ` (${environment.torch_version})`
                : ""}
              です。NeMo + Whisper は GPU 推奨です。
            </>
          ) : (
            <>GPU で NeMo 話者分離と Whisper を実行できます。</>
          )}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["auto", "cuda", "cpu"] as const).map((d) => (
            <button
              key={d}
              type="button"
              disabled={isTranscribing}
              onClick={() => void handleDeviceChange(d)}
              className={`rounded-glass px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                devicePref === d
                  ? "glass-btn-primary px-3 py-1.5 shadow-accent-glow-sm"
                  : "glass-btn-secondary px-3 py-1.5"
              }`}
            >
              {d === "auto" ? "自動" : d === "cuda" ? "GPU (CUDA)" : "CPU"}
            </button>
          ))}
        </div>
        {onCpuPyTorch && (
          <div className="mt-2">
            <button
              type="button"
              disabled={installingCuda || isTranscribing}
              onClick={() => void handleInstallCuda()}
              className="glass-btn-secondary mt-2 px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {installingCuda
                ? `PyTorch (GPU版) をインストール中${cudaInstallEllipsis}`
                : "PyTorch (GPU版) をインストール"}
            </button>
          </div>
        )}
      </div>

      <div className="glass-panel-deep mt-4 w-full min-w-0 space-y-4 p-3">
        <div>
          <p className="font-medium text-white/90">手順 1 — 環境を自動セットアップ</p>
          {packagesReady ? (
            <p className="mt-1 text-emerald-200/90">
              依存パッケージは揃っています。NeMo モデルは初回文字起こし時に自動ダウンロードされます。
            </p>
          ) : (
            <p className="mt-1 text-white/60">
              Python 3.12（開発ヘッダ付き）・ffmpeg・NeMo 等をインストールします。
              初回または失敗後は十数分かかることがあります。Visual Studio の C++ ビルドツールが必要な場合があります。
            </p>
          )}
          <button
            type="button"
            disabled={installing || packagesReady}
            onClick={() => void handleInstall()}
            className={`mt-2 rounded-glass px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
              packagesReady
                ? "border border-emerald-500/30 bg-emerald-500/20 text-emerald-100"
                : "glass-btn-secondary px-3 py-1.5"
            }`}
          >
            {installing
              ? `インストール中${installEllipsis}`
              : packagesReady
                ? "✓ 依存パッケージ済み"
                : needsReinstall
                  ? "依存パッケージをインストール（要再実行）"
                  : "環境を自動セットアップ"}
          </button>
        </div>

        <div>
          <p className="font-medium text-white/90">手順 2 — 確認</p>
          <button
            type="button"
            onClick={() => onEnvironmentChange(true)}
            className="glass-btn-ghost mt-2 px-3 py-1.5 text-xs"
          >
            環境を再確認
          </button>
        </div>
      </div>

      {installLog && (
        <pre className="glass-panel-deep mt-3 max-h-40 overflow-auto p-2 text-[10px] text-white/70">
          {installLog}
        </pre>
      )}

      {localMessage && (
        <p className="mt-2 break-words text-white/80">{localMessage}</p>
      )}
    </div>
  );
}
