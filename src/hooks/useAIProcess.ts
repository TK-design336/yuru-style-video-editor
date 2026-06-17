import { useCallback, useState } from "react";
import { callAI } from "@/lib/ai/client";
import {
  buildCorrectionPrompt,
  CorrectionResponseSchema,
  type CorrectionResponse,
} from "@/lib/ai/prompts/correction";
import {
  buildPartSeparationPrompt,
  PartSeparationResponseSchema,
  type PartSeparationResponse,
} from "@/lib/ai/prompts/partSeparation";
import type { Correction, Word } from "@/lib/schema/transcript";
import { aiPartsToParts } from "@/lib/timeline/partEdit";
import { showToast } from "@/store/toastStore";
import { useProjectStore } from "@/store/projectStore";

function toWordCorrection(item: {
  original: string;
  fixed: string;
  type: Correction["type"];
  note: string;
}): Correction {
  return {
    original: item.original,
    fixed: item.fixed,
    type: item.type,
    note: item.note,
    approved: false,
  };
}

function applyCorrectionResults(
  words: Word[],
  items: CorrectionResponse["corrections"],
): Word[] {
  if (items.length === 0) return words;

  const byWordId = new Map(items.map((item) => [item.word_id, item]));

  return words.map((word) => {
    const item = byWordId.get(word.id);
    if (!item) return word;
    return {
      ...word,
      correction: toWordCorrection(item),
    };
  });
}

export function useAIProcess() {
  const project = useProjectStore((s) => s.project);
  const setWords = useProjectStore((s) => s.setWords);
  const setParts = useProjectStore((s) => s.setParts);
  const [isCorrectionRunning, setIsCorrectionRunning] = useState(false);
  const [isPartSeparationRunning, setIsPartSeparationRunning] = useState(false);

  const runCorrection = useCallback(async (): Promise<CorrectionResponse | null> => {
    if (!project) {
      showToast("プロジェクトが読み込まれていません", "error");
      return null;
    }
    if (project.words.length === 0) {
      showToast("校正対象のトランスクリプトがありません", "error");
      return null;
    }

    setIsCorrectionRunning(true);
    try {
      const result = await callAI(
        buildCorrectionPrompt(project.words),
        CorrectionResponseSchema,
        { logRawResponse: "correction" },
      );
      if (!result) return null;

      const nextWords = applyCorrectionResults(project.words, result.corrections);
      setWords(nextWords);

      if (result.corrections.length === 0) {
        showToast("修正候補は見つかりませんでした", "info");
      } else {
        showToast(
          `校正候補 ${result.corrections.length} 件を読み込みました`,
          "success",
        );
      }

      return result;
    } finally {
      setIsCorrectionRunning(false);
    }
  }, [project, setWords]);

  const runPartSeparation =
    useCallback(async (): Promise<PartSeparationResponse | null> => {
      if (!project) {
        showToast("プロジェクトが読み込まれていません", "error");
        return null;
      }
      if (project.words.length === 0) {
        showToast("分割対象のトランスクリプトがありません", "error");
        return null;
      }

      setIsPartSeparationRunning(true);
      try {
        const result = await callAI(
          buildPartSeparationPrompt(project.words, project.meta.speakers),
          PartSeparationResponseSchema,
          { logRawResponse: "part-separation" },
        );
        if (!result) return null;

        const parts = aiPartsToParts(project.words, result.parts);
        if (parts.length === 0) {
          showToast("有効な Part 分割結果が得られませんでした", "error");
          return null;
        }

        setParts(parts);
        showToast(`Part を ${parts.length} 件に分割しました`, "success");
        return result;
      } finally {
        setIsPartSeparationRunning(false);
      }
    }, [project, setParts]);

  return {
    runCorrection,
    isCorrectionRunning,
    runPartSeparation,
    isPartSeparationRunning,
  };
}
