import { useCallback, useState } from "react";
import { callAI } from "@/lib/ai/client";
import {
  buildSpeakerDiarizationPrompt,
  SpeakerDiarizationResponseSchema,
} from "@/lib/ai/prompts/speakerDiarization";
import {
  applySingleSpeakerDiarizationChange,
  revertSingleSpeakerDiarizationChange,
} from "@/lib/transcript/applySpeakerDiarization";
import {
  computeSpeakerDiarizationDiff,
  type SpeakerDiarizationChange,
} from "@/lib/transcript/speakerDiarizationDiff";
import { buildUtterances } from "@/lib/transcript/utterances";
import type { Speaker, Word } from "@/lib/schema/transcript";
import { showToast } from "@/store/toastStore";

function hasActiveReview(changes: SpeakerDiarizationChange[]): boolean {
  return changes.some(
    (c) => c.status === "pending" || c.status === "applied",
  );
}

function pruneIfAllRejected(
  changes: SpeakerDiarizationChange[],
): SpeakerDiarizationChange[] {
  return hasActiveReview(changes) ? changes : [];
}

export function useSpeakerDiarizationFix() {
  const [isRunning, setIsRunning] = useState(false);
  const [changes, setChanges] = useState<SpeakerDiarizationChange[]>([]);

  const pendingCount = changes.filter((c) => c.status === "pending").length;
  const showReview = hasActiveReview(changes);

  const clearChanges = useCallback(() => {
    setChanges([]);
  }, []);

  const runSpeakerFix = useCallback(
    async (
      words: Word[],
      speakers: Speaker[],
    ): Promise<{ ok: boolean; hasChanges: boolean }> => {
      if (words.length === 0) {
        showToast("修正対象のトランスクリプトがありません", "error");
        return { ok: false, hasChanges: false };
      }

      const utterances = buildUtterances(words, speakers);
      if (utterances.length === 0) {
        showToast("発話ブロックがありません", "error");
        return { ok: false, hasChanges: false };
      }

      setIsRunning(true);
      try {
        const result = await callAI(
          buildSpeakerDiarizationPrompt(utterances, speakers),
          SpeakerDiarizationResponseSchema,
          { maxTokens: 16384, logRawResponse: "speaker-diarization" },
        );
        if (!result) return { ok: false, hasChanges: false };

        const diff = computeSpeakerDiarizationDiff(
          utterances,
          result.utterances,
        );

        if (diff.length === 0) {
          showToast("話者割り振りの修正候補は見つかりませんでした", "info");
          setChanges([]);
          return { ok: true, hasChanges: false };
        }

        setChanges(diff);
        showToast(
          `話者修正候補 ${diff.length} 件を検出しました。内容を確認して承認してください。`,
          "success",
        );
        return { ok: true, hasChanges: true };
      } finally {
        setIsRunning(false);
      }
    },
    [],
  );

  const approveChange = useCallback(
    (
      id: string,
      words: Word[],
      speakers: Speaker[],
    ): Word[] | null => {
      const change = changes.find((c) => c.id === id);
      if (!change || change.status === "applied") return null;

      const result = applySingleSpeakerDiarizationChange(
        words,
        speakers,
        change,
      );
      if (!result) {
        showToast("修正の適用に失敗しました", "error");
        return null;
      }

      setChanges((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                status: "applied",
                appliedWordIds: result.appliedWordIds,
              }
            : c,
        ),
      );

      return result.words;
    },
    [changes],
  );

  const revertChange = useCallback(
    (
      id: string,
      words: Word[],
      speakers: Speaker[],
    ): Word[] | null => {
      const change = changes.find((c) => c.id === id);
      if (!change || change.status !== "applied") return null;

      const next = revertSingleSpeakerDiarizationChange(
        words,
        speakers,
        change,
      );
      if (!next) {
        showToast("修正の取り消しに失敗しました", "error");
        return null;
      }

      setChanges((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, status: "pending", appliedWordIds: undefined }
            : c,
        ),
      );

      return next;
    },
    [changes],
  );

  const rejectChange = useCallback((id: string) => {
    setChanges((prev) =>
      pruneIfAllRejected(
        prev.map((c) => (c.id === id ? { ...c, status: "rejected" } : c)),
      ),
    );
  }, []);

  const approveAll = useCallback(
    (words: Word[], speakers: Speaker[]): Word[] | null => {
      const pending = changes.filter((c) => c.status === "pending");
      if (pending.length === 0) return null;

      let current = words;
      const updated = new Map<string, SpeakerDiarizationChange>();

      for (const change of pending) {
        const result = applySingleSpeakerDiarizationChange(
          current,
          speakers,
          change,
        );
        if (!result) continue;
        current = result.words;
        updated.set(change.id, {
          ...change,
          status: "applied",
          appliedWordIds: result.appliedWordIds,
        });
      }

      if (updated.size === 0) return null;

      setChanges((prev) =>
        prev.map((c) => updated.get(c.id) ?? c),
      );

      return current;
    },
    [changes],
  );

  const rejectAll = useCallback(() => {
    clearChanges();
  }, [clearChanges]);

  return {
    isRunning,
    changes,
    pendingCount,
    showReview,
    runSpeakerFix,
    approveChange,
    revertChange,
    rejectChange,
    approveAll,
    rejectAll,
    clearChanges,
  };
}
