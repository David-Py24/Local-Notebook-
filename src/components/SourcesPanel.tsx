import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore, FileEntry } from "../stores/useStore";

interface ContextMenu {
  x: number;
  y: number;
  path: string;
  isDir: boolean;
}

export default function SourcesPanel() {
  const currentFolderPath = useStore((s) => s.currentFolderPath);
  const explorerEntries = useStore((s) => s.explorerEntries);
  const pinnedPaths = useStore((s) => s.pinnedPaths);
  const openFolder = useStore((s) => s.openFolder);
  const closeFolder = useStore((s) => s.closeFolder);
  const refreshExplorer = useStore((s) => s.refreshExplorer);
  const createFile = useStore((s) => s.createFile);
  const createFolder = useStore((s) => s.createFolder);
  const renameEntry = useStore((s) => s.renameEntry);
  const deleteEntry = useStore((s) => s.deleteEntry);

  const filterQuery = useStore((s) => s.filterQuery);
  const setFilterQuery = useStore((s) => s.setFilterQuery);
  const setShowLauncherModal = useStore((s) => s.setShowLauncherModal);

  const openFile = useStore((s) => s.openFile);
  const activeLeftTabId = useStore((s) => s.activeLeftTabId);
  const activeRightTabId = useStore((s) => s.activeRightTabId);
  const activeTabId = useStore((s) => (s.activePanel === "left" ? activeLeftTabId : activeRightTabId));

  // Local States
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editorVal, setEditorVal] = useState("");
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({
    "Documentation": true,
    "Guides": true,
    "Sources": true,
  });

  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  // Initial refresh of explorer on mount/folder change
  useEffect(() => {
    if (currentFolderPath) {
      refreshExplorer();
    }
  }, [currentFolderPath, refreshExplorer]);

  // Handle outside click to close context menu
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleOpenFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === "string") {
        await openFolder(selected);
      }
    } catch (err) {
      alert("Failed to open folder: " + err);
    }
  };

  // Node Context Menu
  const handleNodeContextMenu = (e: React.MouseEvent, path: string, isDir: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      path,
      isDir,
    });
  };

  const handleEmptyContextMenu = (e: React.MouseEvent) => {
    if (!currentFolderPath) return;
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      path: currentFolderPath,
      isDir: true,
    });
  };

  // Directory Tree Render Toggle
  const toggleDirExpanded = (path: string) => {
    setExpandedDirs((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  // Context Menu Actions
  const handleActionNewFile = async () => {
    if (!contextMenu) return;
    const name = prompt("Enter new file name (e.g. note.md):");
    if (!name || !name.trim()) return;
    try {
      const path = await createFile(contextMenu.path, name.trim());
      setContextMenu(null);
      await openFile(path);
    } catch (err) {
      alert("Failed to create file: " + err);
    }
  };

  const handleActionNewFolder = async () => {
    if (!contextMenu) return;
    const name = prompt("Enter new folder name:");
    if (!name || !name.trim()) return;
    try {
      await createFolder(contextMenu.path, name.trim());
      setContextMenu(null);
    } catch (err) {
      alert("Failed to create folder: " + err);
    }
  };

  const handleActionRename = () => {
    if (!contextMenu) return;
    const filename = contextMenu.path.split(/[\\/]/).pop() ?? "";
    setEditingPath(contextMenu.path);
    setEditorVal(filename);
    setContextMenu(null);
  };

  const confirmBeforeDelete = useStore((s) => s.settings.confirmBeforeDelete);

  const handleActionDelete = async () => {
    if (!contextMenu) return;
    const filename = contextMenu.path.split(/[\\/]/).pop() ?? "";
    const shouldDelete = confirmBeforeDelete
      ? confirm(`Are you sure you want to delete "${filename}"? This action cannot be undone.`)
      : true;

    if (shouldDelete) {
      try {
        await deleteEntry(contextMenu.path);
        setContextMenu(null);
      } catch (err) {
        alert("Failed to delete entry: " + err);
      }
    }
  };

  const handleRenameConfirm = async () => {
    if (editingPath && editorVal.trim()) {
      const parts = editingPath.split(/[\\/]/);
      parts.pop();
      const parent = parts.join("/");
      const newPath = `${parent}/${editorVal.trim()}`;
      try {
        await renameEntry(editingPath, newPath);
        setEditingPath(null);
      } catch (err) {
        alert("Rename failed: " + err);
      }
    }
  };

  // Filter matcher for search query
  const matchesFilter = (node: FileEntry): boolean => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    if (node.name.toLowerCase().includes(q)) return true;
    if (node.is_dir && node.children) {
      return node.children.some((child) => matchesFilter(child));
    }
    return false;
  };

  // Recursive Directory Tree Node Component
  const renderNode = (node: FileEntry, depth = 0) => {
    if (!matchesFilter(node)) return null;

    const isDir = node.is_dir;
    const isExpanded = expandedDirs[node.path] ?? (filterQuery.trim().length > 0 || depth === 0);
    const isEditing = editingPath === node.path;
    const isTabActive = activeTabId === node.path;
    const isMd = node.name.endsWith(".md") || node.name.endsWith(".markdown");

    return (
      <div key={node.path} className="flex flex-col select-none">
        {/* Row element */}
        <div
          onClick={() => {
            if (isDir) {
              toggleDirExpanded(node.path);
            } else {
              openFile(node.path);
            }
          }}
          onContextMenu={(e) => handleNodeContextMenu(e, node.path, isDir)}
          style={{ paddingLeft: `${depth * 10 + 4}px` }}
          className={`group flex items-center gap-1 py-1 px-1.5 rounded-md cursor-pointer transition-colors ${
            isTabActive
              ? "bg-[#252836] text-white font-medium"
              : "text-text/80 hover:bg-bg/60 hover:text-text"
          }`}
        >
          {isDir ? (
            /* Folder Chevron */
            <span className="w-3 text-center text-[9px] text-muted group-hover:text-text font-mono shrink-0">
              {isExpanded ? "v" : ">"}
            </span>
          ) : (
            /* File M+ badge for markdown files */
            isMd ? (
              <span className="text-[9px] text-cyan-400 font-mono font-bold shrink-0 mr-0.5">
                M+
              </span>
            ) : (
              <span className="w-2.5 text-center text-[9px] text-muted shrink-0">·</span>
            )
          )}

          {isEditing ? (
            <input
              autoFocus
              value={editorVal}
              onChange={(e) => setEditorVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRenameConfirm()}
              onBlur={handleRenameConfirm}
              onClick={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 rounded border border-border bg-card px-1 py-0.5 text-xs text-text outline-none"
            />
          ) : (
            <span className="truncate text-xs tracking-tight">{node.name}</span>
          )}

          {/* Pin marker */}
          {!isDir && pinnedPaths.includes(node.path) && (
            <span className="text-[8px] text-amber-500 ml-auto shrink-0" title="Pinned">
              📌
            </span>
          )}
        </div>

        {/* Children directories */}
        {isDir && isExpanded && node.children && (
          <div className="flex flex-col">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const folderName = currentFolderPath ? currentFolderPath.split(/[\\/]/).pop() : "Local Study Notebook";

  return (
    <div className="flex h-full flex-col overflow-hidden panel-rounded bg-card border-r border-border/40">
      {/* Top Header */}
      <div className="flex shrink-0 items-center justify-between px-2.5 py-2 bg-bg/20 border-b border-border/30">
        <h2 className="text-xs font-semibold text-text truncate select-none">
          {folderName}
        </h2>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setShowLauncherModal(true)}
            title="Open Launcher / Start Workspace"
            className="rounded p-1 text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
          >
            <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button
            onClick={refreshExplorer}
            title="Refresh files"
            className="rounded p-1 text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
          >
            <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <path d="M23 4v6h-6" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>
      </div>

      {/* Filter Files search */}
      <div className="shrink-0 p-1.5 border-b border-border/30 bg-bg/10">
        <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-bg/40 px-2 py-0.5 text-xs text-text focus-within:border-accent/80 transition-colors">
          <svg className="w-3 h-3 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Filter files"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full bg-transparent text-xs text-text placeholder:text-muted/60 outline-none"
          />
          {filterQuery && (
            <button
              onClick={() => setFilterQuery("")}
              className="text-[10px] text-muted hover:text-white"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Tree Content */}
      <div
        onContextMenu={handleEmptyContextMenu}
        className="flex-1 overflow-y-auto p-1 space-y-0.5 scrollbar-thin"
      >
        {!currentFolderPath ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-muted">
            <p className="text-xs font-semibold text-text mb-1">No vault open</p>
            <button
              onClick={() => setShowLauncherModal(true)}
              className="rounded bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-hover transition-colors cursor-pointer"
            >
              Launch Workspace
            </button>
          </div>
        ) : explorerEntries.length === 0 ? (
          <p className="p-3 text-center text-[10px] text-muted">Empty folder.</p>
        ) : (
          explorerEntries.map((node) => renderNode(node))
        )}
      </div>

      {/* Floating Right Click Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 flex w-36 flex-col rounded-md border border-border bg-card p-1 text-xs text-text shadow-xl"
        >
          {contextMenu.isDir && (
            <>
              <button
                onClick={handleActionNewFile}
                className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
              >
                New File
              </button>
              <button
                onClick={handleActionNewFolder}
                className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
              >
                New Folder
              </button>
              <div className="h-px bg-border/60 my-0.5" />
            </>
          )}
          {contextMenu.path !== currentFolderPath && (
            <>
              <button
                onClick={handleActionRename}
                className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
              >
                Rename
              </button>
              <button
                onClick={handleActionDelete}
                className="rounded px-2.5 py-1.5 text-left text-red-400 hover:bg-red-500 hover:text-white cursor-pointer transition-colors"
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
