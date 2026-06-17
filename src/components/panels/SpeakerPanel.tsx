import { useEffect, useMemo, useState, type RefObject } from "react";
import type { Speaker, SpeakerPosition } from "@/lib/schema/transcript";
import {
  MAX_DETECTED_SPEAKERS,
  MAX_SPEAKERS,
} from "@/lib/schema/transcript";
import {
  canCompleteSpeakerSetup,
  countWordsBySpeaker,
  getFirstWordForSpeaker,
  isDetectedSpeakerCountValid,
  isFinalSpeakerCountValid,
  resolveSpeakersForUi,
  SPEAKER_POSITION_OPTIONS,
  syncStyleSpeakerOverride,
} from "@/lib/speakers";
import { useProjectStore } from "@/store/projectStore";
import { usePreviewStore } from "@/store/previewStore";
import { useStyleStore } from "@/store/styleStore";

const MSG = {
  pendingTranscription:
    "\u6587\u5b57\u8d77\u3053\u3057\u304c\u5b8c\u4e86\u3059\u308b\u3068\u3001\u8a71\u8005\u30e9\u30d9\u30eb\u306e\u7de8\u96c6\u304c\u3067\u304d\u307e\u3059\u3002",
  tooManyDetectedPrefix: "\u691c\u51fa\u8a71\u8005\u304c\u4e0a\u9650\uff08",
  tooManyDetectedSuffix:
    "\u4eba\uff09\u3092\u8d85\u3048\u3066\u3044\u307e\u3059\u3002\u30de\u30fc\u30b8\u3067\u6e1b\u3089\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
  title: "\u8a71\u8005\u30e9\u30d9\u30eb",
  detectedCountSuffix: "\u4eba\u691c\u51fa",
  targetPrefix: " / \u76ee\u6a19",
  targetSuffix: "\u4eba\u4ee5\u4e0b",
  introLine1:
    "\u2461 \u6b21\u306e\u64cd\u4f5c: WhisperX \u304c\u4ed8\u3051\u305f\u8a71\u8005ID\uff08\u5358\u8a9e\u306f\u3059\u307f\u4fdd\u5b58\u6e08\u307f\uff09\u3092",
  introLine2:
    "\u30de\u30fc\u30b8\u3057\u3066\u672c\u756a\u306e",
  introLine3:
    "\u4eba\u4ee5\u4e0b\u306b\u6574\u7406\u3057\u3001\u8868\u793a\u540d\u3068\u4f4d\u7f6e\u3092\u8a2d\u5b9a\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
  orphanWarning:
    "\u5358\u8a9e\u5217\u306b\u5b58\u5728\u3059\u308b\u8a71\u8005ID\u3092\u3059\u3079\u3066\u8868\u793a\u3057\u3066\u3044\u307e\u3059\uff08\u767a\u8a00\u304c\u9045\u3044\u8a71\u8005\u3082\u542b\u3080\uff09\u3002",
  mergeHintPrefix: "\u3042\u3068 ",
  mergeHintShortSuffix: "\u4eba\u5206\u8981\u30de\u30fc\u30b8",
  wordUnit: "\u8a9e",
  labelDisplayName: "\u8868\u793a\u540d",
  labelRole: "\u5f79\u5272",
  labelAttributes: "\u5c5e\u6027\u30fb\u7279\u5fb4",
  placeholderRole: "\u4f8b: \u30db\u30b9\u30c8\u3001\u30b2\u30b9\u30c8\u3001\u89e3\u8aac\u8005",
  placeholderAttributes:
    "\u4f8b: \u8cea\u554f\u3059\u308b\u5074\u3001\u6280\u8853\u7528\u8a9e\u304c\u591a\u3044\u3001\u30c4\u30c3\u30b3\u30df\u5f79\u3001\u8a9e\u5c3e\u306f\u300c\u3067\u3059\u300d\u8abf",
  labelPosition: "\u4f4d\u7f6e",
  labelColor: "\u8b58\u5225\u8272",
  preview: "\u8a66\u8074",
  previewWithTimePrefix: "\u8a66\u8074\uff08",
  previewWithTimeSuffix: "\uff5e\uff09",
  noSpeech: "\u767a\u8a00\u306a\u3057",
  mergeSection: "\u8a71\u8005\u3092\u30de\u30fc\u30b8",
  mergeDesc:
    "\u8aa4\u5206\u5272\u3055\u308c\u305f\u8a71\u8005\u30921\u4eba\u306b\u307e\u3068\u3081\u307e\u3059\uff08\u5de6\u306eID\u306e\u767a\u8a00\u306f\u53f3\u306eID\u306b\u7d71\u5408\u3055\u308c\u3001\u5de6\u306f\u524a\u9664\u3055\u308c\u307e\u3059\uff09\u3002",
  mergeFrom: "\u7d71\u5408\u5143\uff08\u524a\u9664\uff09",
  mergeTo: "\u7d71\u5408\u5148\uff08\u6b8b\u3059\uff09",
  selectPlaceholder: "\u9078\u629e\u2026",
  mergeExecute: "\u30de\u30fc\u30b8\u3092\u5b9f\u884c",
  complete: "\u8a71\u8005\u8a2d\u5b9a\u3092\u5b8c\u4e86\u3057\u3066\u6b21\u3078",
  hintMergeAndLabelPrefix:
    "\u30de\u30fc\u30b8\u3057\u3066",
  hintMergeAndLabelSuffix:
    "\u4eba\u4ee5\u4e0b\u306b\u3057\u3001\u5168\u54e1\u306e\u8868\u793a\u540d\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044",
  hintLabelAll: "\u5168\u8a71\u8005\u306e\u8868\u793a\u540d\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044",
  placeholderName: "\u4f8b: \u7530\u4e2d\uff08\u30db\u30b9\u30c8\uff09",
} as const;

