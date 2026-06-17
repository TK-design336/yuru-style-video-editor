import type { Speaker } from "@/lib/schema/transcript";

/** 文字起こしの話者選択用（メタ＋単語列に出現する ID） */
export function buildSpeakerOptions(
  speakers: Speaker[],
  wordSpeakerIds: Iterable<string>,
): Speaker[] {
  const byId = new Map(speakers.map((s) => [s.id, s]));
  for (const id of wordSpeakerIds) {
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        label: id,
        role: "",
        attributes: "",
        position: "center",
        color: "#9E9E9E",
      });
    }
  }
  return [...byId.values()];
}

/** 話者リスト内で次の話者 ID に循環（3人以上でも順番に切り替え） */
export function cycleSpeakerId(
  currentSpeakerId: string,
  speakers: Speaker[],
): string {
  if (speakers.length <= 1) return currentSpeakerId;
  const index = speakers.findIndex((s) => s.id === currentSpeakerId);
  const nextIndex = index < 0 ? 0 : (index + 1) % speakers.length;
  return speakers[nextIndex]!.id;
}
