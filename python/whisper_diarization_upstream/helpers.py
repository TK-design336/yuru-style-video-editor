import os
import shutil
from typing import Any

import nltk

punct_model_langs = [
    "en",
    "fr",
    "de",
    "es",
    "it",
    "nl",
    "pt",
    "bg",
    "pl",
    "cs",
    "sk",
    "sl",
]

LANGUAGES = {
    "en": "english",
    "zh": "chinese",
    "de": "german",
    "es": "spanish",
    "ru": "russian",
    "ko": "korean",
    "fr": "french",
    "ja": "japanese",
    "pt": "portuguese",
    "tr": "turkish",
    "pl": "polish",
    "ca": "catalan",
    "nl": "dutch",
    "ar": "arabic",
    "sv": "swedish",
    "it": "italian",
    "id": "indonesian",
    "hi": "hindi",
    "fi": "finnish",
    "vi": "vietnamese",
    "he": "hebrew",
    "uk": "ukrainian",
    "el": "greek",
    "ms": "malay",
    "cs": "czech",
    "ro": "romanian",
    "da": "danish",
    "hu": "hungarian",
    "ta": "tamil",
    "no": "norwegian",
    "th": "thai",
    "ur": "urdu",
    "hr": "croatian",
    "bg": "bulgarian",
    "lt": "lithuanian",
    "la": "latin",
    "mi": "maori",
    "ml": "malayalam",
    "cy": "welsh",
    "sk": "slovak",
    "te": "telugu",
    "fa": "persian",
    "lv": "latvian",
    "bn": "bengali",
    "sr": "serbian",
    "az": "azerbaijani",
    "sl": "slovenian",
    "kn": "kannada",
    "et": "estonian",
    "mk": "macedonian",
    "br": "breton",
    "eu": "basque",
    "is": "icelandic",
    "hy": "armenian",
    "ne": "nepali",
    "mn": "mongolian",
    "bs": "bosnian",
    "kk": "kazakh",
    "sq": "albanian",
    "sw": "swahili",
    "gl": "galician",
    "mr": "marathi",
    "pa": "punjabi",
    "si": "sinhala",
    "km": "khmer",
    "sn": "shona",
    "yo": "yoruba",
    "so": "somali",
    "af": "afrikaans",
    "oc": "occitan",
    "ka": "georgian",
    "be": "belarusian",
    "tg": "tajik",
    "sd": "sindhi",
    "gu": "gujarati",
    "am": "amharic",
    "yi": "yiddish",
    "lo": "lao",
    "uz": "uzbek",
    "fo": "faroese",
    "ht": "haitian creole",
    "ps": "pashto",
    "tk": "turkmen",
    "nn": "nynorsk",
    "mt": "maltese",
    "sa": "sanskrit",
    "lb": "luxembourgish",
    "my": "myanmar",
    "bo": "tibetan",
    "tl": "tagalog",
    "mg": "malagasy",
    "as": "assamese",
    "tt": "tatar",
    "haw": "hawaiian",
    "ln": "lingala",
    "ha": "hausa",
    "ba": "bashkir",
    "jw": "javanese",
    "su": "sundanese",
    "yue": "cantonese",
}

# language code lookup by name, with a few language aliases
TO_LANGUAGE_CODE = {
    **{language: code for code, language in LANGUAGES.items()},
    "burmese": "my",
    "valencian": "ca",
    "flemish": "nl",
    "haitian": "ht",
    "letzeburgesch": "lb",
    "pushto": "ps",
    "panjabi": "pa",
    "moldavian": "ro",
    "moldovan": "ro",
    "sinhalese": "si",
    "castilian": "es",
}

whisper_langs = sorted(LANGUAGES.keys()) + sorted([k.title() for k in TO_LANGUAGE_CODE.keys()])