interface SpeakerPanelProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  onComplete?: () => void;
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function SpeakerPanel({ videoRef, onComplete }: SpeakerPanelProps) {
  const project = useProjectStore((s) => s.project);
  const updateSpeaker = useProjectStore((s) => s.updateSpeaker);
  const mergeSpeakers = useProjectStore((s) => s.mergeSpeakers);
  const syncSpeakersFromWords = useProjectStore((s) => s.syncSpeakersFromWords);
  const lastError = useProjectStore((s) => s.lastError);
  const setSpeakerOverride = useStyleStore((s) => s.setSpeakerOverride);
  const removeSpeakerOverride = useStyleStore((s) => s.removeSpeakerOverride);
  const requestSeek = usePreviewStore((s) => s.requestSeek);

  const [mergeFromId, setMergeFromId] = useState("");
  const [mergeToId, setMergeToId] = useState("");

  const words = project?.words ?? [];

  useEffect(() => {
    if (words.length > 0) {
      syncSpeakersFromWords();
    }
  }, [words.length, syncSpeakersFromWords]);

  const speakers = useMemo(
    () => (project ? resolveSpeakersForUi(project) : []),
    [project],
  );

  const speakerStats = useMemo(
    () =>
      speakers.map((speaker) => ({
        speaker,
        wordCount: countWordsBySpeaker(words, speaker.id),
        firstWord: getFirstWordForSpeaker(words, speaker.id),
      })),
    [speakers, words],
  );

  if (!project || speakers.length === 0) {
    const hasWords = words.length > 0;
    return (
      <div
        className={`glass-panel p-6 text-sm ${
          hasWords
            ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
            : "text-white/60"
        }`}
      >
        {hasWords
          ? "単語データはありますが、話者ID一覧を表示できません。環境を再確認するか、文字起こしを再実行してください。"
          : MSG.pendingTranscription}
      </div>
    );
  }

  if (!isDetectedSpeakerCountValid(speakers.length)) {
    return (
      <div className="glass-panel border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">
        {MSG.tooManyDetectedPrefix}
        {MAX_DETECTED_SPEAKERS}
        {MSG.tooManyDetectedSuffix}
      </div>
    );
  }

  const needsMerge = speakers.length > MAX_SPEAKERS;

  const handlePositionChange = (speaker: Speaker, position: SpeakerPosition) => {
    updateSpeaker(speaker.id, { position });
    syncStyleSpeakerOverride({ ...speaker, position }, setSpeakerOverride);
  };

  const handlePreview = (speakerId: string) => {
    const first = getFirstWordForSpeaker(words, speakerId);
    if (!first) return;
    requestSeek(Math.max(0, first.start_ms - 200));
    const video = videoRef.current;
    if (video) {
      void video.play().catch(() => undefined);
    }
  };

  const handleMerge = () => {
    if (!mergeFromId || !mergeToId || mergeFromId === mergeToId) return;
    mergeSpeakers(mergeFromId, mergeToId);
    removeSpeakerOverride(mergeFromId);
    setMergeFromId("");
    setMergeToId("");
  };

  const canComplete = canCompleteSpeakerSetup(speakers);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <header className="shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-white">{MSG.title}</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] ${
              isFinalSpeakerCountValid(speakers.length)
                ? "bg-emerald-500/20 text-emerald-200"
                : "bg-amber-500/20 text-amber-200"
            }`}
          >
            {speakers.length}
            {MSG.detectedCountSuffix}
            {MSG.targetPrefix}
            {MAX_SPEAKERS}
            {MSG.targetSuffix}
          </span>
        </div>
        <details className="mt-0.5">
          <summary className="cursor-pointer text-[11px] text-white/45 hover:text-white/65">
            操作手順
          </summary>
          <p className="mt-1 text-[11px] leading-snug text-white/50">
            {MSG.introLine1}
            {MSG.introLine2}
            {MAX_SPEAKERS}
            {MSG.introLine3}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-white/40">
            {MSG.orphanWarning}
          </p>
        </details>
      </header>

      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
        {speakerStats.map(({ speaker, wordCount, firstWord }) => (
          <li
            key={speaker.id}
            className="glass-panel-raised shrink-0 p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span
                className="inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: `${speaker.color}22`,
                  color: speaker.color,
                  border: `1px solid ${speaker.color}55`,
                }}
              >
                {speaker.id}
              </span>
              <span className="text-xs text-white/50">
                {wordCount} {MSG.wordUnit}
              </span>
            </div>

            <label className="mb-2 block">
              <span className="mb-0.5 block text-xs text-white/50">
                {MSG.labelDisplayName}
              </span>
              <input
                type="text"
                value={speaker.label}
                placeholder={MSG.placeholderName}
                onChange={(e) =>
                  updateSpeaker(speaker.id, { label: e.target.value })
                }
                className="glass-input"
              />
            </label>

            <label className="mb-2 block">
              <span className="mb-0.5 block text-xs text-white/50">
                {MSG.labelRole}
              </span>
              <input
                type="text"
                value={speaker.role ?? ""}
                placeholder={MSG.placeholderRole}
                onChange={(e) =>
                  updateSpeaker(speaker.id, { role: e.target.value })
                }
                className="glass-input"
              />
            </label>

            <label className="mb-2 block">
              <span className="mb-0.5 block text-xs text-white/50">
                {MSG.labelAttributes}
              </span>
              <textarea
                value={speaker.attributes ?? ""}
                placeholder={MSG.placeholderAttributes}
                onChange={(e) =>
                  updateSpeaker(speaker.id, { attributes: e.target.value })
                }
                rows={2}
                className="glass-input min-h-[3.5rem] resize-y py-2"
              />
              <p className="mt-0.5 text-[10px] text-white/35">
                AI 話者修正時に SPK の説明として送信されます
              </p>
            </label>

            <div className="mb-2 grid grid-cols-2 gap-2">
              <label className="col-span-2 block">
                <span className="mb-0.5 block text-xs text-white/50">
                  {MSG.labelPosition}
                </span>
                <select
                  value={speaker.position}
                  onChange={(e) =>
                    handlePositionChange(
                      speaker,
                      e.target.value as SpeakerPosition,
                    )
                  }
                  className="glass-input px-2"
                >
                  {SPEAKER_POSITION_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-0.5 block text-xs text-white/50">
                  {MSG.labelColor}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={speaker.color}
                    onChange={(e) =>
                      updateSpeaker(speaker.id, { color: e.target.value })
                    }
                    className="h-9 w-12 cursor-pointer rounded-glass border border-glass-border bg-transparent"
                  />
                  <span className="text-meta">{speaker.color}</span>
                </div>
              </label>
            </div>

            <button
              type="button"
              disabled={!firstWord}
              onClick={() => handlePreview(speaker.id)}
              className="glass-btn-ghost w-full hover:border-accent/60 hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {firstWord
                ? `${MSG.previewWithTimePrefix}${formatMs(firstWord.start_ms)}${MSG.previewWithTimeSuffix}`
                : MSG.noSpeech}
            </button>
          </li>
        ))}
      </ul>

      <details
        className="glass-panel shrink-0 border-dashed px-2.5 py-2"
        open={needsMerge}
      >
        <summary className="cursor-pointer text-xs font-medium text-white">
          {MSG.mergeSection}
          {needsMerge && (
            <span className="ml-1.5 font-normal text-amber-200">
              （{MSG.mergeHintPrefix}
              {speakers.length - MAX_SPEAKERS}
              {MSG.mergeHintShortSuffix}）
            </span>
          )}
        </summary>
        <div className="mt-2 space-y-2">
          <p className="text-[11px] leading-snug text-white/45">{MSG.mergeDesc}</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-[11px] text-white/50">
              {MSG.mergeFrom}
              <select
                value={mergeFromId}
                onChange={(e) => setMergeFromId(e.target.value)}
                className="glass-input mt-0.5 px-2 py-1.5 text-xs"
              >
                <option value="">{MSG.selectPlaceholder}</option>
                {speakers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id}
                    {s.label ? ` \u2014 ${s.label}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[11px] text-white/50">
              {MSG.mergeTo}
              <select
                value={mergeToId}
                onChange={(e) => setMergeToId(e.target.value)}
                className="glass-input mt-0.5 px-2 py-1.5 text-xs"
              >
                <option value="">{MSG.selectPlaceholder}</option>
                {speakers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id}
                    {s.label ? ` \u2014 ${s.label}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={handleMerge}
            disabled={!mergeFromId || !mergeToId || mergeFromId === mergeToId}
            className="glass-btn-secondary w-full py-1.5 text-xs"
          >
            {MSG.mergeExecute}
          </button>
        </div>
      </details>

      {lastError && (
        <p className="glass-panel shrink-0 border-red-500/30 bg-red-500/15 px-2.5 py-1.5 text-xs text-red-300">
          {lastError}
        </p>
      )}

      {onComplete && (
        <div className="shrink-0 space-y-1">
          <button
            type="button"
            disabled={!canComplete}
            onClick={onComplete}
            className="glass-btn-primary w-full py-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {MSG.complete}
          </button>
          {!canComplete && (
            <p className="text-center text-[11px] text-white/45">
              {needsMerge
                ? `${MSG.hintMergeAndLabelPrefix}${MAX_SPEAKERS}${MSG.hintMergeAndLabelSuffix}`
                : MSG.hintLabelAll}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
