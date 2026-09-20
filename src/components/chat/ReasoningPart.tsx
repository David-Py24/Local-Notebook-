import { useState } from "react";
import { ChatPart } from "../../stores/useStore";
import { LiveClock } from "./LiveClock";
import { formatDuration, stripMarkdown } from "./chatUtils";

type Reasoning = Extract<ChatPart, { kind: "reasoning" }>;

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3 w-3 shrink-0 text-muted/70 transition-transform duration-200 ${open ? "rotate-90 text-accent" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// Collapsible reasoning block (OpenChamber "ReasoningPart" analog): a pill with a
// markdown-stripped summary, live duration while streaming, expand to the full trace.
export function ReasoningPart({ part }: { part: Reasoning }) {
  const [expanded, setExpanded] = useState(false);
  const running = part.state === "running" || part.state === "pending";
  const startedAt = part.startedAt ?? Date.now();
  const summary = stripMarkdown(part.text, 120);

  return (
    <div className="my-1 text-left">
      <button
        onClick={() => setExpanded(!expanded)}
        className="group inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/50 bg-chat-reasoning-bg/70 px-2.5 py-1 text-[11px] font-medium text-muted hover:text-text hover:border-border transition-all select-none"
        title={running ? "Thinking…" : "Thought process — click to expand"}
      >
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${running ? "bg-chat-tool-running animate-pulse" : "bg-chat-tool-running/50"}`}
        />
        <span className="shrink-0">{running ? "Thinking" : "Thought"}</span>
        <span className="max-w-[220px] truncate text-left text-[10.5px] text-muted/80">
          {running ? (summary || "Working…") : summary}
        </span>
        {running ? (
          <LiveClock startedAt={startedAt} />
        ) : (
          part.durationMs !== undefined && part.durationMs > 0 && (
            <span className="font-mono text-[9.5px] text-muted/60 tabular-nums">
              {formatDuration(part.durationMs)}
            </span>
          )
        )}
        <Chevron open={expanded} />
      </button>

      {expanded && (
        <div className="mt-1.5 ml-2 border-l-2 border-chat-tool-running/40 bg-chat-reasoning-bg/50 py-2 pl-3 pr-2.5 whitespace-pre-wrap text-[11px] font-mono leading-relaxed text-muted/90 overflow-x-auto rounded-r-lg">
          {part.text}
        </div>
      )}
    </div>
  );
}