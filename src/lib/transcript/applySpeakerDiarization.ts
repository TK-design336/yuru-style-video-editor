import type { Speaker, Word } from "@/lib/schema/transcript";
import { buildUtterances } from "@/lib/transcript/utterances";
import type {
  SpeakerDiarizationChange,
  SpeakerDiarizationSegment,
} from "@/lib/transcript/speakerDiarizationDiff";

function newWordId(): string {
  return `w_spkfix_${crypto.randomUUID()}`;
}

function distributeTiming(
  startMs: number,
  endMs: number,
  texts: string[],
): { start_ms: number; end_ms: number }[] {
  const totalChars = texts.reduce((sum, t) => sum + Math.max(1, t.length), 0);
  const duration = Math.max(1, endMs - startMs);
  const result: { start_ms: number; end_ms: number }[] = [];
  let cursor = startMs;

  for (let i = 0; i < texts.length; i++) {
    const weight = Math.max(1, texts[i]!.length) / totalChars;
    const segDuration =
      i === texts.length - 1
        ? endMs - cursor
        : Math.round(duration * weight);
    const segEnd = i === texts.length - 1 ? endMs : cursor + segDuration;
    result.push({ start_ms: cursor, end_ms: Math.max(cursor, segEnd) });
    cursor = segEnd;
  }

  return result;
}

function wordsFromUtteranceList(
  utteranceData: {
    speaker: string;
    text: string;
    start_ms: number;
    end_ms: number;
    baseWord?: Word;
  }[],
): Word[] {
  return utteranceData.map((utt, i) => {
    const base = utt.baseWord;
    const isLast = i === utteranceData.length - 1;
    return {
      id: base?.id ?? newWordId(),
      speaker: utt.speaker,
      text: utt.text,
      start_ms: utt.start_ms,
      end_ms: utt.end_ms,
      confidence: base?.confidence ?? 1,
      correction: base?.correction ?? null,
      utterance_break_after: !isLast,
    };
  });
}

function resolveUtteranceRange(
  utterances: ReturnType<typeof buildUtterances>,
  wordIds: string[],
): { startIdx: number; endIdx: number } | null {
  if (wordIds.length === 0) return null;

  const idSet = new Set(wordIds);
  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < utterances.length; i++) {
    const utt = utterances[i]!;
    if (utt.word_ids.some((id) => idSet.has(id))) {
      if (startIdx === -1) startIdx = i;
      endIdx = i;
    }
  }

  if (startIdx === -1) {
    const anchorId = wordIds[0]!;
    for (let i = 0; i < utterances.length; i++) {
      if (utterances[i]!.word_ids.includes(anchorId)) {
        return { startIdx: i, endIdx: i };
      }
    }
    return null;
  }

  return { startIdx, endIdx };
}

function replaceUtteranceRange(
  words: Word[],
  speakers: Speaker[],
  targetWordIds: string[],
  segments: SpeakerDiarizationSegment[],
): { words: Word[]; resultWordIds: string[] } | null {
  const utterances = buildUtterances(words, speakers);
  const range = resolveUtteranceRange(utterances, targetWordIds);
  if (!range) return null;

  const affected = utterances.slice(range.startIdx, range.endIdx + 1);
  if (affected.length === 0) return null;

  const timeStart = affected[0]!.start_ms;
  const timeEnd = affected[affected.length - 1]!.end_ms;
  const baseWord = words.find((w) => w.id === affected[0]!.word_ids[0]);

  const timings = distributeTiming(
    timeStart,
    timeEnd,
    segments.map((s) => s.text),
  );

  const replacementUtterances = segments.map((seg, i) => ({
    speaker: seg.speaker,
    text: seg.text,
    start_ms: timings[i]!.start_ms,
    end_ms: timings[i]!.end_ms,
    baseWord: i === 0 ? baseWord : undefined,
  }));

  const newWords = wordsFromUtteranceList(replacementUtterances);
  const removeIds = new Set(affected.flatMap((u) => u.word_ids));
  const firstWordId = affected[0]!.word_ids[0];
  const filtered = words.filter((w) => !removeIds.has(w.id));

  let insertAt = 0;
  for (const w of words) {
    if (w.id === firstWordId) break;
    if (!removeIds.has(w.id)) insertAt++;
  }

  return {
    words: [
      ...filtered.slice(0, insertAt),
      ...newWords,
      ...filtered.slice(insertAt),
    ],
    resultWordIds: newWords.map((w) => w.id),
  };
}

export interface ApplySingleChangeResult {
  words: Word[];
  appliedWordIds: string[];
}

/**
 * 単一の話者修正を words に即時適用する。
 */
export function applySingleSpeakerDiarizationChange(
  words: Word[],
  speakers: Speaker[],
  change: SpeakerDiarizationChange,
): ApplySingleChangeResult | null {
  const targetIds =
    change.status === "applied" && change.appliedWordIds
      ? change.appliedWordIds
      : change.anchorWordIds;

  const result = replaceUtteranceRange(
    words,
    speakers,
    targetIds,
    change.corrected,
  );
  if (!result) return null;

  return {
    words: result.words,
    appliedWordIds: result.resultWordIds,
  };
}

/**
 * 適用済みの話者修正を元に戻す。
 */
export function revertSingleSpeakerDiarizationChange(
  words: Word[],
  speakers: Speaker[],
  change: SpeakerDiarizationChange,
): Word[] | null {
  if (!change.appliedWordIds || change.appliedWordIds.length === 0) {
    return null;
  }

  const result = replaceUtteranceRange(
    words,
    speakers,
    change.appliedWordIds,
    change.original,
  );
  return result?.words ?? null;
}
