import { useRef } from "react";
import { LiveClock } from "./LiveClock";

// Streaming status row (OpenChamber "StatusRow" analog): the transient work-status
// text ("OpenCode agent working…", "🔧 tool · running", "Synthesizing results…") with a
// live elapsed clock. Mounts once per streaming turn; disappears when not streaming.
export function StatusRow({ statusText }: { statusText: string }) {
  const startRef = useRef(Date.now());
  return (
    <div className="mt-4 flex w-fit items-center gap-2 text-[11px] font-medium text-muted">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-chat-tool-running animate-pulse" />
      <span className="truncate">{statusText}</span>
      <LiveClock startedAt={startRef.current} />
    </div>
  );
}