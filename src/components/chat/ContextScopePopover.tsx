import { useEffect, useRef } from "react";

export type ContextScopeOption = "active_note" | "pinned" | "vault" | "folder" | "selection";

interface Props {
  currentScope: ContextScopeOption;
  onSelectScope: (scope: ContextScopeOption) => void;
  onClose: () => void;
}

export function ContextScopePopover({ currentScope, onSelectScope, onClose }: Props) {
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

  const options: { id: ContextScopeOption; label: string; icon: string; desc: string }[] = [
    {
      id: "active_note",
      label: "Active Note",
      icon: "📄",
      desc: "Inject active open document into prompt context",
    },
    {
      id: "pinned",
      label: "Pinned Notes",
      icon: "📌",
      desc: "Inject contents of all pinned notebook tabs",
    },
    {
      id: "vault",
      label: "Full Vault",
      icon: "🌐",
      desc: "Hybrid keyword + embedding search across full vault",
    },
    {
      id: "folder",
      label: "Current Folder",
      icon: "📁",
      desc: "Scope context to active directory tree",
    },
    {
      id: "selection",
      label: "Active Selection",
      icon: "✂️",
      desc: "Include only currently highlighted editor text",
    },
  ];

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-6 mb-2 z-50 flex w-64 flex-col rounded-2xl border border-border/80 bg-card p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-150 text-text"
    >
      <div className="px-2.5 py-1 text-[10px] font-semibold tracking-wider text-muted/70 uppercase border-b border-border/40 mb-1">
        Context Scope Picker
      </div>

      <div className="space-y-0.5">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => {
              onSelectScope(opt.id);
              onClose();
            }}
            className={`w-full flex items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-xs cursor-pointer transition-colors ${
              currentScope === opt.id
                ? "bg-accent text-white font-medium shadow-sm"
                : "hover:bg-bg/70 text-text"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm shrink-0">{opt.icon}</span>
              <div className="flex flex-col min-w-0">
                <span className="font-medium truncate">{opt.label}</span>
                <span className={`text-[10px] truncate ${currentScope === opt.id ? "text-white/80" : "text-muted"}`}>
                  {opt.desc}
                </span>
              </div>
            </div>
            {currentScope === opt.id && (
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