langs_to_iso = {
    "af": "afr",
    "am": "amh",
    "ar": "ara",
    "as": "asm",
    "az": "aze",
    "ba": "bak",
    "be": "bel",
    "bg": "bul",
    "bn": "ben",
    "bo": "tib",
    "br": "bre",
    "bs": "bos",
    "ca": "cat",
    "cs": "cze",
    "cy": "wel",
    "da": "dan",
    "de": "ger",
    "el": "gre",
    "en": "eng",
    "es": "spa",
    "et": "est",
    "eu": "baq",
    "fa": "per",
    "fi": "fin",
    "fo": "fao",
    "fr": "fre",
    "gl": "glg",
    "gu": "guj",
    "ha": "hau",
    "haw": "haw",
    "he": "heb",
    "hi": "hin",
    "hr": "hrv",
    "ht": "hat",
    "hu": "hun",
    "hy": "arm",
    "id": "ind",
    "is": "ice",
    "it": "ita",
    "ja": "jpn",
    "jw": "jav",
    "ka": "geo",
    "kk": "kaz",
    "km": "khm",
    "kn": "kan",
    "ko": "kor",
    "la": "lat",
    "lb": "ltz",
    "ln": "lin",
    "lo": "lao",
    "lt": "lit",
    "lv": "lav",
    "mg": "mlg",
    "mi": "mao",
    "mk": "mac",
    "ml": "mal",
    "mn": "mon",
    "mr": "mar",
    "ms": "may",
    "mt": "mlt",
    "my": "bur",
    "ne": "nep",
    "nl": "dut",
    "nn": "nno",
    "no": "nor",
    "oc": "oci",
    "pa": "pan",
    "pl": "pol",
    "ps": "pus",
    "pt": "por",
    "ro": "rum",
    "ru": "rus",
    "sa": "san",
    "sd": "snd",
    "si": "sin",
    "sk": "slo",
    "sl": "slv",
    "sn": "sna",
    "so": "som",
    "sq": "alb",
    "sr": "srp",
    "su": "sun",
    "sv": "swe",
    "sw": "swa",
    "ta": "tam",
    "te": "tel",
    "tg": "tgk",
    "th": "tha",
    "tk": "tuk",
    "tl": "tgl",
    "tr": "tur",
    "tt": "tat",
    "uk": "ukr",
    "ur": "urd",
    "uz": "uzb",
    "vi": "vie",
    "yi": "yid",
    "yo": "yor",
    "yue": "yue",
    "zh": "chi",
}


def get_word_ts_anchor(s, e, option="start"):
    if option == "end":
        return e
    elif option == "mid":
        return (s + e) / 2
    return s


def _overlap_ms(ws: int, we: int, s: int, e: int) -> int:
    return max(0, min(we, e) - max(ws, s))


def _speaker_from_anchor_gap(anchor: float, spk_ts: list) -> Any:
    """NeMo 区間の隙間にある単語: アンカー点に最も近い区間の話者を返す"""
    if not spk_ts:
        return 0
    for s, e, sp in spk_ts:
        if float(s) <= anchor <= float(e):
            return sp
    best_sp = spk_ts[0][2]
    best_dist = float("inf")
    for s, e, sp in spk_ts:
        if anchor < float(s):
            dist = float(s) - anchor
        elif anchor > float(e):
            dist = anchor - float(e)
        else:
            return sp
        if dist < best_dist:
            best_dist = dist
            best_sp = sp
    return best_sp


def pick_speaker_for_word_interval(
    ws: int,
    we: int,
    spk_ts: list,
    *,
    word_anchor_option: str = "mid",
    prev_speaker: Any | None = None,
) -> Any:
    """
    単語区間 [ws, we] に対し、NeMo 話者区間との重なり時間が最大の話者を選ぶ。
    MSDD が同一時刻に複数話者区間（オーバーラップ）を返す場合に対応する。
    """
    if not spk_ts:
        return 0

    anchor = get_word_ts_anchor(ws, we, word_anchor_option)
    candidates: list[tuple[int, int, Any, int, int]] = []
    for s, e, sp in spk_ts:
        seg_start = int(s)
        seg_end = int(e)
        overlap = _overlap_ms(ws, we, seg_start, seg_end)
        if overlap > 0:
            seg_dur = max(seg_end - seg_start, 1)
            candidates.append((overlap, seg_dur, sp, seg_start, seg_end))

    if not candidates:
        return _speaker_from_anchor_gap(anchor, spk_ts)

    max_overlap = max(c[0] for c in candidates)
    top = [c for c in candidates if c[0] == max_overlap]

    min_seg_dur = min(c[1] for c in top)
    top = [c for c in top if c[1] == min_seg_dur]

    if len(top) == 1:
        return top[0][2]

    if prev_speaker is not None:
        prev_matches = [c for c in top if c[2] == prev_speaker]
        if len(prev_matches) == 1:
            return prev_matches[0][2]

    top.sort(key=lambda c: abs(anchor - (c[3] + c[4]) / 2))
    if len(top) >= 2 and abs(
        abs(anchor - (top[0][3] + top[0][4]) / 2)
        - abs(anchor - (top[1][3] + top[1][4]) / 2)
    ) < 1e-6:
        # 完全同区間オーバーラップ等で中心距離も同点 → 直前話者を維持
        if prev_speaker is not None and prev_speaker in [c[2] for c in top]:
            return prev_speaker
        return min(top, key=lambda c: int(c[2]) if str(c[2]).isdigit() else str(c[2]))[2]

    return top[0][2]


