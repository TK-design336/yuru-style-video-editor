import type { PartSeparationItem } from "@/lib/ai/prompts/partSeparation";
import type { Part, Word } from "@/lib/schema/transcript";

export const MIN_PART_DURATION_MS = 5000;

export const PART_TYPE_COLORS: Record<
  Part["type"],
  { bg: string; border: string; label: string }
> = {
  main: {
    bg: "bg-blue-500/35",
    border: "border-blue-400/70",
    label: "本筋",
  },
  tangent: {
    bg: "bg-yellow-500/35",
    border: "border-yellow-400/70",
    label: "脱線",
  },
  reaction: {
    bg: "bg-green-500/35",
    border: "border-green-400/70",
    label: "リアクション",
  },
  transition: {
    bg: "bg-gray-500/40",
    border: "border-gray-400/60",
    label: "転換",
  },
};

export const PART_TYPE_LABELS: Record<Part["type"], string> = {
  main: "本筋 (main)",
  tangent: "脱線 (tangent)",
  reaction: "リアクション (reaction)",
  transition: "転換 (transition)",
};

/** 最も近い word 境界（各 word の start_ms / end_ms）にスナップ */
export function snapToNearestWordBoundary(ms: number, words: Word[]): number {
  if (words.length === 0) return Math.max(0, Math.round(ms));

  let best = words[0]!.start_ms;
  let bestDist = Math.abs(ms - best);

  for (const word of words) {
    for (const boundary of [word.start_ms, word.end_ms]) {
      const dist = Math.abs(ms - boundary);
      if (dist < bestDist) {
        bestDist = dist;
        best = boundary;
      }
    }
  }

  return best;
}

function wordIndex(words: Word[], wordId: string): number {
  return words.findIndex((w) => w.id === wordId);
}

export function wordIdsBetween(
  words: Word[],
  startWordId: string,
  endWordId: string,
): string[] {
  const startIdx = wordIndex(words, startWordId);
  const endIdx = wordIndex(words, endWordId);
  if (startIdx < 0 || endIdx < 0) return [];

  const lo = Math.min(startIdx, endIdx);
  const hi = Math.max(startIdx, endIdx);
  return words.slice(lo, hi + 1).map((w) => w.id);
}

export function wordIdsInTimeRange(
  words: Word[],
  startMs: number,
  endMs: number,
): string[] {
  return words
    .filter((w) => w.end_ms > startMs && w.start_ms < endMs)
    .map((w) => w.id);
}

function timingFromWordIds(words: Word[], wordIds: string[]): {
  start_ms: number;
  end_ms: number;
} {
  const selected = words.filter((w) => wordIds.includes(w.id));
  if (selected.length === 0) {
    return { start_ms: 0, end_ms: 0 };
  }
  return {
    start_ms: selected[0]!.start_ms,
    end_ms: selected[selected.length - 1]!.end_ms,
  };
}

function nextPartId(existing: Part[]): string {
  const nums = existing
    .flatMap((p) => [p.id, ...p.sub_parts.map((s) => s.id)])
    .map((id) => {
      const match = id.match(/(\d+)$/);
      return match ? Number.parseInt(match[1]!, 10) : 0;
    });
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `part_${String(max + 1).padStart(3, "0")}`;
}

function createPartFromWordIds(
  words: Word[],
  wordIds: string[],
  type: Part["type"],
  titleDraft: string,
  id: string,
): Part {
  const { start_ms, end_ms } = timingFromWordIds(words, wordIds);
  return {
    id,
    type,
    start_ms,
    end_ms,
    word_ids: wordIds,
    title_draft: titleDraft,
    trim: false,
    sub_parts: [],
  };
}

export function aiPartsToParts(
  words: Word[],
  items: PartSeparationItem[],
): Part[] {
  const parts: Part[] = [];

  for (const item of items) {
    const wordIds = wordIdsBetween(words, item.start_word_id, item.end_word_id);
    if (wordIds.length === 0) continue;

    parts.push(
      createPartFromWordIds(
        words,
        wordIds,
        item.type,
        item.title_draft,
        nextPartId([...parts]),
      ),
    );
  }

  return normalizeAdjacentParts(parts, words);
}

function normalizeAdjacentParts(parts: Part[], words: Word[]): Part[] {
  if (parts.length <= 1) return parts;

  const sorted = [...parts].sort((a, b) => a.start_ms - b.start_ms);
  const result: Part[] = [];

  for (const part of sorted) {
    const prev = result[result.length - 1];
    if (
      prev &&
      part.end_ms - part.start_ms < MIN_PART_DURATION_MS &&
      prev.end_ms - prev.start_ms < MIN_PART_DURATION_MS * 2
    ) {
      const mergedIds = [...prev.word_ids, ...part.word_ids];
      const uniqueIds = [...new Set(mergedIds)];
      const timing = timingFromWordIds(words, uniqueIds);
      result[result.length - 1] = {
        ...prev,
        end_ms: timing.end_ms,
        word_ids: uniqueIds,
        title_draft: prev.title_draft || part.title_draft,
      };
    } else {
      result.push(part);
    }
  }

  return result;
}

