import { useState } from "react";
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

  const [inputVal, setInputVal] = useState("");

  const handleSend = () => {
    const text = inputVal.trim();
    if (!text) return;
    addAgentMessage({ id: "user-" + Date.now(), role: "user", text, timestamp: Date.now() });
    setInputVal("");
    addAgentMessage({
      id: "agent-" + Date.now(),
      role: "agent",
      text: `I've registered your ${agentTask} request. (Scaffold — agent processing will be wired here.)`,
      timestamp: Date.now(),
    });
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
