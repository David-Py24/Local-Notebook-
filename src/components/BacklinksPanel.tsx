import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../stores/useStore";

interface LinkItem {
  id: number | null;
  source_path: string;
  target_path: string;
  link_text: string;
  line_number: number;
}

interface BacklinksPanelProps {
  activeTabId: string | null;
  panel: "left" | "right";
}

export default function BacklinksPanel({ activeTabId, panel }: BacklinksPanelProps) {
  const openFile = useStore((s) => s.openFile);
  const [backlinks, setBacklinks] = useState<LinkItem[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!activeTabId) {
      setBacklinks([]);
      return;
    }
    let cancelled = false;
    invoke<LinkItem[]>("get_backlinks", { targetPath: activeTabId })
      .then((links) => {
        if (!cancelled) setBacklinks(links);
      })
      .catch((err) => {
        console.error("Failed to load backlinks", err);
        if (!cancelled) setBacklinks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTabId]);

  if (!activeTabId || backlinks.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-border/20 bg-bg/10 text-[11px]">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-muted hover:text-text cursor-pointer transition-colors"
      >
        <span className={`text-[9px] transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
        <span className="font-medium">Linked Mentions</span>
        <span className="text-muted/70">({backlinks.length})</span>
      </button>
      {expanded && (
        <div className="max-h-32 overflow-y-auto px-3 pb-2 space-y-1 scrollbar-thin">
          {backlinks.map((link) => {
            const name = link.source_path.split(/[\\/]/).pop() ?? link.source_path;
            return (
              <button
                key={`${link.source_path}-${link.line_number}-${link.id ?? 0}`}
                onClick={() => openFile(link.source_path, panel)}
                className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-text/80 hover:bg-card hover:text-white cursor-pointer transition-colors"
                title={link.source_path}
              >
                <span className="truncate">{name.replace(/\.md$/, "")}</span>
                <span className="shrink-0 text-muted/60 ml-2">line {link.line_number}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
