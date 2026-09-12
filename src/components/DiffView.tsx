import { useStore } from "../stores/useStore";

interface DiffViewProps {
  tabId: string;
  staged: boolean;
}

export default function DiffView({ tabId, staged }: DiffViewProps) {
  const patch = useStore((s) => s.diffContents[tabId]);

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
      </div>
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