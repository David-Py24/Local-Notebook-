import { RefObject, useEffect, useRef, useState } from "react";
import { useStore, ViewMode } from "../stores/useStore";
import { BlockPrefixKind, MarkdownEditorHandle } from "./MarkdownEditor";

interface EditorContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  activeTabId: string | null;
  panel: "left" | "right";
  draft: string;
  editorRef: RefObject<MarkdownEditorHandle | null>;
  viewMode: ViewMode;
}

function MenuButton({ onClick, children, className = "" }: { onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

function MenuGroup({
  id,
  label,
  openGroup,
  onOpen,
  onRequestClose,
  children,
}: {
  id: string;
  label: string;
  openGroup: string | null;
  onOpen: (id: string) => void;
  onRequestClose: () => void;
  children: React.ReactNode;
}) {
  const isOpen = openGroup === id;
  return (
    <div
      className="relative"
      onMouseEnter={() => onOpen(id)}
      onMouseLeave={onRequestClose}
    >
      <button className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
        {label}
        <span className="text-[9px] text-muted">▶</span>
      </button>
      {isOpen && (
        <>
          {/* Invisible bridge so the pointer never leaves the hoverable area while crossing the gap to the flyout */}
          <div className="absolute left-full top-0 h-full w-2" />
          <div className="absolute left-[calc(100%+0.5rem)] top-0 flex w-48 flex-col rounded-md border border-border bg-card p-1 text-xs text-text shadow-xl">
            {children}
          </div>
        </>
      )}
    </div>
  );
}

export default function EditorContextMenu({ x, y, onClose, activeTabId, panel, draft, editorRef, viewMode }: EditorContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const openMenuGroup = (id: string) => {
    clearCloseTimeout();
    setOpenGroup(id);
  };

  const requestCloseMenuGroup = () => {
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => setOpenGroup(null), 350);
  };

  useEffect(() => clearCloseTimeout, []);
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

  const canFormat = viewMode !== "preview";

  const applyWrap = (before: string, after?: string) => {
    editorRef.current?.wrapSelection(before, after);
    onClose();
  };

  const applyBlockPrefix = (kind: BlockPrefixKind) => {
    editorRef.current?.setBlockPrefix(kind);
    onClose();
  };

  const applyInsert = (template: string, cursorOffset?: number) => {
    editorRef.current?.insertBlock(template, cursorOffset);
    onClose();
  };

  const applyFootnote = () => {
    editorRef.current?.insertFootnote();
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

      {canFormat && (
        <>
          <div className="h-px bg-border/60 my-0.5" />

          <MenuGroup id="format" label="Format" openGroup={openGroup} onOpen={openMenuGroup} onRequestClose={requestCloseMenuGroup}>
            <MenuButton onClick={() => applyWrap("**")}>Bold</MenuButton>
            <MenuButton onClick={() => applyWrap("*")}>Italic</MenuButton>
            <MenuButton onClick={() => applyWrap("~~")}>Strikethrough</MenuButton>
            <MenuButton onClick={() => applyWrap("==")}>Highlight</MenuButton>
            <MenuButton onClick={() => applyWrap("`")}>Code</MenuButton>
          </MenuGroup>

          <MenuGroup id="paragraph" label="Paragraph" openGroup={openGroup} onOpen={openMenuGroup} onRequestClose={requestCloseMenuGroup}>
            <MenuButton onClick={() => applyBlockPrefix("bullet")}>Bullet list</MenuButton>
            <MenuButton onClick={() => applyBlockPrefix("numbered")}>Numbered list</MenuButton>
            <MenuButton onClick={() => applyBlockPrefix("task")}>Task list</MenuButton>
            <div className="h-px bg-border/60 my-0.5" />
            <MenuButton onClick={() => applyBlockPrefix("h1")}>Heading 1</MenuButton>
            <MenuButton onClick={() => applyBlockPrefix("h2")}>Heading 2</MenuButton>
            <MenuButton onClick={() => applyBlockPrefix("h3")}>Heading 3</MenuButton>
            <MenuButton onClick={() => applyBlockPrefix("h4")}>Heading 4</MenuButton>
            <MenuButton onClick={() => applyBlockPrefix("h5")}>Heading 5</MenuButton>
            <MenuButton onClick={() => applyBlockPrefix("h6")}>Heading 6</MenuButton>
            <div className="h-px bg-border/60 my-0.5" />
            <MenuButton onClick={() => applyBlockPrefix("body")}>Body</MenuButton>
            <MenuButton onClick={() => applyBlockPrefix("quote")}>Quote</MenuButton>
          </MenuGroup>

          <MenuGroup id="insert" label="Insert" openGroup={openGroup} onOpen={openMenuGroup} onRequestClose={requestCloseMenuGroup}>
            <MenuButton onClick={() => applyFootnote()}>Footnote</MenuButton>
            <MenuButton onClick={() => applyInsert("\n| Header | Header |\n| --- | --- |\n|  |  |\n")}>Table</MenuButton>
            <MenuButton onClick={() => applyInsert("\n> [!note]\n> ")}>Callout</MenuButton>
            <MenuButton onClick={() => applyInsert("\n\n---\n\n")}>Horizontal rule</MenuButton>
            <MenuButton onClick={() => applyInsert("\n```\n\n```\n", 5)}>Code block</MenuButton>
          </MenuGroup>
        </>
      )}

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
