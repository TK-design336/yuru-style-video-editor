import { useEffect, useState } from "react";
import { AiApiSettingsModal } from "@/components/panels/AiApiSettingsModal";
import { PhaseSidebar } from "@/components/layout/PhaseSidebar";
import { ToastContainer } from "@/components/ui/ToastContainer";
import Correction from "@/pages/Correction";
import Ingest from "@/pages/Ingest";
import PartEditor from "@/pages/PartEditor";
import { useAiSettingsStore } from "@/store/aiSettingsStore";
import { useSettingsUiStore } from "@/store/settingsUiStore";

export type AppPhase = "ingest" | "correction" | "partEditor";

function App() {
  const [phase, setPhase] = useState<AppPhase>("ingest");
  const refreshKeyStatus = useAiSettingsStore((s) => s.refreshKeyStatus);
  const settingsOpen = useSettingsUiStore((s) => s.settingsOpen);
  const closeSettings = useSettingsUiStore((s) => s.closeSettings);

  useEffect(() => {
    refreshKeyStatus();
  }, [refreshKeyStatus]);

  return (
    <div className="app-shell flex h-screen text-white">
      <PhaseSidebar current={phase} onNavigate={setPhase} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          className={
            phase === "ingest"
              ? "flex min-h-0 flex-1 flex-col"
              : "hidden"
          }
        >
          <Ingest onProceedToCorrection={() => setPhase("correction")} />
        </div>
        <div
          className={
            phase === "correction"
              ? "flex min-h-0 flex-1 flex-col"
              : "hidden"
          }
        >
          <Correction />
        </div>
        <div
          className={
            phase === "partEditor"
              ? "flex min-h-0 flex-1 flex-col"
              : "hidden"
          }
        >
          <PartEditor />
        </div>
      </div>
      <ToastContainer />
      <AiApiSettingsModal open={settingsOpen} onClose={closeSettings} />
    </div>
  );
}

export default App;
