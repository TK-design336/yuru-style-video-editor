import type { ReactNode } from "react";
import type { AppPhase } from "@/App";
import { useProjectStore } from "@/store/projectStore";
import { useSettingsUiStore } from "@/store/settingsUiStore";
import { useAiSettingsStore } from "@/store/aiSettingsStore";

type PlaceholderPhase = "subtitles" | "telop" | "mediaHint" | "export";

interface PhaseItem {
  id: AppPhase | PlaceholderPhase;
  step: string;
  label: string;
  /** title 未指定時は step + label */
  title?: string;
  icon: ReactNode;
  disabled?: boolean;
}

interface PhaseSidebarProps {
  current: AppPhase;
  onNavigate: (phase: AppPhase) => void;
}

function NavIcon({
  children,
  active,
  disabled,
  onClick,
  step,
  label,
  title,
}: {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  step: string;
  label: string;
  title?: string;
}) {
  const fullLabel = title ?? (step ? `${step} ${label}` : label);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={fullLabel}
      aria-label={fullLabel}
      aria-current={active ? "page" : undefined}
      className={`phase-nav-btn relative ${active ? "phase-nav-btn-active" : ""} ${
        disabled ? "phase-nav-btn-disabled" : ""
      }`}
    >
      {step ? <span className="phase-nav-step">{step}</span> : null}
      {children}
      <span className="phase-nav-label">{label}</span>
    </button>
  );
}

export function PhaseSidebar({ current, onNavigate }: PhaseSidebarProps) {
  const project = useProjectStore((s) => s.project);
  const hasTranscript = (project?.words.length ?? 0) > 0;
  const openSettings = useSettingsUiStore((s) => s.openSettings);
  const hasActiveProviderKey = useAiSettingsStore((s) => s.hasActiveProviderKey);

  const phases: PhaseItem[] = [
    {
      id: "ingest",
      step: "①",
      label: "文字起こし",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path d="M4 6h16M4 10h16M4 14h10M4 18h12" />
          <path d="M18 14l2 2-2 2" />
        </svg>
      ),
    },
    {
      id: "correction",
      step: "②",
      label: "校正",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 12h6M9 16h4" />
        </svg>
      ),
      disabled: !hasTranscript,
    },
    {
      id: "partEditor",
      step: "③",
      label: "カット編集",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M20 4L8.5 15.5M14 10l6 6M8.5 8.5L4 4" />
        </svg>
      ),
      disabled: !hasTranscript,
    },
    {
      id: "subtitles",
      step: "④",
      label: "字幕",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M7 15h4M13 15h4M7 11h10" />
        </svg>
      ),
      disabled: true,
    },
    {
      id: "telop",
      step: "⑤",
      label: "テロップ",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path d="M4 7h16M4 12h10M4 17h14" />
        </svg>
      ),
      disabled: true,
    },
    {
      id: "mediaHint",
      step: "⑥",
      label: "図解",
      title: "⑥ 図解・引用",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 15l5-5 4 4 3-3 6 6" />
          <circle cx="8.5" cy="8.5" r="1.5" />
        </svg>
      ),
      disabled: true,
    },
    {
      id: "export",
      step: "⑦",
      label: "書き出し",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path d="M12 3v12M8 11l4 4 4-4M5 21h14" />
        </svg>
      ),
      disabled: true,
    },
  ];

  return (
    <nav className="phase-sidebar" aria-label="ワークフロー">
      <div className="phase-sidebar-main">
        {phases.map((phase) => {
          const isAppPhase =
            phase.id === "ingest" ||
            phase.id === "correction" ||
            phase.id === "partEditor";
          const active = current === phase.id;

          return (
            <NavIcon
              key={phase.id}
              step={phase.step}
              label={phase.label}
              title={phase.title}
              active={active}
              disabled={phase.disabled}
              onClick={
                isAppPhase && !phase.disabled
                  ? () => onNavigate(phase.id as AppPhase)
                  : undefined
              }
            >
              {phase.icon}
            </NavIcon>
          );
        })}
      </div>
      <div className="phase-sidebar-footer">
        <NavIcon
          step=""
          label="設定"
          onClick={openSettings}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
          {!hasActiveProviderKey && (
            <span className="absolute right-1 top-1 size-2 rounded-full bg-amber-400" />
          )}
        </NavIcon>
      </div>
    </nav>
  );
}
