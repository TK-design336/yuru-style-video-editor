import { useEffect, type RefObject } from "react";
import { usePreviewStore } from "@/store/previewStore";

/** previewStore の seekRequestMs を <video> に反映する */
export function useVideoSeek(
  videoRef: RefObject<HTMLVideoElement | null>,
): void {
  const seekRequestMs = usePreviewStore((s) => s.seekRequestMs);
  const clearSeekRequest = usePreviewStore((s) => s.clearSeekRequest);
  const setCurrentTimeMs = usePreviewStore((s) => s.setCurrentTimeMs);

  useEffect(() => {
    if (seekRequestMs === null) return;
    const video = videoRef.current;
    if (!video) return;

    const seconds = seekRequestMs / 1000;
    video.currentTime = seconds;
    setCurrentTimeMs(seekRequestMs);
    clearSeekRequest();
  }, [
    seekRequestMs,
    videoRef,
    clearSeekRequest,
    setCurrentTimeMs,
  ]);
}
