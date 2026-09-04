import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore, FileEntry } from "../stores/useStore";
import MoveConfirmModal from "./MoveConfirmModal";

interface ContextMenu {
  x: number;
  y: number;
  path: string;
  isDir: boolean;
}

export const FILE_DRAG_MIME = "application/x-lsn-file-entry";

interface MoveItem {
  name: string;
  from: string;
  to: string;
  conflict: boolean;
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
  const moveEntries = useStore((s) => s.moveEntries);

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

  // Selection + Drag/Drop states
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [lastClickedPath, setLastClickedPath] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [dragOverRoot, setDragOverRoot] = useState(false);
  const [pendingMove, setPendingMove] = useState<MoveItem[] | null>(null);

  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const lastClickTimeRef = useRef(0);

  // Initial refresh of explorer on mount/folder change
  useEffect(() => {
    if (currentFolderPath) {
      refreshExplorer();
    }
    setSelectedPaths([]);
    setLastClickedPath(null);
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

  // Flatten the visible tree for shift-click range selection
  const flattenTree = (nodes: FileEntry[]): string[] => {
    const result: string[] = [];
    const walk = (list: FileEntry[]) => {
      for (const node of list) {
        result.push(node.path);
        if (node.is_dir && node.children) walk(node.children);
      }
    };
    walk(nodes);
    return result;
  };

  // Compute the ordered list of all paths once per explorerEntries change
  const orderedPaths = flattenTree(explorerEntries);

  useEffect(() => {
    setOrder(orderedPaths);
  }, [JSON.stringify(orderedPaths)]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Click handler for node selection (with multi-select)
  const handleNodeClick = (e: React.MouseEvent, node: FileEntry) => {
    const now = Date.now();
    lastClickTimeRef.current = now;

    if (e.ctrlKey || e.metaKey) {
      e.stopPropagation();
      setSelectedPaths((prev) =>
        prev.includes(node.path) ? prev.filter((p) => p !== node.path) : [...prev, node.path]
      );
      return;
    }

    if (e.shiftKey && lastClickedPath && order.length > 0) {
      e.stopPropagation();
      const startIdx = order.indexOf(lastClickedPath);
      const endIdx = order.indexOf(node.path);
      if (startIdx !== -1 && endIdx !== -1) {
        const [min, max] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        setSelectedPaths(order.slice(min, max + 1));
        setLastClickedPath(node.path);
        return;
      }
    }

    // Plain click: clear selection, open file / toggle folder
    setSelectedPaths([]);
    setLastClickedPath(node.path);
    if (node.is_dir) {
      toggleDirExpanded(node.path);
    } else {
      openFile(node.path);
    }
  };

  // Drag handlers
  const isFileDrag = (e: React.DragEvent): boolean => {
    return e.dataTransfer.types.includes(FILE_DRAG_MIME);
  };

  const handleDragStart = (e: React.DragEvent, path: string) => {
    if (!currentFolderPath) return;
    e.stopPropagation();
    setIsDragging(true);
    // Drag the selection if this node is part of it; otherwise drag just this node
    const paths = selectedPaths.includes(path) ? selectedPaths : [path];
    e.dataTransfer.setData(FILE_DRAG_MIME, JSON.stringify({ paths, vaultRoot: currentFolderPath }));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setDragOverPath(null);
    setDragOverRoot(false);
  };

  const isDescendant = (nodePath: string, ancestorPath: string): boolean => {
    if (nodePath === ancestorPath) return true;
    const normNode = nodePath.replace(/\\/g, "/");
    const normAncestor = ancestorPath.replace(/\\/g, "/");
    return normNode.startsWith(normAncestor.endsWith("/") ? normAncestor : normAncestor + "/");
  };

  const handleDirectoryDrop = (e: React.DragEvent, destDir: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPath(null);
    setDragOverRoot(false);
    setIsDragging(false);

    if (!currentFolderPath) return;
    const raw = e.dataTransfer.getData(FILE_DRAG_MIME);
    if (!raw) return;
    const { paths } = JSON.parse(raw) as { paths: string[]; vaultRoot: string };

    // Filter out invalid moves
    const valid = paths.filter((p) => {
      if (p === currentFolderPath) return false;
      if (isDescendant(destDir, p)) return false; // can't drop a folder into itself/descendant
      const parent = p.replace(/\\/g, "/").replace(/\/[^/]*$/, "");
      const normDest = destDir.replace(/\\/g, "/").replace(/\/+$/, "");
      return parent !== normDest; // moving into same dir is no-op
    });

    if (valid.length === 0) return;

    const items: MoveItem[] = valid.map((p) => {
      const name = p.split(/[\\/]/).pop() || "";
      const joined = `${destDir.replace(/\\/g, "/").replace(/\/+$/, "")}/${name}`;
      return { name, from: p, to: joined, conflict: pathExists(joined) };
    });

    setPendingMove(items);
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
        setSelectedPaths([]);
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
        setSelectedPaths((prev) =>
          prev.map((p) => (p === editingPath ? newPath : p))
        );
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

  const isSelected = (path: string) => selectedPaths.includes(path);

  // Check if a target path exists in the tree (for conflict detection).
  // Normalize separators so forward/backslash comparisons match.
  const normPath = (p: string): string => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const pathExists = (path: string): boolean => order.some((o) => normPath(o) === normPath(path));

  const resolveConflict = (targetPath: string): string => {
    if (!pathExists(targetPath)) return targetPath;
    const base = targetPath;
    const dot = targetPath.lastIndexOf(".");
    const stem = dot > targetPath.lastIndexOf("/") ? targetPath.slice(0, dot) : targetPath;
    const ext = dot > targetPath.lastIndexOf("/") ? targetPath.slice(dot) : "";
    let i = 1;
    let candidate = `${stem} (${i})${ext}`;
    while (pathExists(candidate)) {
      i++;
      candidate = `${stem} (${i})${ext}`;
    }
    return candidate;
  };

  const handleMoveConfirm = async () => {
    if (!pendingMove) return;
    const resolved: { oldPath: string; newPath: string }[] = [];
    for (const item of pendingMove) {
      resolved.push({ oldPath: item.from, newPath: resolveConflict(item.to) });
    }
    try {
      await moveEntries(resolved);
      setPendingMove(null);
      setSelectedPaths([]);
    } catch (err) {
      alert("Move failed: " + err);
    }
  };

  // Recursive Directory Tree Node Component
  const renderNode = (node: FileEntry, depth = 0) => {
    if (!matchesFilter(node)) return null;

    const isDir = node.is_dir;
    const isExpanded = expandedDirs[node.path] ?? (filterQuery.trim().length > 0 || depth === 0);
    const isEditing = editingPath === node.path;
    const isTabActive = activeTabId === node.path;
    const isMd = node.name.endsWith(".md") || node.name.endsWith(".markdown");
    const selected = isSelected(node.path);
    const dragOver = dragOverPath === node.path && isDir;

    return (
      <div key={node.path} className="flex flex-col select-none">
        {/* Row element */}
        <div
          draggable={!isEditing && !!currentFolderPath}
          onDragStart={(e) => handleDragStart(e, node.path)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => {
            if (!isFileDrag(e)) return;
            e.preventDefault();
            e.stopPropagation();
            if (isDir) setDragOverPath(node.path);
          }}
          onDragLeave={() => {
            if (dragOverPath === node.path) setDragOverPath(null);
          }}
          onDrop={(e) => {
            if (isDir) handleDirectoryDrop(e, node.path);
          }}
          onClick={(e) => handleNodeClick(e, node)}
          onContextMenu={(e) => handleNodeContextMenu(e, node.path, isDir)}
          style={{ paddingLeft: `${depth * 10 + 4}px` }}
          className={`group flex items-center gap-1 py-1 px-1.5 rounded-md cursor-pointer transition-colors ${
            dragOver
              ? "bg-accent/20 border border-accent/60"
              : selected
              ? "bg-accent/15 border border-accent/40"
              : "border border-transparent "
          } ${
            isTabActive && !selected
              ? "bg-[#252836] text-white font-medium"
              : selected
              ? "text-white"
              : "text-text/80 hover:bg-bg/60 hover:text-text"
          }`}
        >
          {isDir ? (
            <span className="w-4 text-center text-[11px] text-muted group-hover:text-text font-mono shrink-0">
              {isExpanded ? "v" : ">"}
            </span>
          ) : isMd ? (
            <span className="text-[11px] text-cyan-400 font-mono font-bold shrink-0 mr-0.5">
              M+
            </span>
          ) : (
            <span className="w-3 text-center text-[11px] text-muted shrink-0">·</span>
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
            <span className="text-[10px] text-amber-500 ml-auto shrink-0" title="Pinned">
              📌
            </span>
          )}
        </div>

        {/* Drop target when a directory is expanded (blank space below children) */}
        {isDir && isExpanded && node.children && node.children.length > 0 && (
          <div
            onDragOver={(e) => {
              if (!isFileDrag(e)) return;
              e.preventDefault();
              e.stopPropagation();
              setDragOverPath(node.path);
            }}
            onDragLeave={() => {
              if (dragOverPath === node.path) setDragOverPath(null);
            }}
            onDrop={(e) => handleDirectoryDrop(e, node.path)}
            style={{ marginLeft: `${(depth + 1) * 10 + 4}px` }}
            className={`flex items-center justify-center rounded py-0.5 mx-1 text-[9px] text-muted transition-colors ${
              dragOverPath === node.path ? "bg-accent/15 text-accent" : "hover:bg-bg/40"
            }`}
          >
            <span className="opacity-60">— drop to move into this folder —</span>
          </div>
        )}

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
            <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button
            onClick={refreshExplorer}
            title="Refresh files"
            className="rounded p-1 text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
          >
            <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <path d="M23 4v6h-6" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>
      </div>

      {/* Filter Files search */}
      <div className="shrink-0 p-1.5 border-b border-border/30 bg-bg/10">
        <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-bg/40 px-2 py-0.5 text-xs text-text focus-within:border-accent/80 transition-colors">
          <svg className="w-3.5 h-3.5 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Filter files"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            onFocus={() => setSelectedPaths([])}
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
        onClick={() => {
          const t = Date.now();
          if (t - lastClickTimeRef.current > 100) {
            setSelectedPaths([]);
            setLastClickedPath(null);
          }
        }}
        onDragOver={(e) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          if (currentFolderPath) setDragOverRoot(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverRoot(false);
        }}
        onDrop={(e) => {
          if (currentFolderPath) handleDirectoryDrop(e, currentFolderPath);
        }}
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

      {/* Drop target bar when dragging (move to vault root) */}
      {isDragging && currentFolderPath && (
        <div
          onDragOver={(e) => {
            if (!isFileDrag(e)) return;
            e.preventDefault();
            e.stopPropagation();
            setDragOverRoot(true);
          }}
          onDragLeave={() => setDragOverRoot(false)}
          onDrop={(e) => handleDirectoryDrop(e, currentFolderPath)}
          className={`shrink-0 mx-2 my-1.5 flex items-center justify-center gap-1.5 rounded-md border border-dashed py-1.5 text-[10px] transition-colors ${
            dragOverRoot
              ? "border-accent bg-accent/15 text-accent"
              : "border-border/60 text-muted"
          }`}
        >
          <svg className="w-3 h-3 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          Drop here to move to {folderName}
        </div>
      )}

      {/* Selection action bar */}
      {selectedPaths.length > 0 && !isDragging && (
        <div className="shrink-0 mx-2 my-1.5 flex items-center justify-between rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5">
          <span className="text-[10px] font-semibold text-accent">
            {selectedPaths.length} selected
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-muted hidden sm:inline">Drag to move</span>
            <button
              onClick={() => setSelectedPaths([])}
              className="rounded px-1.5 py-0.5 text-[10px] text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
              title="Clear selection"
            >
              ✕
            </button>
          </div>
        </div>
      )}

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

      {/* Move Confirmation Modal */}
      {pendingMove && (
        <MoveConfirmModal
          items={pendingMove}
          onConfirm={handleMoveConfirm}
          onCancel={() => setPendingMove(null)}
        />
      )}
    </div>
  );
}
