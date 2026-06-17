import type { Word } from "@/lib/schema/transcript";

/** 文字位置の比率で区間内の時刻（ms）を算出 */
export function msAtCharRatio(
  startMs: number,
  endMs: number,
  charOffset: number,
  totalChars: number,
): number {
  if (totalChars <= 0 || endMs <= startMs) return startMs;
  const ratio = Math.max(0, Math.min(1, charOffset / totalChars));
  return Math.round(startMs + (endMs - startMs) * ratio);
}

/** 各単語の text 長に比例して start/end を再配分 */
export function redistributeWordsByCharLength(
  words: Word[],
  startMs: number,
  endMs: number,
): Word[] {
  if (words.length === 0) return words;
  if (words.length === 1) {
    return [{ ...words[0]!, start_ms: startMs, end_ms: Math.max(startMs, endMs) }];
  }

  const lengths = words.map((w) => Math.max(1, w.text.length));
  const totalChars = lengths.reduce((a, b) => a + b, 0);
  const duration = Math.max(0, endMs - startMs);
  let charPos = 0;

  return words.map((word, i) => {
    const segStart = Math.round(startMs + (duration * charPos) / totalChars);
    charPos += lengths[i]!;
    const segEnd =
      i === words.length - 1
        ? endMs
        : Math.round(startMs + (duration * charPos) / totalChars);
    return {
      ...word,
      start_ms: segStart,
      end_ms: Math.max(segStart, segEnd),
    };
  });
}
