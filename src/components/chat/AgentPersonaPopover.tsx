import { useEffect, useRef } from "react";

export type AgentModeOption = "build" | "plan" | "perspectives" | "research";

interface Props {
  currentMode: AgentModeOption;
  onSelectMode: (mode: AgentModeOption) => void;
  onClose: () => void;
}

export function AgentPersonaPopover({ currentMode, onSelectMode, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [onClose]);

  const modes: { id: AgentModeOption; label: string; icon: string; desc: string }[] = [
    {
      id: "build",
      label: "Build Mode",
      icon: "🛠️",
      desc: "Executes workspace tools, code modifications & note updates",
    },
    {
      id: "plan",
      label: "Plan Mode",
      icon: "📋",
      desc: "Drafts detailed architectural plans before changing code",
    },
    {
      id: "perspectives",
      label: "Perspectives Mode",
      icon: "🧭",
      desc: "Analyzes topics from N angles and synthesizes balanced notes",
    },
    {
      id: "research",
      label: "Research Mode",
      icon: "🔍",
      desc: "Queries Memory-RAG, documentation & web MCP connectors",
    },
  ];

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-20 mb-2 z-50 flex w-68 flex-col rounded-2xl border border-border/80 bg-card p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-150 text-text"
    >
      <div className="px-2.5 py-1 text-[10px] font-semibold tracking-wider text-muted/70 uppercase border-b border-border/40 mb-1">
        Agent Persona / Mode
      </div>

      <div className="space-y-0.5">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => {
              onSelectMode(m.id);
              onClose();
            }}
            className={`w-full flex items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-xs cursor-pointer transition-colors ${
              currentMode === m.id
                ? "bg-accent text-white font-medium shadow-sm"
                : "hover:bg-bg/70 text-text"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm shrink-0">{m.icon}</span>
              <div className="flex flex-col min-w-0">
                <span className="font-medium truncate">{m.label}</span>
                <span className={`text-[10px] truncate ${currentMode === m.id ? "text-white/80" : "text-muted"}`}>
                  {m.desc}
                </span>
              </div>
            </div>
            {currentMode === m.id && (
              <svg className="h-3.5 w-3.5 shrink-0 fill-current" viewBox="0 0 24 24">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
