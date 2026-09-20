import React from "react";
import { useEffect, useState } from "react";
import { formatDuration } from "./chatUtils";

// Elapsed-time ticker for running chat parts (OpenChamber "LiveDuration" pattern).
// Re-renders on an interval while mounted so tool/reasoning chips show live durations.
export function LiveClock({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(() => Math.max(0, Date.now() - startedAt));

  useEffect(() => {
    const t = window.setInterval(() => setElapsed(Date.now() - startedAt), 500);
    return () => window.clearInterval(t);
  }, [startedAt]);

  return (
    <span className="text-[9.5px] font-mono text-muted/70 tabular-nums">
      {formatDuration(elapsed)}
    </span>
  );
}