def get_words_speaker_mapping(wrd_ts, spk_ts, word_anchor_option="mid"):
    wrd_spk_mapping = []
    prev_speaker: Any | None = None
    for wrd_dict in wrd_ts:
        ws, we, wrd = (
            int(wrd_dict["start"] * 1000),
            int(wrd_dict["end"] * 1000),
            wrd_dict["text"],
        )
        sp = pick_speaker_for_word_interval(
            ws,
            we,
            spk_ts,
            word_anchor_option=word_anchor_option,
            prev_speaker=prev_speaker,
        )
        prev_speaker = sp
        wrd_spk_mapping.append({"word": wrd, "start_time": ws, "end_time": we, "speaker": sp})
    return wrd_spk_mapping


SENTENCE_END_CHARS = ("。", "？", "！", "?", "!", "…")

JA_TRANSCRIBE_INITIAL_PROMPT = (
    "以下は日本語の対談音声の文字起こしです。"
    "句読点（。、？！）を適切に使用し、自然な日本語で出力してください。"
    "例：「そうですね。APIというのは、なんか連携するいい感じのやつですよね。」"
)


def build_initial_prompt(
    language: str | None,
    vocabulary_hints: list[str] | None = None,
) -> str | None:
    if language != "ja":
        return None
    base = JA_TRANSCRIBE_INITIAL_PROMPT
    if vocabulary_hints:
        hints = [h.strip() for h in vocabulary_hints if h and str(h).strip()]
        if hints:
            base += f"\n登場する固有名詞・専門用語：{'、'.join(hints)}"
    return base


def whisper_transcribe_kwargs(
    language: str | None,
    *,
    batched: bool,
    vocabulary_hints: list[str] | None = None,
) -> dict:
    """faster_whisper transcribe() 用の追加キーワード引数。"""
    vad_parameters: dict = {
        "min_silence_duration_ms": 500,
        "speech_pad_ms": 400,
        "threshold": 0.45,
    }
    if batched:
        vad_parameters.update(
            {
                "min_speech_duration_ms": 80,
                "onset": 0.45,
                "offset": 0.35,
            }
        )

    kwargs: dict = {
        "vad_filter": True,
        "vad_parameters": vad_parameters,
        "no_speech_threshold": 0.6,
        "beam_size": 5,
        "compression_ratio_threshold": 2.8,
        "log_prob_threshold": -1.2,
    }
    initial_prompt = build_initial_prompt(language, vocabulary_hints)
    if initial_prompt:
        kwargs["initial_prompt"] = initial_prompt
    return kwargs


def _word_ends_sentence(word: str) -> bool:
    stripped = word.rstrip()
    return bool(stripped) and stripped[-1] in SENTENCE_END_CHARS


def realign_speakers_at_sentence_end(word_speaker_mapping: list[dict]) -> list[dict]:
    """
    NeMo の単語単位話者ラベルを補正する。
    文中の話者揺れは確定話者を維持し、文末（。？！等）を越えた時点で次話者へ切替。
    """
    if not word_speaker_mapping:
        return word_speaker_mapping

    realigned: list[dict] = []
    active = word_speaker_mapping[0]["speaker"]
    pending: int | str | None = None
    pending_from = 0

    for item in word_speaker_mapping:
        neemo = item["speaker"]
        if neemo == "UNKNOWN" and realigned:
            neemo = active
        word = item.get("word") or ""
        ends_sentence = _word_ends_sentence(word)

        if pending is not None:
            assigned = active
            if ends_sentence:
                active = pending
                pending = None
        elif neemo != active:
            if ends_sentence:
                assigned = active
                active = neemo
            else:
                pending = neemo
                pending_from = len(realigned)
                assigned = active
        else:
            assigned = active

        realigned.append({**item, "speaker": assigned})

    if pending is not None:
        last_sentence_end = -1
        for i, item in enumerate(realigned):
            if _word_ends_sentence(item.get("word") or ""):
                last_sentence_end = i
        for i in range(max(last_sentence_end + 1, pending_from), len(realigned)):
            realigned[i] = {**realigned[i], "speaker": pending}

    return realigned


