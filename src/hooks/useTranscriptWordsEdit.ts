import { useCallback, useEffect, useRef, useState } from "react";
import type { Word } from "@/lib/schema/transcript";
import { useProjectStore } from "@/store/projectStore";

const MAX_HISTORY = 80;

function cloneWords(words: Word[]): Word[] {
  return structuredClone(words);
}

export function useTranscriptWordsEdit() {
  const project = useProjectStore((s) => s.project);
  const words = project?.words ?? [];
  const setWords = useProjectStore((s) => s.setWords);
  const pastRef = useRef<Word[][]>([]);
  const futureRef = useRef<Word[][]>([]);
  const [historyTick, setHistoryTick] = useState(0);

  const bumpHistory = useCallback(() => {
    setHistoryTick((n) => n + 1);
  }, []);

  const resetHistory = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    bumpHistory();
  }, [bumpHistory]);

  useEffect(() => {
    resetHistory();
  }, [project?.meta.source_video_path, project?.meta.created_at, resetHistory]);

  const pushWords = useCallback(
    (next: Word[]) => {
      pastRef.current.push(cloneWords(words));
      if (pastRef.current.length > MAX_HISTORY) {
        pastRef.current.shift();
      }
      futureRef.current = [];
      setWords(next);
      bumpHistory();
    },
    [setWords, words, bumpHistory],
  );

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(cloneWords(words));
    setWords(prev);
    bumpHistory();
  }, [setWords, words, bumpHistory]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(cloneWords(words));
    setWords(next);
    bumpHistory();
  }, [setWords, words, bumpHistory]);

  void historyTick;

  return {
    pushWords,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    resetHistory,
  };
}
