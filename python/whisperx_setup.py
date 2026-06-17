#!/usr/bin/env python3
"""
Whisper + NeMo 文字起こし環境セットアップ（アプリ内ウィザード用）

stdin JSON:
  - mode "install": { "venv_dir": str }  … 3.12 相当の venv を作り pip install
  - mode "check_launcher": {}            … 利用可能な Python ランチャーを列挙

stdout: JSON { "ok": bool, "data"?: {...}, "error"?: str }
"""

from __future__ import annotations

import json
import platform
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


MIN_PY = (3, 10)
MAX_PY_EXCLUSIVE = (3, 14)
PREFERRED_MINORS = (12, 11, 13, 10)


def emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()


def version_tuple() -> tuple[int, int]:
    return (sys.version_info.major, sys.version_info.minor)


def version_ok(major: int, minor: int) -> bool:
    return MIN_PY <= (major, minor) < MAX_PY_EXCLUSIVE


def venv_python_executable(venv_dir: Path) -> Path:
    if platform.system() == "Windows":
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def venv_has_dev_headers(venv_dir: Path) -> bool:
    """C 拡張ビルド用（ctc-forced-aligner 等）に Include/Python.h が必要"""
    if platform.system() == "Windows":
        return (venv_dir / "Include" / "Python.h").exists()
    return (venv_dir / "include" / "Python.h").exists()


