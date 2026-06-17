import { useEffect, useState } from "react";
import type { Speaker } from "@/lib/schema/transcript";
import {
  CHANGE_TYPE_LABELS,
  type SpeakerDiarizationChange,
} from "@/lib/transcript/speakerDiarizationDiff";

interface SpeakerDiarizationReviewProps {
  changes: SpeakerDiarizationChange[];
  speakers: Speaker[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRevert: (id: string) => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
  onNavigateToChange?: (change: SpeakerDiarizationChange) => void;
  className?: string;
  /** compact: インライン用（最大高さ制限） / fill: 右ペインなど親の高さいっぱい */
  layout?: "compact" | "fill";
}

function speakerLabel(speakers: Speaker[], id: string): string {
  return speakers.find((s) => s.id === id)?.label ?? id;
}

function speakerColor(speakers: Speaker[], id: string): string {
  return speakers.find((s) => s.id === id)?.color ?? "currentColor";
}

function SegmentLine({
  speaker,
  text,
  speakers,
  variant,
}: {
  speaker: string;
  text: string;
  speakers: Speaker[];
  variant: "original" | "corrected";
}) {
  const color = speakerColor(speakers, speaker);
  return (
    <div
      className={`rounded border px-2 py-1.5 text-sm ${
        variant === "original"
          ? "border-white/10 bg-white/5"
          : "border-amber-500/30 bg-amber-500/10"
      }`}
    >
      <p
        className="mb-0.5 text-xs font-semibold"
        style={{ color }}
      >
        {speakerLabel(speakers, speaker)}
      </p>
      <p className="text-white/85 leading-relaxed">{text}</p>
    </div>
  );
}

function ChangeRow({
  change,
  speakers,
  onApprove,
  onReject,
  onRevert,
  onNavigate,
}: {
  change: SpeakerDiarizationChange;
  speakers: Speaker[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRevert: (id: string) => void;
  onNavigate?: (change: SpeakerDiarizationChange) => void;
}) {
  const isPending = change.status === "pending";
  const isApplied = change.status === "applied";
  const isRejected = change.status === "rejected";

  return (
    <li
      className={`glass-panel list-none px-3 py-2.5 ${
        isApplied
          ? "border-emerald-500/30 bg-emerald-500/5"
          : isRejected
            ? "opacity-50"
            : "border-amber-500/25"
      } ${onNavigate ? "cursor-pointer hover:bg-white/5" : ""}`}
      onClick={() => onNavigate?.(change)}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/80">
          {CHANGE_TYPE_LABELS[change.type]}
        </span>
        {isApplied && (
          <span className="text-[11px] text-emerald-300">適用済み</span>
        )}
        {isRejected && (
          <span className="text-[11px] text-white/40">却下</span>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-white/40">
            現在
          </p>
          {change.original.map((seg, i) => (
            <SegmentLine
              key={`o-${i}`}
              speaker={seg.speaker}
              text={seg.text}
              speakers={speakers}
              variant="original"
            />
          ))}
        </div>
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-amber-200/60">
            修正後
          </p>
          {change.corrected.map((seg, i) => (
            <SegmentLine
              key={`c-${i}`}
              speaker={seg.speaker}
              text={seg.text}
              speakers={speakers}
              variant="corrected"
            />
          ))}
        </div>
      </div>

      <div className="mt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
        {isPending && (
          <>
            <button
              type="button"
              onClick={() => onApprove(change.id)}
              className="glass-btn-primary bg-emerald-600/90 px-2.5 py-1 text-xs hover:bg-emerald-600"
            >
              承認
            </button>
            <button
              type="button"
              onClick={() => onReject(change.id)}
              className="glass-btn-ghost px-2.5 py-1 text-xs"
            >
              却下
            </button>
          </>
        )}
        {isRejected && (
          <button
            type="button"
            onClick={() => onApprove(change.id)}
            className="glass-btn-primary bg-emerald-600/90 px-2.5 py-1 text-xs hover:bg-emerald-600"
          >
            承認
          </button>
        )}
        {isApplied && (
          <button
            type="button"
            onClick={() => onRevert(change.id)}
            className="glass-btn-ghost px-2.5 py-1 text-xs"
          >
            戻す
          </button>
        )}
      </div>
    </li>
  );
}

export function SpeakerDiarizationReview({
  changes,
  speakers,
  onApprove,
  onReject,
  onRevert,
  onApproveAll,
  onRejectAll,
  onNavigateToChange,
  className = "",
  layout = "compact",
}: SpeakerDiarizationReviewProps) {
  const [expanded, setExpanded] = useState(true);
  const pending = changes.filter((c) => c.status === "pending");
  const applied = changes.filter((c) => c.status === "applied");

  useEffect(() => {
    setExpanded(true);
  }, [changes.length]);

  if (changes.length === 0) return null;

  const isFill = layout === "fill";

  return (
    <div
      className={`flex flex-col rounded-glass border border-amber-500/25 bg-amber-500/5 ${
        isFill ? "min-h-0 flex-1" : ""
      } ${className}`}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-amber-500/20 px-3 py-2">
        <div className="flex min-w-0 items-start gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-0.5 shrink-0 text-white/50 hover:text-white/80"
            aria-expanded={expanded}
            aria-label={expanded ? "確認エリアを折りたたむ" : "確認エリアを展開する"}
          >
            {expanded ? "▼" : "▶"}
          </button>
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-100">
              AI校正案の確認
            </p>
            <p className="text-xs text-white/50">
              {changes.length} 件の変更候補
              {pending.length > 0 && `（未確認 ${pending.length} 件）`}
              {applied.length > 0 && `（適用済み ${applied.length} 件）`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {pending.length > 0 && (
            <>
              <button
                type="button"
                onClick={onApproveAll}
                className="glass-btn-secondary px-2.5 py-1 text-xs"
              >
                すべて承認
              </button>
              <button
                type="button"
                onClick={onRejectAll}
                className="glass-btn-ghost px-2.5 py-1 text-xs"
              >
                すべて却下
              </button>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <ul
          className={`list-none space-y-2 p-3 ${
            isFill ? "min-h-0 flex-1 overflow-y-auto" : "max-h-48 overflow-y-auto"
          }`}
        >
          {changes.map((change) => (
            <ChangeRow
              key={change.id}
              change={change}
              speakers={speakers}
              onApprove={onApprove}
              onReject={onReject}
              onRevert={onRevert}
              onNavigate={onNavigateToChange}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
