#!/usr/bin/env python3
"""
Whisper + NeMo (whisper-diarization) 文字起こし・話者分離サイドカー。

stdin JSON:
  - mode "probe": 環境チェック
  - 通常: { "source_video_path", "language", "duration_ms", "force_demo"? }

stdout: JSON { "ok": bool, "data"?: {...}, "error"?: str }
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# 同梱 upstream（MahmoudAshraf97/whisper-diarization）
_UPSTREAM = Path(__file__).resolve().parent / "whisper_diarization_upstream"
if _UPSTREAM.is_dir():
    sys.path.insert(0, str(_UPSTREAM))

_configure_done = False


def _configure_logging() -> None:
    global _configure_done
    if _configure_done:
        return
    root = logging.getLogger()
    for handler in list(root.handlers):
        root.removeHandler(handler)
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(
        logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    )
    root.addHandler(handler)
    root.setLevel(logging.INFO)
    _configure_done = True


_configure_logging()


def emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()


def resolve_ffmpeg_exe() -> str:
    ffmpeg = os.environ.get("FFMPEG_PATH")
    if ffmpeg and Path(ffmpeg).exists():
        return ffmpeg
    found = shutil.which("ffmpeg")
    if found:
        return found
    raise RuntimeError("ffmpeg が見つかりません")


def trim_leading_silence(input_path: str) -> str:
    """
    ffmpeg の silenceremove フィルタで冒頭の無音区間を除去する。
    一時ファイルに書き出して返す（閾値は控えめ。小音量の発話を削らない）。
    """
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    ffmpeg = resolve_ffmpeg_exe()
    subprocess.run(
        [
            ffmpeg,
            "-y",
            "-i",
            input_path,
            "-af",
            "silenceremove=start_periods=1:start_threshold=-65dB:start_silence=0.8",
            tmp.name,
        ],
        check=True,
        capture_output=True,
    )
    return tmp.name


# Whisper 無音ハルシネーション（例: U+FB53 ﻓ）— 日本語テキスト冒頭から除去
_ARABIC_HALLUCINATION_PREFIX_RE = re.compile(
    r"^[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u200F\u200E\s]+"
)
_JA_SCRIPT = r"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF々〆ヵヶー]"
_JA_SPURIOUS_SPACE_RE = re.compile(rf"(?<=({_JA_SCRIPT}))\s+(?=({_JA_SCRIPT}))")


def strip_arabic_hallucination_prefix(text: str) -> str:
    """対策②: 冒頭のアラビア語モード幻覚文字列を除去する。"""
    return _ARABIC_HALLUCINATION_PREFIX_RE.sub("", text).lstrip()


def collapse_japanese_spurious_spaces(text: str) -> str:
    """対策②: 幻覚由来の日本語文字間スペースを除去する（例: 「わ か る」→「わかる」）。"""
    prev = None
    out = text
    while prev != out:
        prev = out
        out = _JA_SPURIOUS_SPACE_RE.sub("", out)
    return out


def sanitize_ja_transcript(text: str) -> str:
    if not text:
        return text
    cleaned = strip_arabic_hallucination_prefix(text)
    return collapse_japanese_spurious_spaces(cleaned)


def leading_trim_offset_ms(original_path: str, trimmed_path: str) -> int:
    """トリムで除去された冒頭区間の長さ（ms）。タイムスタンプ補正用。"""
    import faster_whisper  # type: ignore

    original = faster_whisper.decode_audio(original_path)
    trimmed = faster_whisper.decode_audio(trimmed_path)
    if len(trimmed) >= len(original):
        return 0
    return int((len(original) - len(trimmed)) / 16)


def progress(stage: str, ratio: float | None = None) -> None:
    line: dict[str, Any] = {"progress": True, "stage": stage}
    if ratio is not None:
        line["ratio"] = ratio
    sys.stderr.write(json.dumps(line, ensure_ascii=False) + "\n")
    sys.stderr.flush()


def probe_progress(stage: str, label: str, ratio: float) -> None:
    line: dict[str, Any] = {
        "progress": True,
        "stage": stage,
        "label": label,
        "ratio": ratio,
    }
    sys.stderr.write(json.dumps(line, ensure_ascii=False) + "\n")
    sys.stderr.flush()


def module_available(module_name: str) -> bool:
    import importlib.util

    return importlib.util.find_spec(module_name) is not None


def probe_environment(depth: str = "full") -> dict[str, Any]:
    is_light = depth.strip().lower() == "light"
    messages: list[str] = []
    probe_progress("probe_python", "Python を確認中", 0.08)

    py_major, py_minor = sys.version_info.major, sys.version_info.minor
    python_version = f"{py_major}.{py_minor}"
    python_supported = (3, 10) <= (py_major, py_minor) < (3, 14)

    if not python_supported:
        messages.append(
            f"Python {python_version} は非対応です（3.10〜3.13 が必要）。"
        )

    if not _UPSTREAM.is_dir():
        messages.append(
            "whisper_diarization_upstream が見つかりません。"
            "リポジトリの python/ フォルダを確認してください。"
        )

    probe_progress("probe_deps", "パッケージを確認中", 0.28)

    deps_ok = True
    for mod, label in (
        ("faster_whisper", "faster-whisper"),
        ("nemo", "NeMo (nemo_toolkit)"),
        ("ctc_forced_aligner", "ctc-forced-aligner"),
    ):
        if not module_available(mod):
            deps_ok = False
            messages.append(f"{label} が未インストールです。")

    if not module_available("torch"):
        deps_ok = False
        messages.append("PyTorch が未インストールです。")

    ffmpeg_path = os.environ.get("FFMPEG_PATH")
    ffmpeg_available = bool(ffmpeg_path and Path(ffmpeg_path).exists()) or bool(
        shutil.which("ffmpeg")
    )
    if not ffmpeg_available:
        messages.append("ffmpeg がありません。環境を自動セットアップしてください。")

    ready = (
        python_supported
        and _UPSTREAM.is_dir()
        and deps_ok
        and ffmpeg_available
    )

    torch_version: str | None = None
    cuda_available = False
    cuda_works = False
    cuda_device_name: str | None = None
    cuda_error: str | None = None
    pytorch_is_cpu_build = False

    if is_light:
        probe_progress("probe_done", "基本チェック完了", 1.0)
    else:
        probe_progress("probe_torch", "PyTorch / CUDA を確認中", 0.62)
        try:
            import torch  # type: ignore

            torch_version = torch.__version__
            pytorch_is_cpu_build = "+cpu" in torch_version
            cuda_available = bool(torch.cuda.is_available())
            if cuda_available:
                cuda_device_name = torch.cuda.get_device_name(0)
                try:
                    _ = torch.zeros(1, device="cuda")
                    cuda_works = True
                except Exception as exc:  # noqa: BLE001
                    cuda_error = str(exc)
        except ImportError:
            if "PyTorch が未インストールです。" not in messages:
                messages.append("PyTorch が未インストールです。")
        probe_progress("probe_done", "確認完了", 1.0)

    if ready:
        messages.insert(
            0,
            "Whisper + NeMo 話者分離の準備ができています（Hugging Face トークン不要）。",
        )
    else:
        messages.insert(
            0,
            "本番の文字起こしはまだ実行できません（下記を整備してください）。",
        )

    return {
        "ready": ready,
        "whisperx_available": deps_ok,
        "ffmpeg_available": ffmpeg_available,
        "hf_token_set": True,
        "hf_gated_ready": True,
        "hf_missing_gated": [],
        "cuda_available": cuda_works,
        "cuda_works": cuda_works,
        "cuda_device_name": cuda_device_name,
        "torch_version": torch_version,
        "pytorch_is_cpu_build": pytorch_is_cpu_build,
        "cuda_error": cuda_error,
        "python_version": python_version,
        "python_supported": python_supported,
        "python_executable": sys.executable,
        "messages": messages,
        "engine": "whisper-diarization-nemo",
        "probe_depth": "light" if is_light else "full",
    }


def demo_words() -> list[dict[str, Any]]:
    return [
        {"id": "w0001", "speaker": "SPK_0", "text": "皆さん", "start_ms": 500, "end_ms": 900, "confidence": 0.96},
        {"id": "w0002", "speaker": "SPK_0", "text": "こんにちは", "start_ms": 900, "end_ms": 1400, "confidence": 0.95},
        {"id": "w0006", "speaker": "SPK_1", "text": "こちらこそ", "start_ms": 3400, "end_ms": 4000, "confidence": 0.95},
        {"id": "w0012", "speaker": "SPK_2", "text": "えーと", "start_ms": 7000, "end_ms": 7300, "confidence": 0.78},
    ]


def run_demo(payload: dict[str, Any]) -> dict[str, Any]:
    words = demo_words()
    duration_ms = int(payload.get("duration_ms") or 0)
    if duration_ms <= 0:
        duration_ms = max(w["end_ms"] for w in words) + 2000
    return {
        "words": words,
        "duration_ms": duration_ms,
        "diarization_engine": "demo",
        "is_demo": True,
        "note": "デモ用サンプルです。本番は「文字起こし」を実行してください。",
    }


def resolve_device(payload: dict[str, Any], env: dict[str, Any]) -> str:
    override = (
        payload.get("device")
        or os.environ.get("WHISPERX_DEVICE")
        or "auto"
    )
    override = str(override).strip().lower()
    cuda_avail = bool(env.get("cuda_works") or env.get("cuda_available"))
    if override == "auto":
        return "cuda" if cuda_avail else "cpu"
    if override == "cuda":
        if not cuda_avail:
            raise RuntimeError(
                "GPU (CUDA) が利用できません。セットアップで PyTorch (GPU版) を入れてください。"
            )
        return "cuda"
    return "cpu"


def speaker_id(raw: Any) -> str:
    if raw is None:
        return "SPK_0"
    s = str(raw).strip()
    if s.upper().startswith("SPK_"):
        return s.upper()
    if s.isdigit():
        return f"SPK_{s}"
    m = re.search(r"(\d+)", s)
    if m:
        return f"SPK_{m.group(1)}"
    return f"SPK_{s}"


def words_from_mapping(wsm: list[dict[str, Any]]) -> list[dict[str, Any]]:
    words: list[dict[str, Any]] = []
    for i, item in enumerate(wsm, start=1):
        text = (item.get("word") or "").strip()
        if not text:
            continue
        start_ms = int(item.get("start_time", 0))
        end_ms = int(item.get("end_time", start_ms + 1))
        if end_ms < start_ms:
            end_ms = start_ms + 1
        words.append(
            {
                "id": f"w{i:04d}",
                "speaker": speaker_id(item.get("speaker")),
                "text": text,
                "start_ms": start_ms,
                "end_ms": end_ms,
                "confidence": float(item.get("score", 0.9)),
            }
        )
    return words


def diarize_params(payload: dict[str, Any]) -> tuple[int | None, int]:
    num = payload.get("num_speakers")
    if num is not None:
        return int(num), int(num)
    min_s = payload.get("min_speakers")
    max_s = payload.get("max_speakers")
    max_speakers = int(max_s) if max_s is not None else 10
    return None, max_speakers


def nemo_segment_index_for_anchor(
    anchor_ms: int,
    speaker_ts: list[tuple[int, int, Any]],
) -> int:
    if not speaker_ts:
        return 0
    turn_idx = 0
    _s, e, _sp = speaker_ts[0]
    while anchor_ms > float(e) and turn_idx < len(speaker_ts) - 1:
        turn_idx += 1
        _s, e, _sp = speaker_ts[turn_idx]
    return turn_idx


def count_overlapping_nemo_segment_pairs(
    speaker_ts: list[tuple[int, int, Any]],
) -> int:
    pairs = 0
    for i, (s1, e1, _a) in enumerate(speaker_ts):
        for s2, e2, _b in speaker_ts[i + 1 :]:
            if max(0, min(int(e1), int(e2)) - max(int(s1), int(s2))) > 0:
                pairs += 1
    return pairs


def overlap_candidates_for_word(
    ws: int,
    we: int,
    speaker_ts: list[tuple[int, int, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for i, (s, e, sp) in enumerate(speaker_ts):
        seg_start, seg_end = int(s), int(e)
        overlap = max(0, min(we, seg_end) - max(ws, seg_start))
        if overlap > 0:
            rows.append(
                {
                    "segment_index": i,
                    "speaker": speaker_id(sp),
                    "overlap_ms": overlap,
                    "segment_duration_ms": seg_end - seg_start,
                }
            )
    rows.sort(key=lambda r: (-r["overlap_ms"], r["segment_duration_ms"]))
    return rows


def winning_segment_index(
    ws: int,
    we: int,
    speaker: str,
    speaker_ts: list[tuple[int, int, Any]],
) -> int | None:
    sp_id = speaker_id(speaker)
    best_idx: int | None = None
    best_key: tuple[int, int] | None = None
    for i, (s, e, sp) in enumerate(speaker_ts):
        if speaker_id(sp) != sp_id:
            continue
        seg_start, seg_end = int(s), int(e)
        overlap = max(0, min(we, seg_end) - max(ws, seg_start))
        if overlap <= 0:
            continue
        key = (overlap, -max(seg_end - seg_start, 1))
        if best_key is None or key > best_key:
            best_key = key
            best_idx = i
    return best_idx


def format_nemo_segments(
    speaker_ts: list[tuple[int, int, Any]],
) -> list[dict[str, Any]]:
    return [
        {
            "index": i,
            "start_ms": int(start),
            "end_ms": int(end),
            "speaker": speaker_id(sp),
            "duration_ms": int(end) - int(start),
        }
        for i, (start, end, sp) in enumerate(speaker_ts)
    ]


def format_word_rows(
    wsm: list[dict[str, Any]],
    speaker_ts: list[tuple[int, int, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in wsm:
        text = (item.get("word") or "").strip()
        if not text:
            continue
        start_ms = int(item.get("start_time", 0))
        end_ms = int(item.get("end_time", start_ms + 1))
        sp = speaker_id(item.get("speaker"))
        candidates = overlap_candidates_for_word(start_ms, end_ms, speaker_ts)
        seg_idx = winning_segment_index(start_ms, end_ms, sp, speaker_ts)
        row: dict[str, Any] = {
            "start_ms": start_ms,
            "end_ms": end_ms,
            "text": text,
            "speaker": sp,
            "nemo_segment_index": seg_idx,
            "overlap_candidates": candidates,
        }
        if seg_idx is not None:
            row["nemo_segment_speaker"] = speaker_id(speaker_ts[seg_idx][2])
        if len(candidates) > 1:
            row["overlap_ambiguous"] = True
        rows.append(row)
    return rows


def build_diarization_debug(
    *,
    source_path: str,
    speaker_ts: list[tuple[int, int, Any]],
    wsm_before_realign: list[dict[str, Any]],
    words_final: list[dict[str, Any]],
    diarizer_name: str,
    realign_speakers: bool,
    tuning: dict[str, Any],
    leading_trim_ms: int,
) -> dict[str, Any]:
    words_before = format_word_rows(wsm_before_realign, speaker_ts)
    words_after = [
        {
            "start_ms": w["start_ms"],
            "end_ms": w["end_ms"],
            "text": w["text"],
            "speaker": w["speaker"],
        }
        for w in words_final
    ]

    realign_changes: list[dict[str, Any]] = []
    for before, after in zip(words_before, words_after):
        if before["speaker"] != after["speaker"]:
            realign_changes.append(
                {
                    "start_ms": after["start_ms"],
                    "text": after["text"],
                    "speaker_before_realign": before["speaker"],
                    "speaker_final": after["speaker"],
                }
            )

    return {
        "_readme": (
            "NeMo 話者分離デバッグ出力。"
            " nemo_segments=NeMo生出力区間（オーバーラップあり得る）。"
            " words_after_mapping=重なり時間ベースのマッピング直後（realign前）。"
            " overlap_candidates=その単語に重なる NeMo 区間一覧。"
            " words_final=アプリ保存値（realign後）。"
        ),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_video_path": source_path,
        "diarizer": diarizer_name,
        "leading_trim_ms": leading_trim_ms,
        "tuning": tuning,
        "stats": {
            "nemo_segment_count": len(speaker_ts),
            "nemo_overlapping_segment_pairs": count_overlapping_nemo_segment_pairs(
                speaker_ts
            ),
            "word_count": len(words_after),
            "words_with_overlap_ambiguity": sum(
                1 for w in words_before if len(w.get("overlap_candidates", [])) > 1
            ),
            "realign_enabled": realign_speakers,
            "realign_changed_word_count": len(realign_changes),
        },
        "nemo_segments": format_nemo_segments(speaker_ts),
        "words_after_mapping": words_before,
        "words_final": words_after,
        "realign_changes": realign_changes,
    }


def write_diarization_debug_file(
    source_path: str,
    debug: dict[str, Any],
) -> str:
    source = Path(source_path)
    out_path = source.with_name(f"{source.stem}.diarization_debug.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(debug, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return str(out_path.resolve())


def run_transcription(payload: dict[str, Any]) -> dict[str, Any]:
    import torch  # type: ignore
    import faster_whisper  # type: ignore
    from ctc_forced_aligner import (  # type: ignore
        generate_emissions,
        get_alignments,
        get_spans,
        load_alignment_model,
        postprocess_results,
        preprocess_text,
    )
    from deepmultilingualpunctuation import PunctuationModel  # type: ignore
    from helpers import (  # type: ignore
        cleanup,
        find_numeral_symbol_tokens,
        get_words_speaker_mapping,
        langs_to_iso,
        process_language_arg,
        punct_model_langs,
        realign_speakers_at_sentence_end,
        whisper_transcribe_kwargs,
    )

    env = probe_environment()
    if not env["ready"]:
        raise RuntimeError("\n".join(env["messages"]))

    source = payload["source_video_path"]
    if not Path(source).exists():
        raise RuntimeError(f"音声/動画ファイルが見つかりません: {source}")

    language = payload.get("language", "ja")
    whisper_model = payload.get("model") or "large-v3"
    if whisper_model.endswith(".en") and language != "en":
        whisper_model = "large-v3"

    device = resolve_device(payload, env)
    # バッチ文字起こしは区間欠落の報告があるため、既定は逐次（0）にする
    batch_size = int(payload.get("batch_size") if payload.get("batch_size") is not None else 0)
    stemming = bool(payload.get("stemming", False))
    raw_hints = payload.get("vocabulary_hints") or []
    if isinstance(raw_hints, str):
        vocabulary_hints = [raw_hints]
    elif isinstance(raw_hints, list):
        vocabulary_hints = [str(h) for h in raw_hints if h]
    else:
        vocabulary_hints = []
    suppress_numerals = bool(payload.get("suppress_numerals", False))
    diarizer_name = str(payload.get("diarizer") or "msdd").strip().lower()
    num_speakers, max_speakers = diarize_params(payload)
    realign_speakers = bool(payload.get("realign_speakers_at_sentence_end", True))
    vad_preset = str(payload.get("vad_preset") or "relaxed").strip().lower()
    if vad_preset not in ("relaxed", "sensitive"):
        vad_preset = "relaxed"
    sigmoid_threshold = float(payload.get("msdd_sigmoid_threshold") or 0.7)
    if sigmoid_threshold not in (0.5, 0.7):
        sigmoid_threshold = 0.7
    diar_window_length = int(payload.get("msdd_diar_window_length") or 50)
    if diar_window_length not in (30, 50):
        diar_window_length = 50
    diarization_debug_dump = bool(payload.get("diarization_debug_dump", False))

    mtypes = {"cpu": "int8", "cuda": "float16"}
    temp_path = os.path.join(os.getcwd(), f"temp_outputs_{os.getpid()}")
    os.makedirs(temp_path, exist_ok=True)
    temp_audio_files: list[str] = []
    leading_trim_ms = 0

    try:
        progress("load_audio", 0.05)

        if stemming:
            progress("stem", 0.1)
            cmd = (
                f'"{sys.executable}" -m demucs.separate -n htdemucs --two-stems=vocals '
                f'"{source}" -o "{temp_path}" --device "{device}"'
            )
            if os.system(cmd) != 0:
                logging.warning("ソース分離に失敗。元音声を使用します。")
                vocal_target = source
            else:
                vocal_target = os.path.join(
                    temp_path,
                    "htdemucs",
                    Path(source).stem,
                    "vocals.wav",
                )
                if not Path(vocal_target).exists():
                    vocal_target = source
        else:
            vocal_target = source

        audio_for_asr = vocal_target
        if bool(payload.get("trim_leading_silence", False)):
            progress("trim_silence", 0.12)
            try:
                trimmed_path = trim_leading_silence(vocal_target)
                temp_audio_files.append(trimmed_path)
                leading_trim_ms = leading_trim_offset_ms(vocal_target, trimmed_path)
                audio_for_asr = trimmed_path
            except (subprocess.CalledProcessError, OSError) as exc:
                logging.warning("冒頭無音除去に失敗。元音声で続行します: %s", exc)

        progress("load_model", 0.15)
        whisper_model_obj = faster_whisper.WhisperModel(
            whisper_model,
            device=device,
            compute_type=mtypes[device],
        )
        whisper_pipeline = faster_whisper.BatchedInferencePipeline(whisper_model_obj)
        audio_waveform = faster_whisper.decode_audio(audio_for_asr)
        original_waveform = faster_whisper.decode_audio(vocal_target)

        progress("transcribe", 0.3)
        lang = process_language_arg(language, whisper_model)
        suppress_tokens = (
            find_numeral_symbol_tokens(whisper_model_obj.hf_tokenizer)
            if suppress_numerals
            else [-1]
        )

        tx_extra = whisper_transcribe_kwargs(
            lang,
            batched=batch_size > 0,
            vocabulary_hints=vocabulary_hints,
        )
        if batch_size > 0:
            transcript_segments, info = whisper_pipeline.transcribe(
                audio_waveform,
                lang,
                suppress_tokens=suppress_tokens,
                batch_size=batch_size,
                **tx_extra,
            )
        else:
            transcript_segments, info = whisper_model_obj.transcribe(
                audio_waveform,
                lang,
                suppress_tokens=suppress_tokens,
                **tx_extra,
            )

        full_transcript = "".join(segment.text for segment in transcript_segments)
        if lang == "ja":
            full_transcript = sanitize_ja_transcript(full_transcript)
        del whisper_model_obj, whisper_pipeline
        if device == "cuda":
            torch.cuda.empty_cache()

        progress("align", 0.5)
        alignment_model, alignment_tokenizer = load_alignment_model(
            device,
            dtype=torch.float16 if device == "cuda" else torch.float32,
        )
        emissions, stride = generate_emissions(
            alignment_model,
            torch.from_numpy(audio_waveform)
            .to(alignment_model.dtype)
            .to(alignment_model.device),
            batch_size=batch_size if batch_size > 0 else 8,
        )
        del alignment_model
        if device == "cuda":
            torch.cuda.empty_cache()

        tokens_starred, text_starred = preprocess_text(
            full_transcript,
            romanize=True,
            language=langs_to_iso[info.language],
        )
        segments, scores, blank_token = get_alignments(
            emissions,
            tokens_starred,
            alignment_tokenizer,
        )
        spans = get_spans(tokens_starred, segments, blank_token)
        word_timestamps = postprocess_results(text_starred, spans, stride, scores)

        progress("diarize", 0.72)
        if diarizer_name == "sortformer":
            from diarization.sortformer.sortformer import SortformerDiarizer  # type: ignore

            diarizer_model = SortformerDiarizer(device=device)
            speaker_ts = diarizer_model.diarize(
                torch.from_numpy(audio_waveform).unsqueeze(0)
            )
        else:
            from diarization.msdd.msdd import MSDDDiarizer  # type: ignore

            diarizer_model = MSDDDiarizer(
                device=device,
                vad_preset=vad_preset,
                sigmoid_threshold=sigmoid_threshold,
                diar_window_length=diar_window_length,
            )
            speaker_ts = diarizer_model.diarize(
                torch.from_numpy(audio_waveform).unsqueeze(0),
                num_speakers=num_speakers,
                max_speakers=max_speakers,
            )
        del diarizer_model
        if device == "cuda":
            torch.cuda.empty_cache()

        progress("assign_speakers", 0.88)
        wsm = get_words_speaker_mapping(word_timestamps, speaker_ts, "mid")

        if info.language in punct_model_langs:
            punct_model = PunctuationModel(model="kredor/punctuate-all")
            words_list = [x["word"] for x in wsm]
            labeled = punct_model.predict(words_list, chunk_size=230)
            ending_puncts = ".?!"
            model_puncts = ".,;:!?"
            is_acronym = lambda x: re.fullmatch(r"\b(?:[a-zA-Z]\.){2,}", x)  # noqa: E731
            for word_dict, labeled_tuple in zip(wsm, labeled):
                word = word_dict["word"]
                if (
                    word
                    and labeled_tuple[1] in ending_puncts
                    and (word[-1] not in model_puncts or is_acronym(word))
                ):
                    word += labeled_tuple[1]
                    if word.endswith(".."):
                        word = word.rstrip(".")
                    word_dict["word"] = word

        if realign_speakers:
            wsm_before_realign = [dict(x) for x in wsm]
            wsm = realign_speakers_at_sentence_end(wsm)
        else:
            wsm_before_realign = [dict(x) for x in wsm]
        words = words_from_mapping(wsm)
        if lang == "ja":
            for w in words:
                w["text"] = sanitize_ja_transcript(w["text"])
        if leading_trim_ms > 0:
            for w in words:
                w["start_ms"] += leading_trim_ms
                w["end_ms"] += leading_trim_ms

        if not words:
            raise RuntimeError(
                "処理は完了しましたが単語が0件でした。音声トラックを確認してください。"
            )

        duration_ms = int(len(original_waveform) / 16000 * 1000)

        diarization_debug_path: str | None = None
        if diarization_debug_dump and not payload.get("force_demo"):
            speaker_ts_debug = speaker_ts
            wsm_debug = wsm_before_realign
            if leading_trim_ms > 0:
                speaker_ts_debug = [
                    (s + leading_trim_ms, e + leading_trim_ms, sp)
                    for s, e, sp in speaker_ts
                ]
                wsm_debug = [
                    {
                        **item,
                        "start_time": int(item.get("start_time", 0)) + leading_trim_ms,
                        "end_time": int(item.get("end_time", 0)) + leading_trim_ms,
                    }
                    for item in wsm_before_realign
                ]
            debug = build_diarization_debug(
                source_path=source,
                speaker_ts=speaker_ts_debug,
                wsm_before_realign=wsm_debug,
                words_final=words,
                diarizer_name=diarizer_name,
                realign_speakers=realign_speakers,
                tuning={
                    "realign_speakers_at_sentence_end": realign_speakers,
                    "vad_preset": vad_preset,
                    "msdd_sigmoid_threshold": sigmoid_threshold,
                    "msdd_diar_window_length": diar_window_length,
                    "stemming": stemming,
                    "num_speakers": num_speakers,
                    "max_speakers": max_speakers,
                },
                leading_trim_ms=leading_trim_ms,
            )
            diarization_debug_path = write_diarization_debug_file(source, debug)

        progress("done", 1.0)
        tuning_note = f"realign={'on' if realign_speakers else 'off'}"
        if diarizer_name == "msdd":
            tuning_note += (
                f", vad={vad_preset}, sigmoid={sigmoid_threshold}, win={diar_window_length}s"
            )
        result: dict[str, Any] = {
            "words": words,
            "duration_ms": duration_ms,
            "leading_trim_ms": leading_trim_ms,
            "diarization_engine": f"nemo-{diarizer_name}",
            "is_demo": False,
            "device_used": device,
            "whisper_model": whisper_model,
            "note": f"Whisper {whisper_model} + NeMo {diarizer_name} 話者分離 ({tuning_note})",
        }
        if diarization_debug_path:
            result["diarization_debug_path"] = diarization_debug_path
        return result
    finally:
        for path in temp_audio_files:
            try:
                os.unlink(path)
            except OSError:
                pass
        try:
            cleanup(temp_path)
        except Exception:  # noqa: BLE001
            pass


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        emit({"ok": False, "error": f"stdin JSON の解析に失敗: {exc}"})
        return

    if payload.get("mode") == "probe":
        depth = str(payload.get("depth") or "full")
        emit({"ok": True, "data": probe_environment(depth=depth)})
        return

    source = payload.get("source_video_path")
    if not source:
        emit({"ok": False, "error": "source_video_path が必要です"})
        return

    force_demo = bool(payload.get("force_demo", False))

    try:
        if force_demo:
            data = run_demo(payload)
        else:
            data = run_transcription(payload)
    except Exception as exc:  # noqa: BLE001
        emit({"ok": False, "error": str(exc)})
        return

    emit({"ok": True, "data": data})


if __name__ == "__main__":
    main()
