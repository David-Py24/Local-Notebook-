import { useState, useRef, useEffect } from "react";
import { useStore } from "../stores/useStore";

interface SessionContextMenuProps {
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
  onTriggerRename?: () => void;
  align?: "left" | "right";
}

export default function SessionContextMenu({
  sessionId,
  isOpen,
  onClose,
  onTriggerRename,
  align = "right",
}: SessionContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isAiRenaming, setIsAiRenaming] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const archiveAgentSession = useStore((s) => s.archiveAgentSession);
  const deleteAgentSession = useStore((s) => s.deleteAgentSession);
  const autoRenameAgentSessionWithAI = useStore((s) => s.autoRenameAgentSessionWithAI);
  const exportAgentSessionMarkdown = useStore((s) => s.exportAgentSessionMarkdown);
  const gitStatus = useStore((s) => s.gitStatus);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("mousedown", handleOutsideClick);
    }
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg(null);
      onClose();
    }, 1200);
  };

  const handleRename = () => {
    if (onTriggerRename) onTriggerRename();
    onClose();
  };

  const handleAiRename = async () => {
    setIsAiRenaming(true);
    const newTitle = await autoRenameAgentSessionWithAI(sessionId);
    setIsAiRenaming(false);
    if (newTitle) {
      showToast(`Renamed to "${newTitle}"`);
    } else {
      showToast("AI title generation failed");
    }
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(sessionId);
    showToast("Copied session ID!");
  };

  const handleShare = async () => {
    const md = await exportAgentSessionMarkdown(sessionId);
    if (md) {
      navigator.clipboard.writeText(md);
      showToast("Summary copied to clipboard!");
    } else {
      showToast("Nothing to share");
    }
  };

  const handleExportMarkdown = async () => {
    const md = await exportAgentSessionMarkdown(sessionId);
    if (md) {
      showToast("Exported Markdown to vault!");
    }
  };

  const handleArchive = async () => {
    await archiveAgentSession(sessionId);
    showToast("Session archived");
  };

  const handleDelete = async () => {
    await deleteAgentSession(sessionId);
    showToast("Session deleted");
  };

  const hasGit = gitStatus ? gitStatus.isRepo : false;

  return (
    <div
      ref={menuRef}
      className={`absolute ${align === "right" ? "right-0" : "left-0"} top-8 z-40 w-56 flex-col rounded-xl border border-border/70 bg-card/95 p-1 text-xs text-text shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none`}
    >
      {toastMsg ? (
        <div className="px-3 py-2 text-center text-[11px] font-medium text-accent">
          {toastMsg}
        </div>
      ) : showConfirmDelete ? (
        <div className="p-2.5 text-center">
          <p className="text-[11px] font-medium text-text mb-2">Delete this session permanently?</p>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={handleDelete}
              className="rounded bg-red-500/80 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-red-600 transition-colors cursor-pointer"
            >
              Delete
            </button>
            <button
              onClick={() => setShowConfirmDelete(false)}
              className="rounded bg-bg/80 px-2.5 py-1 text-[10px] font-medium text-muted hover:text-text transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col py-0.5">
          {/* Rename */}
          <button
            onClick={handleRename}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] hover:bg-bg/60 cursor-pointer transition-colors text-text"
          >
            <svg className="w-3.5 h-3.5 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span>Rename</span>
          </button>

          {/* Rename with AI */}
          <button
            onClick={handleAiRename}
            disabled={isAiRenaming}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] hover:bg-bg/60 cursor-pointer transition-colors text-text disabled:opacity-50"
          >
            {isAiRenaming ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent shrink-0" />
            ) : (
              <svg className="w-3.5 h-3.5 text-accent shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            )}
            <span>Rename with AI</span>
          </button>

          {/* Copy session ID */}
          <button
            onClick={handleCopyId}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] hover:bg-bg/60 cursor-pointer transition-colors text-text"
          >
            <svg className="w-3.5 h-3.5 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>Copy session ID</span>
          </button>

          <div className="h-px bg-border/50 my-1 mx-1" />

          {/* Share */}
          <button
            onClick={handleShare}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] hover:bg-bg/60 cursor-pointer transition-colors text-text"
          >
            <svg className="w-3.5 h-3.5 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <span>Share</span>
          </button>

          {/* Export Markdown */}
          <button
            onClick={handleExportMarkdown}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] hover:bg-bg/60 cursor-pointer transition-colors text-text"
          >
            <svg className="w-3.5 h-3.5 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Export Markdown</span>
          </button>

          {/* Move to new worktree */}
          <button
            disabled={!hasGit}
            title={hasGit ? "Create git worktree for session" : "Git not initialized in vault"}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] hover:bg-bg/60 transition-colors text-muted opacity-50 cursor-not-allowed"
          >
            <svg className="w-3.5 h-3.5 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
            <span>Move to new worktree</span>
          </button>

          <div className="h-px bg-border/50 my-1 mx-1" />

          {/* Archive */}
          <button
            onClick={handleArchive}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] hover:bg-bg/60 cursor-pointer transition-colors text-text"
          >
            <svg className="w-3.5 h-3.5 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="21 8 21 21 3 21 3 8" />
              <rect x="1" y="3" width="22" height="5" />
              <line x1="10" y1="12" x2="14" y2="12" />
            </svg>
            <span>Archive</span>
          </button>

          {/* Delete */}
          <button
            onClick={() => setShowConfirmDelete(true)}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] hover:bg-red-500/10 cursor-pointer transition-colors text-red-400 font-medium"
          >
            <svg className="w-3.5 h-3.5 text-red-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <span>Delete</span>
          </button>
        </div>
      )}
    </div>
  );
}
