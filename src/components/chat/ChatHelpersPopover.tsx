import { useEffect, useRef } from "react";
import { useStore } from "../../stores/useStore";

export interface HelperItem {
  id: string;
  label: string;
  detail?: string;
  icon: string;
  type: "file" | "command" | "directive" | "anchor";
  action: () => void;
}

interface Props {
  triggerChar: "@" | "/" | "!" | "#";
  filterText: string;
  onSelect: (item: HelperItem) => void;
  onClose: () => void;
}

export function ChatHelpersPopover({ triggerChar, filterText, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const activeLeftTab = useStore((s) => s.activeLeftTabId);
  const activeRightTab = useStore((s) => s.activeRightTabId);
  const pinnedPaths = useStore((s) => s.pinnedPaths);
  const currentFolder = useStore((s) => s.currentFolderPath);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [onClose]);

  const items: HelperItem[] = [];

  if (triggerChar === "@") {
    const activeFile = activeLeftTab || activeRightTab;
    if (activeFile) {
      const fileName = activeFile.split(/[\\/]/).pop() || activeFile;
      items.push({
        id: "active_file",
        label: `Active Note: ${fileName}`,
        detail: activeFile,
        icon: "📄",
        type: "file",
        action: () => onSelect(items[items.length - 1]),
      });
    }
    items.push({
      id: "vault_folder",
      label: currentFolder ? `Vault: ${currentFolder.split(/[\\/]/).pop()}` : "Vault Root",
      detail: "Full workspace context",
      icon: "📁",
      type: "file",
      action: () => onSelect(items[items.length - 1]),
    });
    if (pinnedPaths.length > 0) {
      items.push({
        id: "pinned_notes",
        label: `Pinned Notes (${pinnedPaths.length})`,
        detail: "All pinned notebook tabs",
        icon: "📌",
        type: "file",
        action: () => onSelect(items[items.length - 1]),
      });
    }
    items.push({
      id: "web_search",
      label: "Web Search Context",
      detail: "Search live web context via MCP",
      icon: "🌐",
      type: "file",
      action: () => onSelect(items[items.length - 1]),
    });
  } else if (triggerChar === "/") {
    items.push(
      {
        id: "cmd_plan",
        label: "/plan",
        detail: "Draft an architectural implementation plan",
        icon: "📋",
        type: "command",
        action: () => onSelect(items[0]),
      },
      {
        id: "cmd_summarize",
        label: "/summarize",
        detail: "Summarize the active note into key takeaways",
        icon: "⚡",
        type: "command",
        action: () => onSelect(items[1]),
      },
      {
        id: "cmd_explain",
        label: "/explain",
        detail: "Explain code snippets or complex concepts",
        icon: "💡",
        type: "command",
        action: () => onSelect(items[2]),
      },
      {
        id: "cmd_perspectives",
        label: "/perspectives",
        detail: "Run multi-angle analysis and fuse notes",
        icon: "🧭",
        type: "command",
        action: () => onSelect(items[3]),
      },
      {
        id: "cmd_clear",
        label: "/clear",
        detail: "Clear active conversation thread history",
        icon: "🗑️",
        type: "command",
        action: () => onSelect(items[4]),
      }
    );
  } else if (triggerChar === "!") {
    items.push(
      {
        id: "dir_high_priority",
        label: "!priority",
        detail: "Execute with high agent priority & thoroughness",
        icon: "🔥",
        type: "directive",
        action: () => onSelect(items[0]),
      },
      {
        id: "dir_strict_code",
        label: "!strict-code",
        detail: "Generate raw production code without conversational prose",
        icon: "💻",
        type: "directive",
        action: () => onSelect(items[1]),
      },
      {
        id: "dir_audit",
        label: "!audit",
        detail: "Run Auditor sanity check over proposed changes",
        icon: "🛡️",
        type: "directive",
        action: () => onSelect(items[2]),
      }
    );
  } else if (triggerChar === "#") {
    items.push(
      {
        id: "anchor_headings",
        label: "#headings",
        detail: "Reference active note headings",
        icon: "🏷️",
        type: "anchor",
        action: () => onSelect(items[0]),
      },
      {
        id: "anchor_memory",
        label: "#memory-rag",
        detail: "Recall relevant memory entries from DB",
        icon: "🧠",
        type: "anchor",
        action: () => onSelect(items[1]),
      }
    );
  }

  const filtered = items.filter(
    (it) =>
      it.label.toLowerCase().includes(filterText.toLowerCase()) ||
      (it.detail && it.detail.toLowerCase().includes(filterText.toLowerCase()))
  );

  if (filtered.length === 0) return null;

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-3 mb-2 z-50 flex w-72 flex-col rounded-2xl border border-border/70 bg-card/95 p-1.5 backdrop-blur-md shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      <div className="flex items-center justify-between px-2.5 py-1 border-b border-border/40 text-[10px] font-semibold tracking-wider text-muted uppercase">
        <span>Trigger Helpers ({triggerChar})</span>
        <span className="text-[9px] lowercase opacity-60">esc to close</span>
      </div>
      <div className="mt-1 max-h-48 overflow-y-auto space-y-0.5">
        {filtered.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className="w-full flex items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-xs text-text hover:bg-accent/10 hover:text-accent cursor-pointer transition-colors group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm shrink-0">{item.icon}</span>
              <div className="flex flex-col min-w-0">
                <span className="font-medium truncate group-hover:text-accent">{item.label}</span>
                {item.detail && <span className="text-[10px] text-muted truncate">{item.detail}</span>}
              </div>
            </div>
            <span className="text-[10px] text-muted opacity-0 group-hover:opacity-100 transition-opacity">↵</span>
          </button>
        ))}
      </div>
    </div>
  );
}