function rebuildPartTiming(part: Part, words: Word[]): Part {
  const wordIds =
    part.word_ids.length > 0
      ? part.word_ids
      : wordIdsInTimeRange(words, part.start_ms, part.end_ms);
  const timing = timingFromWordIds(words, wordIds);
  return {
    ...part,
    word_ids: wordIds,
    start_ms: timing.start_ms,
    end_ms: timing.end_ms,
    sub_parts: part.sub_parts.map((sp) => rebuildPartTiming(sp, words)),
  };
}

/** 隣接 Part の境界を更新（最小幅・word 境界スナップ適用） */
export function updatePartBoundary(
  parts: Part[],
  partId: string,
  side: "start" | "end",
  rawMs: number,
  words: Word[],
): Part[] | null {
  const index = parts.findIndex((p) => p.id === partId);
  if (index < 0) return null;

  const snapped = snapToNearestWordBoundary(rawMs, words);
  const current = parts[index]!;
  const next = [...parts];

  if (side === "end") {
    if (index >= parts.length - 1) return null;
    const right = parts[index + 1]!;
    if (snapped <= current.start_ms + MIN_PART_DURATION_MS) return null;
    if (right.end_ms - snapped < MIN_PART_DURATION_MS) return null;

    const leftWordIds = wordIdsInTimeRange(words, current.start_ms, snapped);
    const rightWordIds = wordIdsInTimeRange(words, snapped, right.end_ms);

    next[index] = rebuildPartTiming(
      { ...current, end_ms: snapped, word_ids: leftWordIds },
      words,
    );
    next[index + 1] = rebuildPartTiming(
      { ...right, start_ms: snapped, word_ids: rightWordIds },
      words,
    );
  } else {
    if (index <= 0) return null;
    const left = parts[index - 1]!;
    if (snapped >= current.end_ms - MIN_PART_DURATION_MS) return null;
    if (snapped - left.start_ms < MIN_PART_DURATION_MS) return null;

    const leftWordIds = wordIdsInTimeRange(words, left.start_ms, snapped);
    const rightWordIds = wordIdsInTimeRange(words, snapped, current.end_ms);

    next[index - 1] = rebuildPartTiming(
      { ...left, end_ms: snapped, word_ids: leftWordIds },
      words,
    );
    next[index] = rebuildPartTiming(
      { ...current, start_ms: snapped, word_ids: rightWordIds },
      words,
    );
  }

  return next;
}

export function changePartType(
  parts: Part[],
  partId: string,
  type: Part["type"],
): Part[] {
  return parts.map((p) => {
    if (p.id === partId) return { ...p, type };
    if (p.sub_parts.some((sp) => sp.id === partId)) {
      return {
        ...p,
        sub_parts: p.sub_parts.map((sp) =>
          sp.id === partId ? { ...sp, type } : sp,
        ),
      };
    }
    return p;
  });
}

function splitPartAtMs(
  part: Part,
  splitMs: number,
  words: Word[],
  idGen: () => string,
): Part | null {
  const snapped = snapToNearestWordBoundary(splitMs, words);
  if (snapped <= part.start_ms + MIN_PART_DURATION_MS) return null;
  if (part.end_ms - snapped < MIN_PART_DURATION_MS) return null;

  const leftIds = wordIdsInTimeRange(words, part.start_ms, snapped);
  const rightIds = wordIdsInTimeRange(words, snapped, part.end_ms);
  if (leftIds.length === 0 || rightIds.length === 0) return null;

  const leftTiming = timingFromWordIds(words, leftIds);
  const rightTiming = timingFromWordIds(words, rightIds);

  const left: Part = {
    id: idGen(),
    type: part.type,
    start_ms: leftTiming.start_ms,
    end_ms: leftTiming.end_ms,
    word_ids: leftIds,
    title_draft: part.title_draft ? `${part.title_draft}（前）` : undefined,
    trim: false,
    sub_parts: [],
  };

  const right: Part = {
    id: idGen(),
    type: part.type,
    start_ms: rightTiming.start_ms,
    end_ms: rightTiming.end_ms,
    word_ids: rightIds,
    title_draft: part.title_draft ? `${part.title_draft}（後）` : undefined,
    trim: false,
    sub_parts: [],
  };

  return {
    ...part,
    sub_parts: [left, right],
  };
}

/** Part を playhead 位置で Sub-Part に分割 */
export function splitPartIntoSubParts(
  parts: Part[],
  partId: string,
  splitMs: number,
  words: Word[],
): Part[] | null {
  const ids: string[] = [];
  const idGen = () => {
    const id = nextPartId([
      ...parts,
      ...parts.flatMap((p) => p.sub_parts),
      ...ids.map((i) => ({ id: i }) as Part),
    ]);
    ids.push(id);
    return id;
  };

  return parts.map((part) => {
    if (part.id !== partId) return part;
    const split = splitPartAtMs(part, splitMs, words, idGen);
    return split ?? part;
  });
}
