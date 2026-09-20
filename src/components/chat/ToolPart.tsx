import { useState } from "react";
import { ChatPart } from "../../stores/useStore";
import { LiveClock } from "./LiveClock";
import { formatDuration, summarizeArgs } from "./chatUtils";

type Tool = Extract<ChatPart, { kind: "tool" }>;

function ToolIcon({ failed, done }: { failed: boolean; done: boolean }) {
  if (failed) return <span>❌</span>;
  if (done) return <span className="text-chat-tool-ok">⚙️</span>;
  return <span>⚙️</span>;
}

// Live tool-call chip (OpenChamber "ToolPart" analog): status-colored, live duration
// while running, expandable args/output. Arrives chronologically on the part stream.
export function ToolPart({ part }: { part: Tool }) {
  const [expanded, setExpanded] = useState(false);
  const running = part.state === "running" || part.state === "pending";
  const failed = part.state === "error";
  const hasDetails = Boolean(part.args || part.output);
  const startedAt = part.startedAt ?? Date.now();

  const toneClass = failed
    ? "border-chat-tool-error/40 bg-chat-tool-error/10 text-chat-tool-error"
    : running
      ? "border-chat-tool-running/50 bg-chat-tool-running/10 text-chat-tool-running"
      : "border-border/50 bg-card/50 text-muted/90 hover:text-text";

  const summary = failed ? "failed" : running ? "running" : "done";

  return (
    <div className="my-1 text-left">
      <button
        onClick={() => hasDetails && setExpanded(!expanded)}
        disabled={!hasDetails}
        className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all select-none ${toneClass} ${
          hasDetails ? "cursor-pointer" : "cursor-default"
        }`}
        title={part.title || part.name}
      >
        <span className="shrink-0 text-[10px]">
          <ToolIcon failed={failed} done={!running && !failed} />
        </span>
        <span className="truncate font-mono text-[10.5px] tracking-tight">{part.name}</span>
        <span className="shrink-0 text-[9.5px] text-muted/70">{summary}</span>
        {running ? (
          <LiveClock startedAt={startedAt} />
        ) : (
          part.durationMs !== undefined && part.durationMs > 0 && (
            <span className="shrink-0 font-mono text-[9.5px] text-muted/60 tabular-nums">
              {formatDuration(part.durationMs)}
            </span>
          )
        )}
        {hasDetails && (
          <svg
            className={`h-3 w-3 shrink-0 text-muted/70 transition-transform duration-200 ${expanded ? "rotate-90 text-accent" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        )}
      </button>

      {expanded && hasDetails && (
        <div className="mt-1.5 ml-2 space-y-1.5 rounded-r-lg border-l-2 border-border/60 bg-bg/50 p-2.5 overflow-x-auto">
          {part.args && (
            <div>
              <span className="text-[9.5px] font-semibold uppercase text-accent/80">
                Arguments {summarizeArgs(part.args)}
              </span>
              <pre className="mt-0.5 overflow-x-auto rounded bg-bg/60 p-1.5 text-[10px] text-text/80">
                {JSON.stringify(part.args, null, 2)}
              </pre>
            </div>
          )}
          {part.output && (
            <div>
              <span className="text-[9.5px] font-semibold uppercase text-muted/70">Output</span>
              <pre className="mt-0.5 max-h-44 overflow-y-auto whitespace-pre-wrap break-words rounded bg-bg/60 p-1.5 text-[10px] text-text/80">
                {part.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}