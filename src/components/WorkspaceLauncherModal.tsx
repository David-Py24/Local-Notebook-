import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "../stores/useStore";

export default function WorkspaceLauncherModal() {
  const showLauncherModal = useStore((s) => s.showLauncherModal);
  const setShowLauncherModal = useStore((s) => s.setShowLauncherModal);
  const openFolder = useStore((s) => s.openFolder);
  const scaffoldWorkspaceTemplate = useStore((s) => s.scaffoldWorkspaceTemplate);
  const projects = useStore((s) => s.projects);
  const openProject = useStore((s) => s.openProject);
  const currentFolderPath = useStore((s) => s.currentFolderPath);

  if (!showLauncherModal && currentFolderPath) return null;

  const handleOpenExistingFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === "string") {
        await openFolder(selected);
        setShowLauncherModal(false);
      }
    } catch (err) {
      alert("Failed to open folder: " + err);
    }
  };

  const handleCreateTemplatedWorkspace = async () => {
    try {
      const parent = await open({
        directory: true,
        multiple: false,
      });
      if (!parent || typeof parent !== "string") return;

      const folderName = prompt("Enter a name for the new study workspace folder:", "My Study Notebook");
      if (!folderName || !folderName.trim()) return;

      const targetPath = `${parent.replace(/\\/g, "/")}/${folderName.trim()}`;
      
      // Create folder via Tauri command
      await useStore.getState().createFolder(parent, folderName.trim());
      
      // Scaffold default template structure (Sources, Guides, _attachments, Welcome.md, Study_Plan.md)
      await scaffoldWorkspaceTemplate(targetPath);
      setShowLauncherModal(false);
    } catch (err) {
      alert("Failed to create templated workspace: " + err);
    }
  };

  const sortedProjects = [...projects].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime();
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md select-none animate-in fade-in duration-300">
      
      {/* Container matching 800x600 layout in screenshot */}
      <div className="relative flex w-[820px] h-[620px] rounded-[26px] border border-[#232323] bg-[#1C1C1C] text-text shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Optional Close button in top-right when a folder is already open */}
        {currentFolderPath && (
          <button
            onClick={() => setShowLauncherModal(false)}
            className="absolute top-5 right-5 z-10 rounded-full p-1.5 text-muted hover:bg-bg hover:text-white cursor-pointer transition-all duration-200"
            title="Close Launcher"
          >
            <svg className="w-5 h-5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        {/* LEFT PANEL: Existing Projects */}
        <div className="flex flex-col w-1/2 h-full p-10 border-r border-[#232323]">
          <div className="shrink-0 mb-6">
            <span className="text-[10px] uppercase font-bold tracking-widest text-muted/80 block mb-1">
              Existing
            </span>
            <h2 className="text-3xl font-semibold text-white tracking-tight">
              Projects
            </h2>
          </div>

          {/* Project List */}
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-2 scrollbar-thin">
            {sortedProjects.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center p-6 text-muted">
                <svg className="w-8 h-8 text-muted/30 mb-2 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <p className="text-xs font-medium text-muted/60">No recent projects</p>
                <p className="text-[10px] text-muted/40 mt-1">Use the right panel to create or open a project.</p>
              </div>
            ) : (
              sortedProjects.map((p) => (
                <div
                  key={p.id}
                  onClick={async () => {
                    await openProject(p.id);
                    setShowLauncherModal(false);
                  }}
                  className="group flex items-center gap-3.5 rounded-2xl border border-border/10 bg-card/10 p-4 cursor-pointer hover:border-accent/40 hover:bg-card/30 transition-all duration-200"
                >
                  <svg className="w-5 h-5 text-accent/60 group-hover:text-accent shrink-0 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white truncate group-hover:text-accent transition-colors">
                      {p.name}
                    </p>
                    <p className="text-[10px] text-muted truncate mt-0.5 font-mono">
                      {p.path}
                    </p>
                  </div>
                  {p.pinned && (
                    <span className="text-xs text-amber-500 shrink-0">📌</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Flux Brand & Core Action buttons */}
        <div className="flex flex-col w-1/2 h-full items-center justify-center p-12 bg-bg/10">
          
          {/* Stylized custom Flux vector logo matching mockup */}
          <div className="flex flex-col items-center mb-8">
            <svg className="w-24 h-24 text-blue-400 mb-4" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 24h12a8 8 0 0 1 8 8v0a8 8 0 0 0 8 8h12" />
              <polyline points="44 32 52 40 44 48" />
              <path d="M52 40H40a8 8 0 0 1-8-8v0a8 8 0 0 0-8-8H12" />
              <polyline points="20 32 12 24 20 16" />
              <circle cx="12" cy="40" r="2.5" fill="currentColor" stroke="none" />
            </svg>
            
            <h1 className="text-4xl font-semibold text-white tracking-tight">
              Flux
            </h1>
          </div>

          {/* Action buttons matching card pills */}
          <div className="w-full max-w-[280px] space-y-3.5">
            <button
              onClick={handleCreateTemplatedWorkspace}
              className="w-full flex items-center justify-center py-4 px-6 rounded-2xl bg-[#232323] hover:bg-[#2E2E2E] active:scale-[0.98] text-sm font-medium text-white transition-all cursor-pointer"
            >
              Create new project
            </button>
            <button
              onClick={handleOpenExistingFolder}
              className="w-full flex items-center justify-center py-4 px-6 rounded-2xl bg-[#232323] hover:bg-[#2E2E2E] active:scale-[0.98] text-sm font-medium text-white transition-all cursor-pointer"
            >
              Open existing project
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
