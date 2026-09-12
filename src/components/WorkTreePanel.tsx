import { useEffect } from "react";
import { useStore } from "../stores/useStore";
import type { GitStatusEntry } from "../types";

const KIND_META: Record<GitStatusEntry["kind"], { letter: string; cls: string }> = {
  added: { letter: "A", cls: "bg-emerald-500/15 text-emerald-400" },
  modified: { letter: "M", cls: "bg-amber-500/15 text-amber-400" },
  deleted: { letter: "D", cls: "bg-red-500/15 text-red-400" },
  renamed: { letter: "R", cls: "bg-cyan-500/15 text-cyan-400" },
  untracked: { letter: "?", cls: "bg-zinc-500/20 text-zinc-400" },
  conflicted: { letter: "U", cls: "bg-orange-500/15 text-orange-400" },
};

export default function WorkTreePanel() {
  const currentFolderPath = useStore((s) => s.currentFolderPath);
  const showWorkTreePanel = useStore((s) => s.showWorkTreePanel);
  const refreshGitStatus = useStore((s) => s.refreshGitStatus);
  const gitStatus = useStore((s) => s.gitStatus);
  const gitStatusLoading = useStore((s) => s.gitStatusLoading);
  const gitStatusError = useStore((s) => s.gitStatusError);
  const toggleWorkTreePanel = useStore((s) => s.toggleWorkTreePanel);
  const openGitFile = useStore((s) => s.openGitFile);
  const openGitDiff = useStore((s) => s.openGitDiff);

  useEffect(() => {
    refreshGitStatus();
  }, [currentFolderPath, showWorkTreePanel, refreshGitStatus]);

  const conflicts = gitStatus?.entries.filter((e) => e.kind === "conflicted") ?? [];
  const staged = gitStatus?.entries.filter((e) => e.kind !== "conflicted" && e.staged) ?? [];
  const unstaged =
    gitStatus?.entries.filter((e) => e.kind !== "conflicted" && !e.staged && e.kind !== "untracked") ?? [];
  const untracked = gitStatus?.entries.filter((e) => e.kind === "untracked") ?? [];

  const renderGroup = (title: string, entries: GitStatusEntry[]) => {
    if (entries.length === 0) return null;
    return (
      <div className="mb-1">
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
          {title} <span className="text-muted/60">({entries.length})</span>
        </div>
        {entries.map((entry) => renderRow(entry))}
      </div>
    );
  };

  const renderRow = (entry: GitStatusEntry) => {
    const meta = KIND_META[entry.kind];
    const abs = gitStatus ? `${gitStatus.root.replace(/\\/g, "/")}/${entry.path}` : "";
    return (
      <div
        key={`${entry.staged ? "s" : "w"}-${entry.path}`}
        onClick={() => openGitFile(entry)}
        onDoubleClick={() => openGitDiff(abs, entry.staged)}
        title={`${abs}\nSingle-click to open · Double-click to diff`}
        className="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-card/70 transition-colors"
      >
        <span
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold font-mono ${meta.cls}`}
        >
          {meta.letter}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text/80">{entry.path}</span>
        {entry.oldPath && (
          <span className="shrink-0 max-w-[40%] truncate font-mono text-[10px] text-muted">
            ← {entry.oldPath}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            openGitDiff(abs, entry.staged);
          }}
          title="View diff"
          className="shrink-0 rounded p-0.5 text-muted opacity-0 group-hover:opacity-100 hover:text-accent cursor-pointer transition-opacity"
        >
          <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5" cy="12" r="2.5" />
            <circle cx="19" cy="5" r="2.5" />
            <circle cx="19" cy="19" r="2.5" />
            <path d="M7.5 10.5 16.5 5.5M7.5 13.5l9 5" />
          </svg>
        </button>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden panel-rounded bg-card border-l border-border/40">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/30 bg-bg/30 px-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-white">Work-Tree</span>
          {gitStatus?.isRepo && gitStatus.branch ? (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-mono font-semibold text-accent">
              {gitStatus.branch}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => refreshGitStatus()}
            title="Refresh changes"
            disabled={gitStatusLoading}
            className={`rounded p-1 transition-colors ${
              gitStatusLoading ? "animate-spin cursor-default text-muted" : "text-muted hover:bg-card hover:text-white cursor-pointer"
            }`}
          >
            <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
          </button>
          <button
            onClick={toggleWorkTreePanel}
            title="Hide Work-Tree"
            className="rounded p-1 text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
          >
            <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
        {!currentFolderPath ? (
          <p className="px-3 py-4 text-[11px] text-muted">
            Open a workspace folder to see its git working-tree changes.
          </p>
        ) : !gitStatus ? (
          <p className="px-3 py-4 text-[11px] text-muted">
            {gitStatusLoading ? "Scanning repository..." : "No git status available."}
          </p>
        ) : !gitStatus.isRepo ? (
          <div className="px-3 py-4">
            <p className="text-[11px] text-muted">This folder is not part of a git repository.</p>
            <p className="mt-1 text-[10px] text-muted/60">
              Run <code className="rounded bg-bg px-1 py-0.5 font-mono">git init</code> inside the vault to track
              changes here.
            </p>
          </div>
        ) : gitStatus.entries.length === 0 ? (
          <p className="px-3 py-4 text-[11px] text-muted">Working tree clean.</p>
        ) : (
          <>
            {renderGroup("Conflicts", conflicts)}
            {renderGroup("Staged Changes", staged)}
            {renderGroup("Changes", unstaged)}
            {renderGroup("Untracked", untracked)}
          </>
        )}
        {gitStatusError && (
          <p className="px-3 py-2 text-[10px] text-red-400">Git error: {gitStatusError}</p>
        )}
      </div>
    </div>
  );
}