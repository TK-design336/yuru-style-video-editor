import { useEffect, useState } from "react";

/** active 中に `.` → `..` → `...` をループする */
export function useAnimatedEllipsis(active: boolean, intervalMs = 400): string {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!active) {
      setFrame(0);
      return;
    }
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % 3);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);

  if (!active) return "";
  return ".".repeat(frame + 1);
}
