import { useEffect, useRef, useState } from "react";
import { useStore } from "../stores/useStore";

interface EditorContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  activeTabId: string | null;
  panel: "left" | "right";
  draft: string;
}

export default function EditorContextMenu({ x, y, onClose, activeTabId, panel, draft }: EditorContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const togglePinPath = useStore((s) => s.togglePinPath);
  const pinnedPaths = useStore((s) => s.pinnedPaths);
  const openFile = useStore((s) => s.openFile);
  const deleteEntry = useStore((s) => s.deleteEntry);
  const renameEntry = useStore((s) => s.renameEntry);
  const createFile = useStore((s) => s.createFile);
  const flushPendingSave = useStore((s) => s.flushPendingSave);
  const currentFolderPath = useStore((s) => s.currentFolderPath);

  const [showRenameInput, setShowRenameInput] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", handle);
    return () => window.removeEventListener("mousedown", handle);
  }, [onClose]);

  useEffect(() => {
    if (showRenameInput && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [showRenameInput]);

  if (!activeTabId) return null;

  const isPinned = pinnedPaths.includes(activeTabId);
  const fileName = activeTabId.split(/[\\/]/).pop() || "Note";

  const handleCopy = async (format: "markdown" | "text" | "html") => {
    let content = draft;
    if (format === "html") {
      const el = document.createElement("div");
      el.innerHTML = draft;
      content = el.textContent || el.innerText || draft;
    }
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      document.execCommand("copy");
    }
    onClose();
  };

  const handleCut = () => {
    document.execCommand("cut");
    onClose();
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      document.execCommand("insertText", false, text);
    } catch {
      document.execCommand("paste");
    }
    onClose();
  };

  const handleSelectAll = () => {
    document.execCommand("selectAll");
    onClose();
  };

  const handleDuplicate = async () => {
    if (!currentFolderPath || !activeTabId) { onClose(); return; }
    await flushPendingSave(panel);
    const dir = activeTabId.replace(/[\\/][^\\/]+$/, "");
    const baseName = fileName.replace(/\.md$/, "");
    const copyName = `${baseName} Copy`;
    try {
      const newPath = await createFile(dir, copyName);
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("write_local_file", { path: newPath, content: draft, vaultRoot: currentFolderPath });
      await openFile(newPath);
    } catch (err) {
      console.error("Duplicate failed", err);
    }
    onClose();
  };

  const handleRenameStart = () => {
    setRenameValue(fileName.replace(/\.md$/, ""));
    setShowRenameInput(true);
  };

  const handleRenameConfirm = async () => {
    if (!renameValue.trim() || !activeTabId) { setShowRenameInput(false); onClose(); return; }
    const dir = activeTabId.replace(/[\\/][^\\/]+$/, "");
    const ext = activeTabId.endsWith(".md") ? ".md" : "";
    const newPath = `${dir}/${renameValue.trim()}${ext}`.replace(/[\\/]+/g, "/");
    try {
      await renameEntry(activeTabId, newPath);
    } catch (err) {
      console.error("Rename failed", err);
    }
    setShowRenameInput(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!activeTabId) { onClose(); return; }
    try {
      await deleteEntry(activeTabId);
    } catch (err) {
      console.error("Delete failed", err);
    }
    onClose();
  };

  return (
    <div
      ref={ref}
      style={{ top: `${y}px`, left: `${x}px` }}
      className="fixed z-50 flex w-52 flex-col rounded-md border border-border bg-card p-1 text-xs text-text shadow-xl"
    >
      {/* Clipboard */}
      <button onClick={handleCopy.bind(null, "text")} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
        Copy
      </button>
      <button onClick={handleCut} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
        Cut
      </button>
      <button onClick={handlePaste} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
        Paste
      </button>
      <button onClick={handleSelectAll} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
        Select All
      </button>

      <div className="h-px bg-border/60 my-0.5" />

      {/* Note Management */}
      <button onClick={handleDuplicate} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
        Duplicate Note
      </button>

      {showRenameInput ? (
        <div className="px-2 py-1">
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameConfirm();
              if (e.key === "Escape") { setShowRenameInput(false); onClose(); }
            }}
            className="w-full rounded border border-accent bg-bg px-2 py-1 text-xs text-text outline-none"
          />
        </div>
      ) : (
        <button onClick={handleRenameStart} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
          Rename Note
        </button>
      )}

      <button onClick={handleDelete} className="rounded px-2.5 py-1.5 text-left text-red-400 hover:bg-red-500 hover:text-white cursor-pointer transition-colors">
        Delete Note
      </button>

      <div className="h-px bg-border/60 my-0.5" />

      {/* Copy As */}
      <button onClick={() => handleCopy("markdown")} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
        Copy as Markdown
      </button>
      <button onClick={() => handleCopy("text")} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
        Copy as Plain Text
      </button>
      <button onClick={() => handleCopy("html")} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
        Copy as HTML
      </button>

      <div className="h-px bg-border/60 my-0.5" />

      {/* Navigation & Pinning */}
      <button
        onClick={() => { togglePinPath(activeTabId); onClose(); }}
        className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
      >
        {isPinned ? "Unpin Note" : "Pin Note"}
      </button>
      <button onClick={() => { openFile(activeTabId, panel === "left" ? "right" : "left"); onClose(); }} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
        Open in Other Pane
      </button>
    </div>
  );
}
