import type {
  ProjectData,
  Speaker,
  SpeakerPosition,
  Word,
} from "@/lib/schema/transcript";
import {
  MAX_DETECTED_SPEAKERS,
  MAX_SPEAKERS,
} from "@/lib/schema/transcript";
import type { AppearFrom, TextAlign } from "@/lib/schema/style";

export { MAX_DETECTED_SPEAKERS, MAX_SPEAKERS };

export const SPEAKER_PALETTE = [
  "#4FC3F7",
  "#F48FB1",
  "#AED581",
  "#FFB74D",
  "#CE93D8",
  "#80CBC4",
  "#FFCC80",
  "#B39DDB",
  "#90CAF9",
  "#F06292",
  "#A5D6A7",
  "#FFAB91",
  "#9FA8DA",
  "#80DEEA",
  "#F48FB1",
] as const;

export const DEFAULT_SPEAKER_POSITIONS: SpeakerPosition[] = [
  "left",
  "center_left",
  "center_right",
  "right",
];

const POSITION_SLOTS: SpeakerPosition[] = [
  "left",
  "center_left",
  "center",
  "center_right",
  "right",
];

export function defaultPositionForSpeakerIndex(
  index: number,
  total: number,
): SpeakerPosition {
  if (total <= 1) return "center";
  if (total === 2) {
    return index === 0 ? "left" : "right";
  }
  if (total === 3) {
    return (["left", "center", "right"] as const)[index] ?? "center";
  }
  if (total === 4) {
    return DEFAULT_SPEAKER_POSITIONS[index] ?? "center";
  }
  return POSITION_SLOTS[index % POSITION_SLOTS.length] ?? "center";
}

export const SPEAKER_POSITION_LABELS: Record<SpeakerPosition, string> = {
  left: "左",
  center_left: "中央左",
  center: "中央",
  center_right: "中央右",
  right: "右",
};

export const SPEAKER_POSITION_OPTIONS = (
  Object.entries(SPEAKER_POSITION_LABELS) as [SpeakerPosition, string][]
).map(([value, label]) => ({ value, label }));

export function speakerPositionToStyle(position: SpeakerPosition): {
  h_align: TextAlign;
  appear_from: AppearFrom;
} {
  switch (position) {
    case "left":
      return { h_align: "left", appear_from: "left" };
    case "center_left":
      return { h_align: "center_left", appear_from: "center_left" };
    case "center":
      return { h_align: "center", appear_from: "speaker_side" };
    case "center_right":
      return { h_align: "center_right", appear_from: "center_right" };
    case "right":
      return { h_align: "right", appear_from: "right" };
  }
}

export function getFirstWordForSpeaker(
  words: Word[],
  speakerId: string,
): Word | undefined {
  return words
    .filter((w) => w.speaker === speakerId)
    .sort((a, b) => a.start_ms - b.start_ms)[0];
}

export function countWordsBySpeaker(
  words: Word[],
  speakerId: string,
): number {
  return words.filter((w) => w.speaker === speakerId).length;
}

export function syncStyleSpeakerOverride(
  speaker: Speaker,
  setOverride: (
    id: string,
    override: {
      h_align: TextAlign;
      padding_h: number;
      appear_from: AppearFrom;
    },
  ) => void,
): void {
  const { h_align, appear_from } = speakerPositionToStyle(speaker.position);
  setOverride(speaker.id, {
    h_align,
    padding_h: 40,
    appear_from,
  });
}

/** 単語の出現順で話者IDを列挙（WhisperX 生出力の順序を保持） */
export function speakerIdsByFirstAppearance(words: Word[]): string[] {
  const sorted = [...words].sort((a, b) => a.start_ms - b.start_ms);
  const order: string[] = [];
  const seen = new Set<string>();
  for (const word of sorted) {
    if (!seen.has(word.speaker)) {
      seen.add(word.speaker);
      order.push(word.speaker);
    }
  }
  return order;
}

export function createSpeakerStub(
  id: string,
  index: number,
  total: number,
  existing?: Partial<Speaker>,
): Speaker {
  const paletteColor =
    SPEAKER_PALETTE[index % SPEAKER_PALETTE.length] ?? SPEAKER_PALETTE[0];
  return {
    id,
    label: existing?.label ?? "",
    role: existing?.role ?? "",
    attributes: existing?.attributes ?? "",
    position:
      existing?.position ?? defaultPositionForSpeakerIndex(index, total),
    color: existing?.color ?? paletteColor,
  };
}

/**
 * words 内の全話者IDに対応するスタブを生成（words は一切変更しない）
 */
export function buildSpeakerStubsFromWords(
  words: Word[],
  existingSpeakers: Speaker[] = [],
): Speaker[] {
  const ids = speakerIdsByFirstAppearance(words);
  return ids.map((id, index) => {
    const existing = existingSpeakers.find((s) => s.id === id);
    return createSpeakerStub(id, index, ids.length, existing);
  });
}

/**
 * ⓪ WhisperX 完了直後: 単語列はそのまま、話者リストだけ words から同期
 */
export function syncSpeakersAfterTranscription(
  project: ProjectData,
): ProjectData {
  const allSpeakers = buildSpeakerStubsFromWords(
    project.words,
    project.meta.speakers,
  );
  const speakers = allSpeakers.slice(0, MAX_DETECTED_SPEAKERS);
  return {
    ...project,
    meta: { ...project.meta, speakers },
    words: project.words,
  };
}

/** UI 表示用: words に出現する全IDを必ず含める（遅い発言の話者も落とさない） */
export function resolveSpeakersForUi(project: ProjectData): Speaker[] {
  return buildSpeakerStubsFromWords(project.words, project.meta.speakers);
}

export function getTranscriptionStats(project: ProjectData): {
  wordCount: number;
  speakerIds: string[];
  exceedsDetectedLimit: boolean;
} {
  const speakerIds = speakerIdsByFirstAppearance(project.words);
  return {
    wordCount: project.words.length,
    speakerIds,
    exceedsDetectedLimit: speakerIds.length > MAX_DETECTED_SPEAKERS,
  };
}

/** @deprecated 互換 alias */
export function applySpeakersFromWords(project: ProjectData): {
  project: ProjectData;
  omittedSpeakerIds: string[];
} {
  const synced = syncSpeakersAfterTranscription(project);
  const ids = speakerIdsByFirstAppearance(project.words);
  return {
    project: synced,
    omittedSpeakerIds: ids.slice(MAX_DETECTED_SPEAKERS),
  };
}

export function hasTranscription(project: ProjectData | null): boolean {
  return (project?.words.length ?? 0) > 0;
}

export function allSpeakersLabeled(speakers: Speaker[]): boolean {
  return (
    speakers.length > 0 &&
    speakers.every((s) => s.label.trim().length > 0)
  );
}

export function isDetectedSpeakerCountValid(count: number): boolean {
  return count > 0 && count <= MAX_DETECTED_SPEAKERS;
}

export function isFinalSpeakerCountValid(count: number): boolean {
  return count > 0 && count <= MAX_SPEAKERS;
}

export function canCompleteSpeakerSetup(speakers: Speaker[]): boolean {
  return isFinalSpeakerCountValid(speakers.length) && allSpeakersLabeled(speakers);
}
