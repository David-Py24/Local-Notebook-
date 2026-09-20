import { useEffect, useRef, useState } from "react";
import { useStore } from "../../stores/useStore";
import { TurnGroup } from "./TurnGroup";
import { StatusRow } from "./StatusRow";
import { FluxMark } from "./FluxMark";

function EmptyState({ engine }: { engine: "opencode" | "byok" }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center px-6 text-center select-none">
      <FluxMark className="mb-3 h-11 w-11 text-accent/80" />
      <p className="text-sm font-semibold tracking-tight text-text">
        {engine === "opencode" ? "OpenCode Agent" : "Study Assistant"}
      </p>
      <p className="mt-1.5 max-w-[240px] text-[11px] leading-relaxed text-muted">
        {engine === "opencode"
          ? "Ask it to write, edit, or refactor notes in your workspace."
          : "Ask questions about your notes, summarize sources, or plan your study."}
      </p>
    </div>
  );
}

export function ChatContainer() {
  const assistantMessages = useStore((s) => s.assistantMessages);
  const isAssistantStreaming = useStore((s) => s.isAssistantStreaming);
  const assistantStatusText = useStore((s) => s.assistantStatusText);
  const engine = useStore((s) => s.settings.assistantEngine);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const scrollToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [assistantMessages]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isUp = scrollHeight - scrollTop - clientHeight > 100;
    setShowScrollBottom(isUp);
  };

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-5 py-4"
      >
        {assistantMessages.length === 0 ? (
          <EmptyState engine={engine} />
        ) : (
          <div className="space-y-5">
            <TurnGroup messages={assistantMessages} />
          </div>
        )}
        {isAssistantStreaming && assistantStatusText && <StatusRow statusText={assistantStatusText} />}
        <div ref={endRef} />
      </div>

      {/* Floating Scroll to Bottom Button (Screenshot 2 style) */}
      {showScrollBottom && (
        <button
          onClick={scrollToBottom}
          title="Scroll to bottom"
          className="absolute bottom-3 left-4 z-40 flex h-8 w-8 items-center justify-center rounded-full border border-border/80 bg-card/90 text-text shadow-xl backdrop-blur-md hover:bg-accent hover:text-white cursor-pointer transition-all animate-in fade-in duration-150"
        >
          <svg className="h-4 w-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </svg>
        </button>
      )}
    </div>
  );
}