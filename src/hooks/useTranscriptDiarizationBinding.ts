import { useCallback, useRef, useState } from "react";
import { useSpeakerDiarizationFix } from "@/hooks/useSpeakerDiarizationFix";
import type { SpeakerDiarizationChange } from "@/lib/transcript/speakerDiarizationDiff";
import { buildUtterances } from "@/lib/transcript/utterances";
import type { Speaker, Word } from "@/lib/schema/transcript";
import { useAiSettingsStore } from "@/store/aiSettingsStore";
import { showToast } from "@/store/toastStore";

export interface TranscriptDiarizationBinding {
  isRunning: boolean;
  changes: SpeakerDiarizationChange[];
  pendingCount: number;
  showReview: boolean;
  onAiFix: () => Promise<{ hasChanges: boolean }>;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRevert: (id: string) => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
  onNavigateToChange: (change: SpeakerDiarizationChange) => void;
  scrollToUtteranceIndex: { index: number; nonce: number } | null;
}

export function useTranscriptDiarizationBinding(
  words: Word[],
  speakers: Speaker[],
  onWordsChange: (words: Word[]) => void,
  onSeek?: (startMs: number) => void,
): TranscriptDiarizationBinding {
  const hasApiKey = useAiSettingsStore((s) => s.hasActiveProviderKey);
  const [scrollTarget, setScrollTarget] = useState<{
    index: number;
    nonce: number;
  } | null>(null);
  const scrollNonce = useRef(0);
  const {
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
  } = useSpeakerDiarizationFix();

  const onAiFix = useCallback(async (): Promise<{ hasChanges: boolean }> => {
    if (!hasApiKey) {
      showToast("AI API キーを設定してください", "error");
      return { hasChanges: false };
    }
    return runSpeakerFix(words, speakers);
  }, [hasApiKey, runSpeakerFix, words, speakers]);

  const onApprove = useCallback(
    (id: string) => {
      const next = approveChange(id, words, speakers);
      if (next) onWordsChange(next);
    },
    [approveChange, words, speakers, onWordsChange],
  );

  const onRevert = useCallback(
    (id: string) => {
      const next = revertChange(id, words, speakers);
      if (next) onWordsChange(next);
    },
    [revertChange, words, speakers, onWordsChange],
  );

  const onApproveAll = useCallback(() => {
    const next = approveAll(words, speakers);
    if (next) onWordsChange(next);
  }, [approveAll, words, speakers, onWordsChange]);

  const onNavigateToChange = useCallback(
    (change: SpeakerDiarizationChange) => {
      const utterances = buildUtterances(words, speakers);
      const lookupIds =
        change.status === "applied" && change.appliedWordIds
          ? change.appliedWordIds
          : change.anchorWordIds;

      let index = -1;
      if (lookupIds.length > 0) {
        const idSet = new Set(lookupIds);
        index = utterances.findIndex((u) =>
          u.word_ids.some((id) => idSet.has(id)),
        );
      }
      if (index < 0 && change.originalIndices[0] !== undefined) {
        index = change.originalIndices[0];
      }
      if (index < 0) return;

      const utterance = utterances[index];
      if (utterance && onSeek) {
        onSeek(utterance.start_ms);
      }

      scrollNonce.current += 1;
      setScrollTarget({ index, nonce: scrollNonce.current });
    },
    [words, speakers, onSeek],
  );

  return {
    isRunning,
    changes,
    pendingCount,
    showReview,
    onAiFix,
    onApprove,
    onReject: rejectChange,
    onRevert,
    onApproveAll,
    onRejectAll: rejectAll,
    onNavigateToChange,
    scrollToUtteranceIndex: scrollTarget,
  };
}
