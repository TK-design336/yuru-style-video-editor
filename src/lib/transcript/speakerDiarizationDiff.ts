import type { SpeakerDiarizationUtterance } from "@/lib/ai/prompts/speakerDiarization";
import type { Utterance } from "@/lib/transcript/utterances";

export type SpeakerDiarizationChangeType =
  | "speaker_change"
  | "split"
  | "merge"
  | "restructure";

export type SpeakerDiarizationChangeStatus =
  | "pending"
  | "rejected"
  | "applied";

export interface SpeakerDiarizationSegment {
  speaker: string;
  text: string;
}

export interface SpeakerDiarizationChange {
  id: string;
  type: SpeakerDiarizationChangeType;
  originalIndices: number[];
  /** 対象発話の word id（適用後のインデックス解決用） */
  anchorWordIds: string[];
  /** 適用後に生成された word id（戻す操作用） */
  appliedWordIds?: string[];
  original: SpeakerDiarizationSegment[];
  corrected: SpeakerDiarizationSegment[];
  status: SpeakerDiarizationChangeStatus;
}

export function normalizeUtteranceText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function classifyChange(
  original: SpeakerDiarizationSegment[],
  corrected: SpeakerDiarizationSegment[],
): SpeakerDiarizationChangeType {
  if (original.length === 1 && corrected.length === 1) {
    return "speaker_change";
  }
  if (original.length === 1 && corrected.length > 1) {
    return "split";
  }
  if (original.length > 1 && corrected.length === 1) {
    return "merge";
  }
  return "restructure";
}

function segmentsEqual(
  a: SpeakerDiarizationSegment[],
  b: SpeakerDiarizationSegment[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (seg, i) =>
      seg.speaker === b[i]!.speaker &&
      normalizeUtteranceText(seg.text) === normalizeUtteranceText(b[i]!.text),
  );
}

interface AlignmentOp {
  originalIndices: number[];
  correctedIndices: number[];
}

/**
 * テキスト一致を基準に LCS で整列し、差分ブロックを変更候補に変換する。
 */
function alignUtterances(
  original: Utterance[],
  corrected: SpeakerDiarizationUtterance[],
): AlignmentOp[] {
  const n = original.length;
  const m = corrected.length;

  const origText = original.map((u) => normalizeUtteranceText(u.text));
  const corrText = corrected.map((u) => normalizeUtteranceText(u.text));

  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(0),
  );

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (origText[i - 1] === corrText[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  const matchedPairs: { o: number; c: number }[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (origText[i - 1] === corrText[j - 1]) {
      matchedPairs.unshift({ o: i - 1, c: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
      i--;
    } else {
      j--;
    }
  }

  const ops: AlignmentOp[] = [];
  let oCursor = 0;
  let cCursor = 0;

  for (const pair of matchedPairs) {
    if (oCursor < pair.o || cCursor < pair.c) {
      const origIndices: number[] = [];
      const corrIndices: number[] = [];
      while (oCursor < pair.o) {
        origIndices.push(oCursor);
        oCursor++;
      }
      while (cCursor < pair.c) {
        corrIndices.push(cCursor);
        cCursor++;
      }
      if (origIndices.length > 0 || corrIndices.length > 0) {
        ops.push({ originalIndices: origIndices, correctedIndices: corrIndices });
      }
    }

    const orig = original[pair.o]!;
    const corr = corrected[pair.c]!;
    if (
      orig.speaker !== corr.speaker ||
      normalizeUtteranceText(orig.text) !== normalizeUtteranceText(corr.text)
    ) {
      ops.push({
        originalIndices: [pair.o],
        correctedIndices: [pair.c],
      });
    }

    oCursor = pair.o + 1;
    cCursor = pair.c + 1;
  }

  if (oCursor < n || cCursor < m) {
    const origIndices: number[] = [];
    const corrIndices: number[] = [];
    while (oCursor < n) {
      origIndices.push(oCursor);
      oCursor++;
    }
    while (cCursor < m) {
      corrIndices.push(cCursor);
      cCursor++;
    }
    if (origIndices.length > 0 || corrIndices.length > 0) {
      ops.push({ originalIndices: origIndices, correctedIndices: corrIndices });
    }
  }

  return ops;
}

function mergeAdjacentOps(ops: AlignmentOp[]): AlignmentOp[] {
  if (ops.length === 0) return [];

  const merged: AlignmentOp[] = [{ ...ops[0]!, originalIndices: [...ops[0]!.originalIndices], correctedIndices: [...ops[0]!.correctedIndices] }];

  for (let k = 1; k < ops.length; k++) {
    const prev = merged[merged.length - 1]!;
    const curr = ops[k]!;

    const prevMaxO =
      prev.originalIndices.length > 0
        ? Math.max(...prev.originalIndices)
        : -1;
    const currMinO =
      curr.originalIndices.length > 0
        ? Math.min(...curr.originalIndices)
        : Infinity;

    if (currMinO <= prevMaxO + 1) {
      prev.originalIndices.push(...curr.originalIndices);
      prev.correctedIndices.push(...curr.correctedIndices);
    } else {
      merged.push({
        originalIndices: [...curr.originalIndices],
        correctedIndices: [...curr.correctedIndices],
      });
    }
  }

  return merged;
}

export function computeSpeakerDiarizationDiff(
  original: Utterance[],
  corrected: SpeakerDiarizationUtterance[],
): SpeakerDiarizationChange[] {
  const rawOps = alignUtterances(original, corrected);
  const ops = mergeAdjacentOps(rawOps);

  const changes: SpeakerDiarizationChange[] = [];

  for (let idx = 0; idx < ops.length; idx++) {
    const op = ops[idx]!;
    const origSegments: SpeakerDiarizationSegment[] = op.originalIndices.map(
      (i) => ({
        speaker: original[i]!.speaker,
        text: original[i]!.text,
      }),
    );
    const corrSegments: SpeakerDiarizationSegment[] = op.correctedIndices.map(
      (i) => ({
        speaker: corrected[i]!.speaker,
        text: corrected[i]!.text,
      }),
    );

    if (segmentsEqual(origSegments, corrSegments)) continue;

    changes.push({
      id: `spk_fix_${idx}`,
      type: classifyChange(origSegments, corrSegments),
      originalIndices: [...op.originalIndices],
      anchorWordIds: op.originalIndices.flatMap((i) => original[i]!.word_ids),
      original: origSegments,
      corrected: corrSegments,
      status: "pending",
    });
  }

  return changes;
}

export const CHANGE_TYPE_LABELS: Record<SpeakerDiarizationChangeType, string> = {
  speaker_change: "話者変更",
  split: "発話分割",
  merge: "発話結合",
  restructure: "話者・区切りの再構成",
};
