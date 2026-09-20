import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { AssistantMessage, ExecutionStep } from "../stores/useStore";

interface AgentStepTimelineProps {
  message: AssistantMessage;
}

export function AgentStepTimeline({ message }: AgentStepTimelineProps) {
  // Extract or parse steps from message content if explicit steps array isn't populated
  const steps = useMemo(() => {
    if (message.steps && message.steps.length > 0) {
      return message.steps;
    }
    return parseContentToSteps(message.content);
  }, [message.steps, message.content]);

  if (!steps || steps.length === 0) {
    return (
      <div className="text-xs text-text/90 leading-relaxed markdown-preview">
        <ReactMarkdown>{message.content}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-xs w-full transition-all">
      {steps.map((step, idx) => (
        <TimelineStepItem key={step.id || `step-${idx}`} step={step} />
      ))}
    </div>
  );
}

function TimelineStepItem({ step }: { step: ExecutionStep }) {
  const [expanded, setExpanded] = useState(false);

  if (step.kind === "text") {
    if (!step.content?.trim()) return null;
    return (
      <div className="text-xs text-text/90 leading-relaxed markdown-preview my-1.5">
        <ReactMarkdown>{step.content}</ReactMarkdown>
      </div>
    );
  }

  if (step.kind === "thought") {
    const isRunning = step.status === "running";
    const durationLabel = formatDuration(step.durationMs);
    const titleText = isRunning
      ? "Thinking..."
      : step.title || (durationLabel ? `Worked for ${durationLabel}` : "Thought process");

    return (
      <div className="my-1 text-left">
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-card/60 px-2.5 py-1 text-[11px] font-medium text-muted hover:text-text hover:bg-card/90 cursor-pointer transition-all select-none"
        >
          {isRunning ? (
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          ) : (
            <svg
              className={`w-3 h-3 text-muted/70 transition-transform duration-200 ${
                expanded ? "rotate-90 text-accent" : ""
              }`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          )}
          <span className="font-mono text-[10.5px] tracking-tight">{titleText}</span>
        </button>

        {expanded && step.content && (
          <div className="mt-1.5 ml-2 pl-3 border-l-2 border-accent/30 py-1 text-[11px] text-muted/90 font-mono leading-relaxed bg-bg/40 rounded-r-lg p-2.5 overflow-x-auto whitespace-pre-wrap">
            {step.content}
          </div>
        )}
      </div>
    );
  }

  if (step.kind === "tool" || step.kind === "timer" || step.kind === "status") {
    const isRunning = step.status === "running";
    const isFailed = step.status === "failed";
    const hasDetails = Boolean(step.content || step.toolArgs);

    return (
      <div className="my-1 text-left">
        <button
          onClick={() => hasDetails && setExpanded(!expanded)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all select-none ${
            isFailed
              ? "border-red-500/30 bg-red-500/10 text-red-300"
              : isRunning
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-border/50 bg-card/40 text-muted/90 hover:text-text hover:bg-card/80"
          } ${hasDetails ? "cursor-pointer" : "cursor-default"}`}
        >
          {isRunning ? (
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          ) : (
            <span className="text-[10px]">
              {step.kind === "timer" ? "⏱️" : isFailed ? "❌" : "⚙️"}
            </span>
          )}

          <span className="font-mono text-[10.5px] tracking-tight">{step.title}</span>

          {hasDetails && (
            <svg
              className={`w-3 h-3 text-muted/70 transition-transform duration-200 ${
                expanded ? "rotate-90 text-accent" : ""
              }`}
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
          <div className="mt-1.5 ml-2 pl-3 border-l-2 border-border/60 py-1 text-[10.5px] text-muted font-mono leading-relaxed bg-bg/50 rounded-r-lg p-2.5 overflow-x-auto space-y-1.5">
            {step.toolArgs && (
              <div>
                <span className="text-[9.5px] font-semibold uppercase text-accent/80">Arguments</span>
                <pre className="text-text/80 text-[10px] bg-bg/60 p-1.5 rounded mt-0.5 overflow-x-auto">
                  {JSON.stringify(step.toolArgs, null, 2)}
                </pre>
              </div>
            )}
            {step.content && (
              <div>
                <span className="text-[9.5px] font-semibold uppercase text-muted/70">Output / Logs</span>
                <pre className="text-text/80 text-[10px] bg-bg/60 p-1.5 rounded mt-0.5 whitespace-pre-wrap break-words">
                  {step.content}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
}

/**
  Parses raw assistant content string into structured execution steps.
  Recognizes `<think>...</think>` reasoning blocks and tool indicators.
 */
function parseContentToSteps(rawContent: string): ExecutionStep[] {
  if (!rawContent) return [];
  const steps: ExecutionStep[] = [];

  // Match <think>...</think> blocks (DeepSeek R1 / Ollama / Hermes reasoning)
  const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/gi;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = thinkRegex.exec(rawContent)) !== null) {
    // Push preceding text if any
    const precedingText = rawContent.slice(lastIdx, match.index);
    if (precedingText.trim()) {
      pushTextOrToolSteps(steps, precedingText);
    }

    const thoughtText = match[1].trim();
    const isCompleted = rawContent.includes("</think>", match.index);
    const wordCount = thoughtText.split(/\s+/).length;
    const estSec = Math.max(1, Math.round(wordCount / 4));

    steps.push({
      id: `thought-${match.index}`,
      kind: "thought",
      title: isCompleted ? `Worked for ${formatDuration(estSec * 1000)}` : "Thinking...",
      content: thoughtText,
      durationMs: estSec * 1000,
      status: isCompleted ? "completed" : "running",
    });

    lastIdx = thinkRegex.lastIndex;
  }

  // Push remaining text
  const remaining = rawContent.slice(lastIdx);
  if (remaining.trim()) {
    pushTextOrToolSteps(steps, remaining);
  }

  return steps;
}

function pushTextOrToolSteps(steps: ExecutionStep[], textChunk: string) {
  const lines = textChunk.split("\n");
  let currentTextBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const toolMatch = line.match(/^(?:🔧|⚙️|\[TOOL\])\s*([a-zA-Z0-9_\-\/\.]+)\s*·?\s*(running|completed|finished|failed|done)?/i);
    const timingMatch = line.match(/^(?:Worked for|Timed|Running)\s+([^\n>]+)>?/i);

    if (toolMatch) {
      if (currentTextBuffer.length > 0) {
        steps.push({
          id: `text-${steps.length}`,
          kind: "text",
          title: "",
          content: currentTextBuffer.join("\n"),
          status: "completed",
        });
        currentTextBuffer = [];
      }
      const toolName = toolMatch[1];
      const statusStr = (toolMatch[2] || "finished").toLowerCase();
      steps.push({
        id: `tool-${steps.length}`,
        kind: "tool",
        title: `Running ${toolName} ${statusStr.includes("fail") ? "failed" : "finished"}`,
        toolName,
        status: statusStr.includes("fail") ? "failed" : "completed",
      });
    } else if (timingMatch) {
      if (currentTextBuffer.length > 0) {
        steps.push({
          id: `text-${steps.length}`,
          kind: "text",
          title: "",
          content: currentTextBuffer.join("\n"),
          status: "completed",
        });
        currentTextBuffer = [];
      }
      steps.push({
        id: `timing-${steps.length}`,
        kind: "status",
        title: timingMatch[0].replace(/>$/, "").trim(),
        status: "completed",
      });
    } else {
      currentTextBuffer.push(line);
    }
  }

  if (currentTextBuffer.length > 0) {
    steps.push({
      id: `text-${steps.length}`,
      kind: "text",
      title: "",
      content: currentTextBuffer.join("\n"),
      status: "completed",
    });
  }
}

function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return "";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (remSec === 0) return `${minutes}m`;
  return `${minutes}m ${remSec}s`;
}
