import { useState } from "react";
import { useStore } from "../stores/useStore";
import { fileLabelFromHeader, parseUnifiedDiff, walkthroughDiff } from "../services/walkthroughDiff";

interface DiffViewProps {
  tabId: string;
  staged: boolean;
}

export default function DiffView({ tabId, staged }: DiffViewProps) {
  const patch = useStore((s) => s.diffContents[tabId]);
  const settings = useStore((s) => s.settings);
  const [walking, setWalking] = useState(false);
  const [narrations, setNarrations] = useState<Array<{ header: string; narration: string }> | null>(null);
  const [walkError, setWalkError] = useState<string | null>(null);

  const runWalkthrough = async () => {
    if (!patch || walking) return;
    setWalking(true);
    setWalkError(null);
    try {
      const { headerLines } = parseUnifiedDiff(patch);
      const label = fileLabelFromHeader(headerLines);
      const result = await walkthroughDiff({ patch, fileLabel: label, staged, settings });
      setNarrations(result.items);
      setWalkError(result.error ?? null);
    } catch (err) {
      setWalkError(String(err));
    } finally {
      setWalking(false);
    }
  };

  if (patch === undefined) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted">
        Loading diff...
      </div>
    );
  }

  if (!patch.trim()) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted">
        No diff — the {staged ? "index" : "working tree"} matches the committed content for this file.
      </div>
    );
  }

  const errorHeader = patch.startsWith("//");
  const lines = patch.split(/\r?\n/);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-border/30 bg-bg/30 px-3 text-[11px]">
        <span className="font-mono text-muted">
          {errorHeader ? "Diff error" : staged ? "Staged change (HEAD → Index)" : "Working-tree change (Index → Worktree)"}
        </span>
        {!errorHeader && (
          <button
            onClick={runWalkthrough}
            disabled={walking}
            className="rounded px-2 py-0.5 text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:text-muted"
            title="Narrate each diff hunk in plain language (small model)"
          >
            {walking ? "Walking…" : narrations !== null ? "Re-run walkthrough" : "Walkthrough"}
          </button>
        )}
      </div>
      {walkError && (
        <div className="border-b border-border/30 bg-red-500/5 px-3 py-1.5 text-[11px] text-red-300">
          {walkError}
        </div>
      )}
      {narrations !== null && narrations.length > 0 && (
        <div className="shrink-0 border-b border-border/30 bg-bg/60 px-3 py-2">
          <div className="space-y-2">
            {narrations.map((n, i) => (
              <div key={i} className="rounded border border-border/30 bg-bg/40 p-2">
                <div className="mb-1 font-mono text-[10px] text-accent">{n.header}</div>
                <div className="text-[11.5px] leading-relaxed text-text/85">{n.narration}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto scrollbar-thin p-1">
        <div className="font-mono text-[11.5px] leading-relaxed">
          {lines.map((line, i) => {
            let cls = "text-text/60";
            if (errorHeader && i === 0) {
              cls = "text-red-400 px-2 py-0.5";
            } else if (line.startsWith("@@")) {
              cls = "bg-accent/10 text-accent font-semibold px-2 py-0.5";
            } else if (line.startsWith("+")) {
              cls = "bg-emerald-500/10 text-emerald-300 px-2 py-0.5";
            } else if (line.startsWith("-")) {
              cls = "bg-red-500/10 text-red-300 px-2 py-0.5";
            } else if (line.startsWith("\\")) {
              cls = "text-muted italic px-2 py-0.5";
            } else if (/^(diff --git|index |new file|deleted file|similarity|rename |--- |\+\+\+ )/.test(line)) {
              cls = "text-muted px-2 py-0.5";
            } else {
              cls = "text-text/60 px-2 py-0.5";
            }
            return (
              <div key={i} className={`whitespace-pre-wrap break-all ${cls}`}>
                {line || "\u00A0"}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}