def find_windows_py_launcher(minor: int) -> str | None:
    try:
        result = subprocess.run(
            ["py", f"-{minor}", "-c", "import sys; print(sys.executable)"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0:
        return None
    exe = result.stdout.strip()
    return exe if exe else None


def python_version_label(exe: str) -> str | None:
    try:
        result = subprocess.run(
            [exe, "-c", "import sys; print(sys.version_info[0], sys.version_info[1])"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0:
        return None
    parts = result.stdout.strip().split()
    if len(parts) != 2:
        return None
    major, minor = int(parts[0]), int(parts[1])
    if not version_ok(major, minor):
        return None
    return f"{major}.{minor}"


def resolve_python_launcher(payload: dict[str, Any]) -> tuple[str | None, str | None]:
    """
    venv 作成に使う Python を決める。
    1. payload / 起動中インタプリタ（アプリ同梱 3.12 含む）
    2. システムの py ランチャー・PATH 上の python3.12 等
    """
    explicit = payload.get("python_executable")
    if isinstance(explicit, str) and explicit.strip():
        exe = explicit.strip()
        if Path(exe).exists():
            label = python_version_label(exe)
            if label:
                return exe, label

    if version_ok(*version_tuple()):
        return sys.executable, f"{sys.version_info.major}.{sys.version_info.minor}"

    return find_suitable_launcher()


def find_suitable_launcher() -> tuple[str | None, str | None]:
    """(launcher_command_list, version_label) — システム PATH / py ランチャーのみ"""
    if platform.system() == "Windows":
        for minor in PREFERRED_MINORS:
            exe = find_windows_py_launcher(minor)
            if exe:
                return (exe, f"3.{minor}")
            try:
                probe = subprocess.run(
                    ["py", f"-{minor}", "-c", "import sys; print(sys.version_info[:2])"],
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=30,
                )
                if probe.returncode == 0:
                    return (f"py:-{minor}", f"3.{minor}")
            except FileNotFoundError:
                continue
        return None, None

    for cmd in ("python3.12", "python3.11", "python3.13", "python3.10", "python3"):
        try:
            result = subprocess.run(
                [cmd, "-c", "import sys; print(sys.executable)"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=30,
            )
        except FileNotFoundError:
            continue
        if result.returncode != 0:
            continue
        exe = result.stdout.strip()
        if not exe:
            continue
        ver = subprocess.run(
            [exe, "-c", "import sys; print(sys.version_info[0], sys.version_info[1])"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30,
        )
        if ver.returncode == 0:
            parts = ver.stdout.strip().split()
            if len(parts) == 2:
                major, minor = int(parts[0]), int(parts[1])
                if version_ok(major, minor):
                    return (exe, f"{major}.{minor}")
    return None, None


def create_venv(launcher: str, venv_dir: Path, logs: list[str]) -> bool:
    if launcher.startswith("py:"):
        minor = launcher.split(":")[1]
        create_cmds: list[list[str]] = [
            ["py", minor, "-m", "venv", str(venv_dir)],
        ]
    else:
        create_cmds = [
            [launcher, "-m", "venv", str(venv_dir)],
        ]

    for create_cmd in create_cmds:
        logs.append("実行: " + " ".join(create_cmd))
        created = subprocess.run(
            create_cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        logs.append(created.stdout)
        logs.append(created.stderr)
        if created.returncode == 0 and venv_python_executable(venv_dir).exists():
            return True

    logs.append("標準 venv が使えないため virtualenv を試します…")
    if not launcher.startswith("py:"):
        boot = subprocess.run(
            [launcher, "-m", "pip", "install", "virtualenv"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        logs.append(boot.stdout)
        logs.append(boot.stderr)
        if boot.returncode == 0:
            ve_cmd = [launcher, "-m", "virtualenv", str(venv_dir)]
            logs.append("実行: " + " ".join(ve_cmd))
            created = subprocess.run(
                ve_cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            logs.append(created.stdout)
            logs.append(created.stderr)
            if created.returncode == 0 and venv_python_executable(venv_dir).exists():
                return True

    return False


def run_check_launcher() -> None:
    launcher, label = resolve_python_launcher({})
    current = f"{sys.version_info.major}.{sys.version_info.minor}"
    emit(
        {
            "ok": True,
            "data": {
                "current_python": sys.executable,
                "current_version": current,
                "current_supported": version_ok(*version_tuple()),
                "suitable_launcher": launcher,
                "suitable_version": label,
            },
        }
    )


def run_install(payload: dict[str, Any]) -> None:
    venv_dir = Path(payload.get("venv_dir", ""))
    if not venv_dir:
        emit({"ok": False, "error": "venv_dir が必要です"})
        return

    logs: list[str] = []
    current = f"{sys.version_info.major}.{sys.version_info.minor}"
    logs.append(f"起動中の Python: {sys.executable} ({current})")

    base = Path(__file__).parent
    upstream = base / "whisper_diarization_upstream"
    if not upstream.is_dir():
        logs.append("whisper-diarization ソースを取得中…")
        cloned = subprocess.run(
            [
                "git",
                "clone",
                "--depth",
                "1",
                "https://github.com/MahmoudAshraf97/whisper-diarization.git",
                str(upstream),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        logs.append(cloned.stdout)
        logs.append(cloned.stderr)
        if cloned.returncode != 0 or not upstream.is_dir():
            emit(
                {
                    "ok": False,
                    "data": {"log": "\n".join(logs)[-12000:]},
                    "error": (
                        "whisper-diarization の取得に失敗しました。"
                        " git が PATH にあるか確認してください。"
                    ),
                }
            )
            return

    requirements = base / "requirements.txt"
    constraints = base / "constraints.txt"
    if not requirements.exists():
        emit({"ok": False, "error": f"requirements.txt が見つかりません: {requirements}"})
        return

    launcher, label = resolve_python_launcher(payload)
    if not launcher:
        emit(
            {
                "ok": False,
                "data": {"log": "\n".join(logs)},
                "error": (
                    "venv 作成用の Python 3.10〜3.13 が見つかりません。"
                    f" 起動中: {sys.executable} ({current})。"
                    " アプリの「環境を自動セットアップ」を再実行するか、"
                    " https://www.python.org/downloads/ から Python 3.12 をインストールしてください。"
                ),
            }
        )
        return

    venv_python = venv_python_executable(venv_dir)
    logs.append(f"venv 作成に使用: {launcher} ({label or '?'})")

    if venv_python.exists() and not venv_has_dev_headers(venv_dir):
        logs.append(
            "既存 venv に Python.h がありません（旧埋め込み Python で作成された可能性）。"
            " venv を削除して作り直します…"
        )
        shutil.rmtree(venv_dir, ignore_errors=True)

    if venv_python.exists() and venv_has_dev_headers(venv_dir):
        logs.append(f"既存 venv を使用: {venv_dir}")
    else:
        logs.append(f"venv を作成: {venv_dir}")
        if not create_venv(launcher, venv_dir, logs):
            emit(
                {
                    "ok": False,
                    "data": {"log": "\n".join(logs)[-12000:]},
                    "error": "venv の作成に失敗しました。ログを確認してください。",
                }
            )
            return

    if not venv_python.exists():
        emit(
            {
                "ok": False,
                "data": {"log": "\n".join(logs)[-12000:]},
                "error": f"venv の Python が見つかりません: {venv_python}",
            }
        )
        return

    logs.append(f"pip install → {venv_python}")
    pip = subprocess.run(
        [
            str(venv_python),
            "-m",
            "pip",
            "install",
            "--upgrade",
            "pip",
            "wheel",
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    logs.append(pip.stdout)
    logs.append(pip.stderr)

    logs.append("ビルド用: cython / setuptools を先にインストール…")
    bootstrap = subprocess.run(
        [
            str(venv_python),
            "-m",
            "pip",
            "install",
            "cython",
            "setuptools",
            "wheel",
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    logs.append(bootstrap.stdout)
    logs.append(bootstrap.stderr)

    pip_args = [str(venv_python), "-m", "pip", "install"]
    if constraints.exists():
        pip_args.extend(["-c", str(constraints)])
    pip_args.extend(["-r", str(requirements)])

    result = subprocess.run(
        pip_args,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    logs.append(result.stdout)
    logs.append(result.stderr)

    combined = "\n".join(logs).strip()
    tail = combined[-12000:] if len(combined) > 12000 else combined

    if result.returncode == 0:
        emit(
            {
                "ok": True,
                "data": {
                    "log": tail,
                    "python_executable": str(venv_python),
                    "python_version": label,
                },
            }
        )
    else:
        hint = ""
        if "3.14" in current or not version_ok(*version_tuple()):
            hint = (
                "\n\n【原因】お使いの Python 3.14 は NeMo / Whisper の依存に未対応です。"
                " 上記 venv 作成が成功していれば次回からは venv 内の 3.12 が使われます。"
            )
        emit(
            {
                "ok": False,
                "data": {"log": tail + hint},
                "error": "pip install に失敗しました。ログを確認してください。",
            }
        )


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        emit({"ok": False, "error": f"stdin JSON の解析に失敗: {exc}"})
        return

    mode = payload.get("mode", "install")
    if mode == "install":
        run_install(payload)
    elif mode == "check_launcher":
        run_check_launcher()
    else:
        emit({"ok": False, "error": f"未知の mode: {mode}"})


if __name__ == "__main__":
    main()