sentence_ending_punctuations = ".?!。！？"


def get_first_word_idx_of_sentence(word_idx, word_list, speaker_list, max_words):
    is_word_sentence_end = lambda x: x >= 0 and word_list[x][-1] in sentence_ending_punctuations
    left_idx = word_idx
    while (
        left_idx > 0
        and word_idx - left_idx < max_words
        and speaker_list[left_idx - 1] == speaker_list[left_idx]
        and not is_word_sentence_end(left_idx - 1)
    ):
        left_idx -= 1

    return left_idx if left_idx == 0 or is_word_sentence_end(left_idx - 1) else -1


def get_last_word_idx_of_sentence(word_idx, word_list, max_words):
    is_word_sentence_end = lambda x: x >= 0 and word_list[x][-1] in sentence_ending_punctuations
    right_idx = word_idx
    while (
        right_idx < len(word_list) - 1
        and right_idx - word_idx < max_words
        and not is_word_sentence_end(right_idx)
    ):
        right_idx += 1

    return right_idx if right_idx == len(word_list) - 1 or is_word_sentence_end(right_idx) else -1


def get_realigned_ws_mapping_with_punctuation(word_speaker_mapping, max_words_in_sentence=50):
    is_word_sentence_end = (
        lambda x: x >= 0 and word_speaker_mapping[x]["word"][-1] in sentence_ending_punctuations
    )
    wsp_len = len(word_speaker_mapping)

    words_list, speaker_list = [], []
    for k, line_dict in enumerate(word_speaker_mapping):
        word, speaker = line_dict["word"], line_dict["speaker"]
        words_list.append(word)
        speaker_list.append(speaker)

    k = 0
    while k < len(word_speaker_mapping):
        line_dict = word_speaker_mapping[k]
        if (
            k < wsp_len - 1
            and speaker_list[k] != speaker_list[k + 1]
            and not is_word_sentence_end(k)
        ):
            left_idx = get_first_word_idx_of_sentence(
                k, words_list, speaker_list, max_words_in_sentence
            )
            right_idx = (
                get_last_word_idx_of_sentence(
                    k, words_list, max_words_in_sentence - k + left_idx - 1
                )
                if left_idx > -1
                else -1
            )
            if min(left_idx, right_idx) == -1:
                k += 1
                continue

            spk_labels = speaker_list[left_idx : right_idx + 1]
            mod_speaker = max(set(spk_labels), key=spk_labels.count)
            if spk_labels.count(mod_speaker) < len(spk_labels) // 2:
                k += 1
                continue

            speaker_list[left_idx : right_idx + 1] = [mod_speaker] * (right_idx - left_idx + 1)
            k = right_idx

        k += 1

    k, realigned_list = 0, []
    while k < len(word_speaker_mapping):
        line_dict = word_speaker_mapping[k].copy()
        line_dict["speaker"] = speaker_list[k]
        realigned_list.append(line_dict)
        k += 1

    return realigned_list


def get_sentences_speaker_mapping(word_speaker_mapping, spk_ts):
    sentence_checker = nltk.tokenize.PunktSentenceTokenizer().text_contains_sentbreak
    s, e, spk = spk_ts[0]
    prev_spk = spk

    snts = []
    snt = {"speaker": f"Speaker {spk}", "start_time": s, "end_time": e, "text": ""}

    for wrd_dict in word_speaker_mapping:
        wrd, spk = wrd_dict["word"], wrd_dict["speaker"]
        s, e = wrd_dict["start_time"], wrd_dict["end_time"]
        if spk != prev_spk or sentence_checker(snt["text"] + " " + wrd):
            snts.append(snt)
            snt = {
                "speaker": f"Speaker {spk}",
                "start_time": s,
                "end_time": e,
                "text": "",
            }
        else:
            snt["end_time"] = e
        snt["text"] += wrd + " "
        prev_spk = spk

    snts.append(snt)
    return snts


