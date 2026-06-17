import type { Speaker, Word } from "@/lib/schema/transcript";
import { buildUtterances, type Utterance } from "@/lib/transcript/utterances";
import { msAtCharRatio } from "@/lib/transcript/wordTiming";

function newWordId(): string {
  return `w_manual_${crypto.randomUUID()}`;
}

/** 1発話=1単語・ブロック間は必ず utterance_break_after で区切る */
function normalizeWords(words: Word[], speakers: Speaker[]): Word[] {
  const utterances = buildUtterances(words, speakers);
  return utterances.map((utt, i) => {
    const seg = words.filter((w) => utt.word_ids.includes(w.id));
    const base = seg[0];
    const isLast = i === utterances.length - 1;

    return {
      ...(base ?? {
        id: utt.word_ids[0] ?? newWordId(),
        confidence: 1,
        correction: null,
      }),
      id: base?.id ?? utt.word_ids[0] ?? newWordId(),
      speaker: utt.speaker,
      text: utt.text,
      start_ms: utt.start_ms,
      end_ms: utt.end_ms,
      confidence: base?.confidence ?? 1,
      correction: seg.find((w) => w.correction !== null)?.correction ?? null,
      utterance_break_after: !isLast,
    };
  });
}

function getUtterance(
  words: Word[],
  speakers: Speaker[],
  segmentKey: string,
): { utterance: Utterance; index: number } | null {
  const list = buildUtterances(words, speakers);
  const index = list.findIndex((u) => u.word_ids[0] === segmentKey);
  if (index < 0) return null;
  return { utterance: list[index]!, index };
}

function spliceSegment(
  words: Word[],
  segmentWordIds: string[],
  replacement: Word[],
): Word[] {
  const remove = new Set(segmentWordIds);
  const out: Word[] = [];
  let done = false;

  for (const w of words) {
    if (remove.has(w.id)) {
      if (!done) {
        out.push(...replacement);
        done = true;
      }
      continue;
    }
    out.push(w);
  }
  if (!done) out.push(...replacement);
  return out;
}

/** テキスト編集（blur 時） */
export function applyUtteranceTextChange(
  words: Word[],
  segmentKey: string,
  newText: string,
  speakers: Speaker[],
): Word[] {
  const hit = getUtterance(words, speakers, segmentKey);
  if (!hit || hit.utterance.text === newText) return words;

  const base = words.find((w) => w.id === segmentKey);
  if (!base) return words;

  return normalizeWords(
    spliceSegment(words, hit.utterance.word_ids, [{ ...base, text: newText }]),
    speakers,
  );
}

/** 分割先話者（必ず元話者と異なる） */
export function defaultSplitSpeakerId(
  currentSpeakerId: string,
  speakers: Speaker[],
): string | null {
  return speakers.find((s) => s.id !== currentSpeakerId)?.id ?? null;
}

export function setUtteranceSpeaker(
  words: Word[],
  segmentKey: string,
  speakerId: string,
  speakers: Speaker[],
): Word[] {
  const hit = getUtterance(words, speakers, segmentKey);
  if (!hit || hit.utterance.speaker === speakerId) return words;

  const next = words.map((w) =>
    hit.utterance.word_ids.includes(w.id) ? { ...w, speaker: speakerId } : w,
  );
  return normalizeWords(next, speakers);
}

/**
 * Enter 分割:
 * - 当該ブロックは cursor より前だけ残す（以降は削除）
 * - 削除した以降のテキストで、直後に別話者の新規ブロックを挿入
 */
export function splitUtteranceAtOffset(
  words: Word[],
  segmentKey: string,
  fullText: string,
  cursor: number,
  newSpeakerId: string,
  speakers: Speaker[],
): Word[] {
  const hit = getUtterance(words, speakers, segmentKey);
  if (!hit) return words;

  const base = words.find((w) => w.id === segmentKey);
  if (!base) return words;

  const pos = Math.max(0, Math.min(cursor, fullText.length));
  const headText = fullText.slice(0, pos);
  const tailText = fullText.slice(pos);

  if (!tailText) {
    return applyUtteranceTextChange(words, segmentKey, headText, speakers);
  }

  if (newSpeakerId === hit.utterance.speaker) return words;

  const start = hit.utterance.start_ms;
  const end = hit.utterance.end_ms;
  const splitMs = msAtCharRatio(start, end, pos, Math.max(1, fullText.length));

  const tailWord: Word = {
    ...base,
    id: newWordId(),
    text: tailText,
    speaker: newSpeakerId,
    start_ms: splitMs,
    end_ms: end,
    utterance_break_after: true,
  };

  const replacement: Word[] = [];
  if (headText) {
    replacement.push({
      ...base,
      text: headText,
      speaker: hit.utterance.speaker,
      start_ms: start,
      end_ms: Math.max(start, splitMs),
      utterance_break_after: true,
    });
  }
  replacement.push(tailWord);

  return normalizeWords(
    spliceSegment(words, hit.utterance.word_ids, replacement),
    speakers,
  );
}

/**
 * Backspace 先頭マージ:
 * - 当該ブロックを削除
 * - 中身を直前ブロックの末尾に追加
 */
export function mergeUtteranceWithPrevious(
  words: Word[],
  segmentKey: string,
  currentText: string,
  speakers: Speaker[],
): Word[] {
  const list = buildUtterances(words, speakers);
  const currIndex = list.findIndex((u) => u.word_ids[0] === segmentKey);
  if (currIndex <= 0) return words;

  const prev = list[currIndex - 1]!;
  const prevKey = prev.word_ids[0]!;
  const prevBase = words.find((w) => w.id === prevKey);
  if (!prevBase) return words;

  const curr = list[currIndex]!;
  const merged: Word = {
    ...prevBase,
    id: prevKey,
    text: prev.text + currentText,
    speaker: prev.speaker,
    start_ms: prev.start_ms,
    end_ms: curr.end_ms,
    utterance_break_after: prevBase.utterance_break_after,
  };

  const remove = new Set([...prev.word_ids, ...curr.word_ids]);
  const raw = words.filter((w) => !remove.has(w.id));
  const prevIdx = words.findIndex((w) => w.id === prevKey);
  const insertAt = prevIdx >= 0 ? prevIdx : raw.length;

  const next = [
    ...raw.slice(0, insertAt),
    merged,
    ...raw.slice(insertAt),
  ];

  return normalizeWords(next, speakers);
}

/** ブロック削除 */
export function deleteUtterance(
  words: Word[],
  segmentKey: string,
  speakers: Speaker[],
): Word[] {
  const hit = getUtterance(words, speakers, segmentKey);
  if (!hit) return words;

  return normalizeWords(
    words.filter((w) => !hit.utterance.word_ids.includes(w.id)),
    speakers,
  );
}
