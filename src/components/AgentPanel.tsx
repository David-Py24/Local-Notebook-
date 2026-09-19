import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useStore, AgentTask } from "../stores/useStore";

const TASKS: { id: AgentTask; label: string }[] = [
  { id: "summarize", label: "Summarize" },
  { id: "improve", label: "Improve" },
  { id: "assess", label: "Assess" },
  { id: "custom", label: "Custom" },
];

export default function AgentPanel() {
  const agentMessages = useStore((s) => s.agentMessages);
  const agentContext = useStore((s) => s.agentContext);
  const agentTask = useStore((s) => s.agentTask);
  const setAgentTask = useStore((s) => s.setAgentTask);
  const setAgentContext = useStore((s) => s.setAgentContext);
  const addAgentMessage = useStore((s) => s.addAgentMessage);
  const toggleAgentPanel = useStore((s) => s.toggleAgentPanel);
  const pendingToolApprovals = useStore((s) => s.pendingToolApprovals);
  const resolveToolApproval = useStore((s) => s.resolveToolApproval);
  const clearToolApproval = useStore((s) => s.clearToolApproval);

  const [inputVal, setInputVal] = useState("");
  const [statusText, setStatusText] = useState("");
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    // Resolve any in-flight approval so a tool wait doesn't deadlock after Stop.
    const s = useStore.getState();
    s.pendingToolApprovals
      .filter((p) => p.status === "pending")
      .forEach((p) => s.resolveToolApproval(p.id, "rejected"));
  };

  const handleSend = () => {
    const text = inputVal.trim();
    if (!text) return;
    setInputVal("");

    const store = useStore.getState();
    const task: AgentTask = agentTask;
    const vaultRoot = store.currentFolderPath || "";

    addAgentMessage({ id: "user-" + Date.now(), role: "user", text, timestamp: Date.now() });
    const agentId = "agent-" + Date.now();
    addAgentMessage({ id: agentId, role: "agent", text: "…", timestamp: Date.now() });

    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setStatusText("Starting...");

    const activePath = store.activeLeftTabId || store.activeRightTabId;
    const scope = activePath ? activePath.split(/[\\/]/).pop()?.replace(/\.md$/i, "") || "global" : "global";

    const instruction =
      task === "custom"
        ? text
        : task === "summarize"
        ? "Summarize the target text below concisely, highlighting the key points, relationships, and any terms worth remembering. Use the retrieved context only as support."
        : task === "improve"
        ? "Improve the target text below: tighten wording, fix clarity and structure, and keep its meaning and voice. Output the revised text with a short list of the changes you made."
        : "Assess the target text below for the user as a study aid: note strengths, gaps, unclear sections, and 1-3 concrete suggestions for improvement.";

    const target = agentContext ?? `(No highlighted context)\nUser message: ${text}`;

    (async () => {
      const { runAgentTask, remember } = await import("../services/agentKnowledge");
      let finalText = "";
      try {
        finalText = await runAgentTask({
          task: instruction,
          context: target,
          scope,
          vaultRoot,
          onChunk: (t) => {
            const s = useStore.getState();
            s.setAgentMessages(s.agentMessages.map((m) => (m.id === agentId ? { ...m, text: t } : m)));
          },
          onStatusChange: (status) => setStatusText(status),
          onToolCall: (tool) => setStatusText(`🔧 ${tool}…`),
          signal: controller.signal,
        });
      } catch (err) {
        finalText =
          err instanceof DOMException && err.name === "AbortError"
            ? "⛔ Stopped by user."
            : `⚠️ Agent run failed: ${String(err)}`;
      } finally {
        setRunning(false);
        setStatusText("");
        abortRef.current = null;
        const s = useStore.getState();
        s.setAgentMessages(
          s.agentMessages.map((m) =>
            m.id === agentId ? { ...m, text: finalText || "_No output produced._" } : m
          )
        );
        // Persist the turn to durable memory (fire-and-forget).
        if (finalText && s.settings.memoryAutoSave !== false) {
          remember(
            {
              scope,
              kind: "message",
              content: `Task: ${instruction}\nResult: ${finalText.slice(0, 2000)}`,
              source: "micro-agent",
              topicTitle: scope,
            },
            s.settings
          ).catch(() => {});
        }
      }
    })();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden panel-rounded bg-card border-l border-border/40">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/30 bg-bg/30 px-3">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-accent stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <h2 className="text-xs font-semibold text-text">Agent</h2>
          <span className="text-[9px] font-mono uppercase text-muted bg-bg/50 rounded px-1 py-0.5">micro</span>
        </div>
        <button
          onClick={toggleAgentPanel}
          title="Close panel"
          className="rounded p-1 text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Task Selector */}
      <div className="shrink-0 flex items-center gap-1 border-b border-border/30 bg-bg/10 px-2 py-1.5">
        <span className="text-[9px] font-semibold uppercase text-muted mr-1">Task</span>
        {TASKS.map((t) => (
          <button
            key={t.id}
            onClick={() => setAgentTask(t.id)}
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium cursor-pointer transition-colors ${
              agentTask === t.id ? "bg-accent text-white" : "text-muted hover:bg-bg hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Context */}
      {agentContext && (
        <div className="shrink-0 px-3 py-2 border-b border-border/30 bg-bg/20">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[9px] font-semibold uppercase text-muted">Context</p>
            <button
              onClick={() => setAgentContext(null)}
              className="text-[10px] text-muted hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
          <p className="text-[11px] text-text/80 leading-relaxed line-clamp-4">{agentContext}</p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {agentMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted">
            <p className="text-[11px] mb-1">Highlight text in your note to</p>
            <p className="text-[11px]">summarize, improve, or assess it.</p>
          </div>
        ) : (
          agentMessages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[90%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                m.role === "user"
                  ? "ml-auto bg-accent/15 text-white"
                  : "bg-bg/40 text-text/90 markdown-preview"
              }`}
            >
              {m.role === "agent" ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
              ) : (
                <span className="whitespace-pre-wrap">{m.text}</span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Running status + Stop */}
      {running && (
        <div className="shrink-0 flex items-center justify-between gap-2 border-t border-border/30 bg-bg/20 px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-2 text-[11px] font-medium text-muted">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent animate-pulse" />
            <span className="truncate">{statusText || "Running agent..."}</span>
          </div>
          <button
            onClick={handleStop}
            className="shrink-0 rounded border border-border/60 bg-bg/60 px-2 py-0.5 text-[10px] font-semibold text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors"
          >
            Stop
          </button>
        </div>
      )}

      {/* Pending file-tool approval gate (T2.1) */}
      {pendingToolApprovals.length > 0 && (
        <div className="space-y-2 px-3 py-2 border-t border-border/40 bg-bg/40 shrink-0">
          {pendingToolApprovals
            .filter((p) => p.status === "pending")
            .map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-1.5 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 font-medium text-amber-300">
                    <span>⚠️</span>
                    <span className="uppercase tracking-wide text-[9px]">Approval Required</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-text/90 leading-snug break-words">{p.summary}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => {
                      resolveToolApproval(p.id, "approved");
                      setTimeout(() => clearToolApproval(p.id), 1200);
                    }}
                    className="rounded bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-400 cursor-pointer transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      resolveToolApproval(p.id, "rejected");
                      clearToolApproval(p.id);
                    }}
                    className="rounded border border-border bg-bg/60 px-2 py-0.5 text-[10px] font-semibold text-red-400 hover:bg-red-500/20 cursor-pointer transition-colors"
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 border-t border-border/30 p-2">
        <textarea
          rows={2}
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={agentContext ? `Run ${agentTask} on highlighted text...` : "Ask Agent to help..."}
          className="w-full resize-none rounded border border-border/60 bg-bg/40 px-2 py-1.5 text-xs text-text placeholder:text-muted/60 outline-none focus:border-accent/70"
        />
        <button
          onClick={handleSend}
          className="mt-1.5 w-full rounded bg-accent py-1.5 text-xs font-semibold text-white hover:bg-accent-hover cursor-pointer transition-colors"
        >
          Run Agent
        </button>
      </div>
    </div>
  );
}