def get_speaker_aware_transcript(sentences_speaker_mapping, f):
    previous_speaker = sentences_speaker_mapping[0]["speaker"]
    f.write(f"{previous_speaker}: ")

    for sentence_dict in sentences_speaker_mapping:
        speaker = sentence_dict["speaker"]
        sentence = sentence_dict["text"]

        # If this speaker doesn't match the previous one, start a new paragraph
        if speaker != previous_speaker:
            f.write(f"\n\n{speaker}: ")
            previous_speaker = speaker

        # No matter what, write the current sentence
        f.write(sentence + " ")


def format_timestamp(
    milliseconds: float, always_include_hours: bool = True, decimal_marker: str = ","
):
    assert milliseconds >= 0, "non-negative timestamp expected"

    hours = milliseconds // 3_600_000
    milliseconds -= hours * 3_600_000

    minutes = milliseconds // 60_000
    milliseconds -= minutes * 60_000

    seconds = milliseconds // 1_000
    milliseconds -= seconds * 1_000

    hours_marker = f"{hours:02d}:" if always_include_hours or hours > 0 else ""
    return f"{hours_marker}{minutes:02d}:{seconds:02d}{decimal_marker}{milliseconds:03d}"


def write_srt(transcript, file):
    """
    Write a transcript to a file in SRT format.

    """
    for i, segment in enumerate(transcript, start=1):
        # write srt lines
        print(
            f"{i}\n"
            f"{format_timestamp(segment['start_time'])} --> "
            f"{format_timestamp(segment['end_time'])}\n"
            f"{segment['speaker']}: {segment['text'].strip().replace('-->', '->')}\n",
            file=file,
            flush=True,
        )


def find_numeral_symbol_tokens(tokenizer):
    numeral_symbol_tokens = [
        -1,
    ]
    for token, token_id in tokenizer.get_vocab().items():
        has_numeral_symbol = any(c in "0123456789%$£" for c in token)
        if has_numeral_symbol:
            numeral_symbol_tokens.append(token_id)
    return numeral_symbol_tokens


def _get_next_start_timestamp(word_timestamps, current_word_index, final_timestamp):
    # if current word is the last word
    if current_word_index == len(word_timestamps) - 1:
        return word_timestamps[current_word_index]["start"]

    next_word_index = current_word_index + 1
    while current_word_index < len(word_timestamps) - 1:
        if word_timestamps[next_word_index].get("start") is None:
            # if next word doesn't have a start timestamp
            # merge it with the current word and delete it
            word_timestamps[current_word_index]["word"] += (
                " " + word_timestamps[next_word_index]["word"]
            )

            word_timestamps[next_word_index]["word"] = None
            next_word_index += 1
            if next_word_index == len(word_timestamps):
                return final_timestamp

        else:
            return word_timestamps[next_word_index]["start"]


def filter_missing_timestamps(word_timestamps, initial_timestamp=0, final_timestamp=None):
    # handle the first and last word
    if word_timestamps[0].get("start") is None:
        word_timestamps[0]["start"] = initial_timestamp if initial_timestamp is not None else 0
        word_timestamps[0]["end"] = _get_next_start_timestamp(word_timestamps, 0, final_timestamp)

    result = [
        word_timestamps[0],
    ]

    for i, ws in enumerate(word_timestamps[1:], start=1):
        # if ws doesn't have a start and end
        # use the previous end as start and next start as end
        if ws.get("start") is None and ws.get("word") is not None:
            ws["start"] = word_timestamps[i - 1]["end"]
            ws["end"] = _get_next_start_timestamp(word_timestamps, i, final_timestamp)

        if ws["word"] is not None:
            result.append(ws)
    return result


def cleanup(path: str):
    """path could either be relative or absolute."""
    # check if file or directory exists
    if os.path.isfile(path) or os.path.islink(path):
        # remove file
        os.remove(path)
    elif os.path.isdir(path):
        # remove directory and all its content
        shutil.rmtree(path)
    else:
        raise ValueError(f"Path {path} is not a file or dir.")


def process_language_arg(language: str, model_name: str):
    """
    Process the language argument to make sure it's valid
    and convert language names to language codes.
    """
    if language is not None:
        language = language.lower()
        if language not in LANGUAGES:
            if language in TO_LANGUAGE_CODE:
                language = TO_LANGUAGE_CODE[language]
            else:
                raise ValueError(f"Unsupported language: {language}")

        if model_name.endswith(".en") and language != "en":
            raise ValueError(
                f"{model_name} is an English-only model but choosen language is '{language}'"
            )

    return language
