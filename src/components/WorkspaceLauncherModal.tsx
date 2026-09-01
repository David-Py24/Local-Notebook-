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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs select-none">
      <div className="flex w-full max-w-xl flex-col rounded-xl border border-border bg-[#18181b] text-text shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4 bg-bg/40">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/20 text-accent font-bold font-mono">
              L
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Local Study Notebook</h2>
              <p className="text-[11px] text-muted">Start a new study vault or open an existing workspace</p>
            </div>
          </div>

          {currentFolderPath && (
            <button
              onClick={() => setShowLauncherModal(false)}
              className="rounded p-1 text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* Content Options */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {/* Create Templated Workspace */}
            <button
              onClick={handleCreateTemplatedWorkspace}
              className="group flex flex-col items-start p-4 rounded-lg border border-accent/40 bg-accent/10 hover:bg-accent/20 hover:border-accent transition-all text-left cursor-pointer"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-white mb-2 shadow-xs group-hover:scale-105 transition-transform">
                <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <h3 className="text-xs font-bold text-white mb-1">Create Templated Project</h3>
              <p className="text-[10px] text-muted leading-relaxed">
                Scaffolds default folders (<code className="text-cyan-400">Sources/</code>, <code className="text-cyan-400">Guides/</code>), <code className="text-cyan-400">Welcome.md</code> & study plans automatically.
              </p>
            </button>

            {/* Open Existing Folder */}
            <button
              onClick={handleOpenExistingFolder}
              className="group flex flex-col items-start p-4 rounded-lg border border-border/80 bg-bg/40 hover:bg-card hover:border-text/40 transition-all text-left cursor-pointer"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border/80 bg-bg text-muted group-hover:text-white mb-2 shadow-xs group-hover:scale-105 transition-transform">
                <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h3 className="text-xs font-bold text-white mb-1">Open Existing Workspace</h3>
              <p className="text-[10px] text-muted leading-relaxed">
                Browse your local drive and select an existing study folder or vault.
              </p>
            </button>
          </div>

          {/* Recent Workspaces / Projects list */}
          {projects.length > 0 && (
            <div className="pt-2 border-t border-border/40">
              <h4 className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Recent Workspaces</h4>
              <div className="space-y-1 max-h-36 overflow-y-auto scrollbar-thin pr-1">
                {projects.slice(0, 4).map((proj) => (
                  <div
                    key={proj.id}
                    onClick={async () => {
                      await openProject(proj.id);
                      setShowLauncherModal(false);
                    }}
                    className="flex items-center justify-between p-2 rounded-md border border-border/40 bg-bg/20 hover:bg-card hover:border-accent/40 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <svg className="w-3.5 h-3.5 stroke-current text-accent shrink-0" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      <span className="truncate text-xs font-medium text-text">{proj.name}</span>
                    </div>
                    <span className="text-[9px] text-muted shrink-0 font-mono">
                      {proj.path.split(/[\\/]/).pop()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
