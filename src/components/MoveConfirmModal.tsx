interface MoveItem {
  name: string;
  from: string;
  to: string;
  conflict: boolean;
}

interface MoveConfirmModalProps {
  items: MoveItem[];
  onConfirm: () => void;
  onCancel: () => void;
}

export default function MoveConfirmModal({ items, onConfirm, onCancel }: MoveConfirmModalProps) {
  const conflicts = items.filter((i) => i.conflict).length;
  const destName = items[0]?.to.split(/[\\/]/).slice(0, -1).pop() || "";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm select-none">
      <div className="flex w-full max-w-md flex-col rounded-lg border border-border bg-[#18181b] text-text shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 bg-bg/40">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-accent/20 text-accent">
              <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Move {items.length} item{items.length !== 1 ? "s" : ""}</h2>
              <p className="text-[11px] text-muted">
                {conflicts > 0 && (
                  <span className="text-amber-400">{conflicts} name conflict{conflicts !== 1 ? "s" : ""} — will rename automatically. </span>
                )}
                Destination: <span className="text-accent font-mono">{destName}</span>
              </p>
            </div>
          </div>
        </div>

        {/* List */}
        <div className="p-3 space-y-1 max-h-64 overflow-y-auto scrollbar-thin flex-1">
          {items.map((item, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 p-2 rounded border border-border/40 bg-bg/20 ${
                item.conflict ? "border-amber-500/50" : ""
              }`}
            >
              {item.from.endsWith(".md") || item.from.endsWith(".markdown") ? (
                <span className="text-[11px] text-cyan-400 font-mono font-bold shrink-0">M+</span>
              ) : (
                <svg className="w-3.5 h-3.5 stroke-current text-muted shrink-0" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              )}
              <span className="truncate text-xs font-medium text-text">{item.name}</span>
              <svg className="w-3 h-3 text-accent shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              <span className="truncate text-[10px] text-muted font-mono">
                {item.to.split(/[\\/]/).slice(0, -1).pop()}
              </span>
              {item.conflict && (
                <span className="text-[9px] text-amber-400 shrink-0">(1)</span>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-border/60 px-4 py-3 bg-bg/40">
          <button
            onClick={onCancel}
            className="rounded px-3.5 py-1.5 text-xs text-muted hover:bg-bg hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded bg-accent px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover transition-colors cursor-pointer"
          >
            Move {items.length} Item{items.length !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
