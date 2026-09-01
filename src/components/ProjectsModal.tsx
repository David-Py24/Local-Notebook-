import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "../stores/useStore";

export default function ProjectsModal() {
  const showProjectsPanel = useStore((s) => s.showProjectsPanel);
  const setShowProjectsPanel = useStore((s) => s.setShowProjectsPanel);
  const projects = useStore((s) => s.projects);
  const addProject = useStore((s) => s.addProject);
  const renameProject = useStore((s) => s.renameProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const toggleProjectPinned = useStore((s) => s.toggleProjectPinned);
  const openProject = useStore((s) => s.openProject);
  const currentFolderPath = useStore((s) => s.currentFolderPath);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  if (!showProjectsPanel) return null;

  const createProjectFromFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        const name =
          prompt("Project name:")?.trim() ||
          selected.split(/[\\/]/).pop() ||
          "Project";
        const id = `proj-${Date.now()}`;
        addProject(id, name, selected);
      }
    } catch (err) {
      alert("Failed to add project: " + err);
    }
  };

  const addCurrentFolderAsProject = async () => {
    if (!currentFolderPath) return;
    const existing = projects.find((p) => p.path === currentFolderPath);
    if (existing) {
      openProject(existing.id);
      return;
    }
    const name = currentFolderPath.split(/[\\/]/).pop() || "Project";
    const id = `proj-${Date.now()}`;
    addProject(id, name, currentFolderPath);
  };

  const handleRename = (id: string) => {
    const p = projects.find((x) => x.id === id);
    setRenamingId(id);
    setRenameVal(p?.name ?? "");
  };

  const confirmRename = () => {
    if (renamingId && renameVal.trim()) {
      renameProject(renamingId, renameVal.trim());
    }
    setRenamingId(null);
  };

  const sorted = [...projects].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime();
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative flex w-[640px] h-[520px] overflow-hidden rounded-md border border-border bg-card text-text shadow-2xl animate-in fade-in zoom-in duration-200">
        <button
          onClick={() => setShowProjectsPanel(false)}
          className="absolute top-4 right-4 z-10 rounded p-1 text-muted hover:bg-bg hover:text-text cursor-pointer transition-colors"
          title="Close"
        >
          <svg className="w-5 h-5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="flex w-full flex-col">
          <div className="shrink-0 border-b border-border p-5">
            <h2 className="text-base font-semibold text-white">Projects</h2>
            <p className="text-xs text-muted">Manage multiple study vaults as named projects.</p>
          </div>

          <div className="flex shrink-0 gap-2 p-4 border-b border-border/40">
            <button
              onClick={createProjectFromFolder}
              className="flex-1 rounded bg-accent py-2 text-xs font-semibold text-white hover:bg-accent-hover transition-colors cursor-pointer"
            >
              + New Project (Folder)
            </button>
            <button
              onClick={addCurrentFolderAsProject}
              disabled={!currentFolderPath}
              className="flex-1 rounded border border-border py-2 text-xs font-medium text-muted hover:bg-bg hover:text-white transition-colors cursor-pointer disabled:opacity-40"
            >
              Use Current Folder
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {sorted.length === 0 ? (
              <p className="p-6 text-center text-xs text-muted">
                No projects yet. Add a project to switch between vaults quickly.
              </p>
            ) : (
              sorted.map((p) => (
                <div
                  key={p.id}
                  onClick={() => openProject(p.id)}
                  className="group flex items-center gap-3 rounded-md border border-border bg-bg/50 p-3 cursor-pointer hover:border-accent/50 transition-colors"
                >
                  <svg className="w-5 h-5 stroke-current shrink-0 text-muted" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>

                  {renamingId === p.id ? (
                    <input
                      autoFocus
                      value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && confirmRename()}
                      onBlur={confirmRename}
                      onClick={(e) => e.stopPropagation()}
                      className="min-w-0 flex-1 rounded border border-border bg-card px-2 py-1 text-sm text-text outline-none"
                    />
                  ) : (
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text">{p.name}</p>
                      <p className="truncate text-[10px] text-muted">{p.path}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      title={p.pinned ? "Unpin" : "Pin"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleProjectPinned(p.id);
                      }}
                      className={`rounded p-1 hover:bg-border cursor-pointer ${p.pinned ? "text-amber-500 opacity-100" : "text-muted hover:text-white"}`}
                    >
                      <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 17v5M5 12h14M19 12l-4-4V3H9v5L5 12z" />
                      </svg>
                    </button>
                    <button
                      title="Rename"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRename(p.id);
                      }}
                      className="rounded p-1 text-muted hover:bg-border hover:text-white cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        const name = p.name;
                        if (confirm(`Delete project "${name}"? This removes it from the list (files on disk are kept).`)) {
                          deleteProject(p.id);
                        }
                      }}
                      className="rounded p-1 text-muted hover:bg-border hover:text-red-400 cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
