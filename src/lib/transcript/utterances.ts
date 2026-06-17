import type { Speaker, Word } from "@/lib/schema/transcript";

export interface Utterance {
  id: string;
  speaker: string;
  speakerLabel: string;
  speakerColor: string;
  start_ms: number;
  end_ms: number;
  word_ids: string[];
  text: string;
  hasCorrection: boolean;
  hasPendingCorrection: boolean;
}

/** 単語間にスペースを入れる無音のしきい値 */
const WORD_GAP_SPACE_MS = 350;

const FALLBACK_COLORS = [
  "#4FC3F7",
  "#F48FB1",
  "#AED581",
  "#FFB74D",
] as const;

function speakerColor(speakers: Speaker[], speakerId: string): string {
  const found = speakers.find((s) => s.id === speakerId);
  if (found?.color) return found.color;
  const index = speakers.findIndex((s) => s.id === speakerId);
  const paletteIndex = index >= 0 ? index % FALLBACK_COLORS.length : 0;
  return FALLBACK_COLORS[paletteIndex] ?? FALLBACK_COLORS[0];
}

function newUtterance(speakers: Speaker[], word: Word): Utterance {
  const labelMap = new Map(speakers.map((s) => [s.id, s.label]));
  const pending = word.correction !== null && !word.correction.approved;
  return {
    id: `utt_${word.id}`,
    speaker: word.speaker,
    speakerLabel: labelMap.get(word.speaker) ?? word.speaker,
    speakerColor: speakerColor(speakers, word.speaker),
    start_ms: word.start_ms,
    end_ms: word.end_ms,
    word_ids: [word.id],
    text: word.text,
    hasCorrection: word.correction !== null,
    hasPendingCorrection: pending,
  };
}

function appendWord(utterance: Utterance, word: Word, gapMs: number): void {
  utterance.end_ms = word.end_ms;
  utterance.word_ids.push(word.id);
  utterance.text += gapMs >= WORD_GAP_SPACE_MS ? ` ${word.text}` : word.text;
  if (word.correction) {
    utterance.hasCorrection = true;
    if (!word.correction.approved) {
      utterance.hasPendingCorrection = true;
    }
  }
}

export function buildUtterances(
  words: Word[],
  speakers: Speaker[],
): Utterance[] {
  const utterances: Utterance[] = [];
  let current: Utterance | null = null;
  let lastEndMs = 0;

  let lastWord: Word | null = null;

  for (const word of words) {
    const gapMs = current ? word.start_ms - lastEndMs : 0;
    const newBlock =
      !current ||
      current.speaker !== word.speaker ||
      Boolean(lastWord?.utterance_break_after);

    if (newBlock) {
      if (current) utterances.push(current);
      current = newUtterance(speakers, word);
    } else if (current) {
      appendWord(current, word, gapMs);
    }

    lastEndMs = word.end_ms;
    lastWord = word;
  }

  if (current) utterances.push(current);
  return utterances;
}

/** 指定時刻に該当する発話を返す（該当なしは null） */
export function findUtteranceAtTime(
  utterances: Utterance[],
  timeMs: number,
): Utterance | null {
  for (const utt of utterances) {
    if (timeMs >= utt.start_ms && timeMs <= utt.end_ms) {
      return utt;
    }
  }
  return null;
}

/** 指定時刻に該当する発話のインデックス（該当なしは -1） */
export function findUtteranceIndexAtTime(
  utterances: Utterance[],
  timeMs: number,
): number {
  for (let i = 0; i < utterances.length; i++) {
    const utt = utterances[i]!;
    if (timeMs >= utt.start_ms && timeMs <= utt.end_ms) {
      return i;
    }
  }
  return -1;
}
