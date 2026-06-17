import { AiApiSettingsPanel } from "@/components/panels/AiApiSettingsPanel";
import { Modal } from "@/components/ui/Modal";

interface AiApiSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function AiApiSettingsModal({ open, onClose }: AiApiSettingsModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI API 設定"
      panelClassName="max-w-2xl"
    >
      <AiApiSettingsPanel />
    </Modal>
  );
}
