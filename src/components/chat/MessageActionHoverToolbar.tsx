import { useState, useEffect } from "react";
import { useStore, AssistantMessage, partsToContent } from "../../stores/useStore";

interface MessageActionHoverToolbarProps {
  message: AssistantMessage;
}

export function MessageActionHoverToolbar({ message }: MessageActionHoverToolbarProps) {
  const [copied, setCopied] = useState(false);
  const [isAltPressed, setIsAltPressed] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const selectedModel = useStore((s) => s.selectedModel);
  const togglePinMessage = useStore((s) => s.togglePinMessage);
  const saveMessageToNote = useStore((s) => s.saveMessageToNote);
  const saveMessageAsPlan = useStore((s) => s.saveMessageAsPlan);
  const openMessageInNoteTab = useStore((s) => s.openMessageInNoteTab);
  const forkAgentSession = useStore((s) => s.forkAgentSession);
  const activeAgentSessionId = useStore((s) => s.activeAgentSessionId);
  const startGoalRun = useStore((s) => s.startGoalRun);

  // Monitor Alt/Shift key state to dynamically switch the branch tooltip
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.shiftKey) setIsAltPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.altKey && !e.shiftKey) setIsAltPressed(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const contentText = partsToContent(message.parts) || message.content;
  const modelName = message.model || selectedModel || (message.engine === "opencode" ? "OpenCode Agent" : "BYOK Model");
  const modeTag = message.engine === "opencode" ? "build" : "primary";

  // Calculate formatted duration string if available or estimated from text length
  const durationText = message.durationMs
    ? formatDuration(message.durationMs)
    : message.steps && message.steps.length > 0
    ? formatDuration(message.steps.reduce((acc, s) => acc + (s.durationMs || 0), 0))
    : null;

  const handleCopy = () => {
    if (!contentText) return;
    navigator.clipboard.writeText(contentText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleSaveToNote = async () => {
    const path = await saveMessageToNote(message);
    if (path) {
      showToast("Saved to note");
    } else {
      showToast("Opened draft note");
    }
  };

  const handleSaveAsPlan = () => {
    saveMessageAsPlan(message);
    showToast("Saved as plan artifact");
  };

  const handleOpenInNoteTab = () => {
    openMessageInNoteTab(message);
    showToast("Opened in note tab");
  };

  const handleBranchOrMultiRun = (e: React.MouseEvent) => {
    const isMultiRun = e.shiftKey || e.altKey || isAltPressed;
    if (isMultiRun) {
      startGoalRun(contentText.slice(0, 300));
      showToast("Started multi-run from answer");
    } else if (activeAgentSessionId) {
      forkAgentSession(activeAgentSessionId).then((child) => {
        if (child) {
          showToast(`Forked: ${child.title || "New session"}`);
        }
      });
    } else {
      startGoalRun(contentText.slice(0, 300));
      showToast("Started new multi-run");
    }
  };

  const showToast = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 2000);
  };

  return (
    <div className="group/toolbar relative mt-2 flex w-full items-center justify-between border-t border-border/30 pt-1.5 text-[11px] text-muted select-none">
      {/* Left side: Metadata (Logo, Model Name, Tag, Duration, Timestamp) */}
      <div className="flex items-center gap-1.5 font-sans min-w-0 text-muted/80">
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-accent/20 text-[9px] font-bold text-accent font-mono shrink-0">
          Z
        </span>
        <span className="font-medium text-text/90 truncate max-w-[130px]" title={modelName}>
          {modelName}
        </span>
        <span className="text-muted/40">·</span>
        <span className="rounded bg-bg/60 px-1 py-0.2 text-[9.5px] font-mono text-muted/90">{modeTag}</span>
        {durationText && (
          <>
            <span className="text-muted/40">·</span>
            <span className="font-mono text-[10px] text-muted/70">{durationText}</span>
          </>
        )}
        <span className="text-muted/40">·</span>
        <span className="font-mono text-[10px] text-muted/70">{message.timestamp}</span>
        {message.isPinned && (
          <span className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-400 flex items-center gap-0.5">
            📌 Pinned
          </span>
        )}
        {actionFeedback && (
          <span className="ml-2 rounded bg-emerald-500/15 px-2 py-0.5 text-[9.5px] font-medium text-emerald-400 animate-in fade-in duration-150">
            ✓ {actionFeedback}
          </span>
        )}
      </div>

      {/* Right side: Action icon buttons with hover tooltips (hidden by default, shown on mouse hover over response message) */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity duration-150 shrink-0 ml-2">
        {/* Button 1: Copy response */}
        <ToolbarActionButton
          label={copied ? "Copied!" : "Copy response"}
          onClick={handleCopy}
          isActive={copied}
          activeIcon={
            <svg className="h-3 w-3 text-emerald-400 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          }
          icon={
            <svg className="h-3 w-3 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          }
        />

        {/* Button 2: Save to note */}
        <ToolbarActionButton
          label="Save to note"
          onClick={handleSaveToNote}
          icon={
            <svg className="h-3 w-3 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
          }
        />

        {/* Button 3: Open in note tab */}
        <ToolbarActionButton
          label="Open in note tab"
          onClick={handleOpenInNoteTab}
          icon={
            <svg className="h-3 w-3 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          }
        />

        {/* Button 4: Pin into context (survives compaction) */}
        <ToolbarActionButton
          label={message.isPinned ? "Unpin from context" : "Pin into context (survives compaction)"}
          onClick={() => togglePinMessage(message.id)}
          isActive={Boolean(message.isPinned)}
          icon={
            <svg className="h-3 w-3 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <path d="M12 17v5M9 2h6l-1 5h3l-2 7H9L7 7h3L9 2z" />
            </svg>
          }
          activeIcon={
            <svg className="h-3 w-3 text-amber-400 stroke-current fill-amber-400/20" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <path d="M12 17v5M9 2h6l-1 5h3l-2 7H9L7 7h3L9 2z" />
            </svg>
          }
        />

        {/* Button 5: Save as plan */}
        <ToolbarActionButton
          label="Save as plan"
          onClick={handleSaveAsPlan}
          icon={
            <svg className="h-3 w-3 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          }
        />

        {/* Button 6: Branch / Multi-run session */}
        <ToolbarActionButton
          label={isAltPressed ? "Start new multi-run from this answer" : "Start new session from this answer"}
          altLabel="Start new multi-run from this answer"
          onClick={handleBranchOrMultiRun}
          icon={
            <svg className="h-3 w-3 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
          }
        />
      </div>
    </div>
  );
}

interface ToolbarActionButtonProps {
  label: string;
  altLabel?: string;
  icon: React.ReactNode;
  activeIcon?: React.ReactNode;
  isActive?: boolean;
  onClick: (e: React.MouseEvent) => void;
}

function ToolbarActionButton({
  label,
  altLabel,
  icon,
  activeIcon,
  isActive,
  onClick,
}: ToolbarActionButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isAlt, setIsAlt] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.altKey || e.shiftKey) && altLabel) setIsAlt(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.altKey && !e.shiftKey) setIsAlt(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [altLabel]);

  const displayLabel = isAlt && altLabel ? altLabel : label;

  return (
    <div className="relative flex items-center">
      <button
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`group flex h-5 w-5 items-center justify-center rounded p-0.5 transition-colors cursor-pointer ${
          isActive
            ? "bg-accent/20 text-accent"
            : "text-muted/80 hover:bg-bg/80 hover:text-text"
        }`}
      >
        {isActive && activeIcon ? activeIcon : icon}
      </button>

      {/* Dark sleek floating tooltip positioned directly above the button */}
      {isHovered && (
        <div className="absolute bottom-full mb-1.5 right-0 z-50 pointer-events-none flex flex-col items-end animate-in fade-in zoom-in-95 duration-150">
          <div className="rounded-md border border-border/80 bg-[#1c1c20] px-2 py-0.5 text-[10px] font-sans font-medium text-white shadow-xl backdrop-blur-md whitespace-nowrap">
            {displayLabel}
          </div>
          <div className="mr-1.5 h-1 w-1 -mt-0.5 rotate-45 border-b border-r border-border/80 bg-[#1c1c20]" />
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (remSec === 0) return `${minutes}m`;
  return `${minutes}m ${remSec}s`;
}
