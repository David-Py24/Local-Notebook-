import { useStore } from "../stores/useStore";

export default function Navbar() {
  const showSidebar = useStore((s) => s.showSourcesPanel);
  const toggleSidebar = useStore((s) => s.toggleSourcesPanel);
  const showAssistant = useStore((s) => s.showAssistantPanel);
  const toggleAssistant = useStore((s) => s.toggleAssistantPanel);
  const showAgent = useStore((s) => s.showAgentPanel);
  const toggleAgent = useStore((s) => s.toggleAgentPanel);
  const openNewNote = useStore((s) => s.openNewNote);
  const setShowSettings = useStore((s) => s.setShowSettings);

  return (
    <nav className="flex w-12 shrink-0 flex-col items-center justify-between panel-rounded border border-border bg-card py-3 select-none">
      {/* Top Icons */}
      <div className="flex flex-col items-center gap-2 w-full">
        {/* Assistant Panel Toggle (Sparkles / AI Chat Icon) */}
        <button
          onClick={toggleAssistant}
          title="Toggle Study Assistant"
          className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors cursor-pointer ${
            showAssistant
              ? "bg-accent text-white shadow-sm"
              : "text-muted hover:bg-bg hover:text-white"
          }`}
        >
          <svg className="w-4.5 h-4.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        </button>

        {/* Explorer Toggle Button (Folder Icon) */}
        <button
          onClick={toggleSidebar}
          title="Toggle File Explorer"
          className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors cursor-pointer ${
            showSidebar
              ? "bg-accent text-white shadow-sm"
              : "text-muted hover:bg-bg hover:text-white"
          }`}
        >
          <svg className="w-4.5 h-4.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </button>

        {/* Agent Panel Toggle (Lightning / Focus Icon) */}
        <button
          onClick={toggleAgent}
          title="Toggle Agent Panel"
          className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors cursor-pointer ${
            showAgent
              ? "bg-accent text-white shadow-sm"
              : "text-muted hover:bg-bg hover:text-white"
          }`}
        >
          <svg className="w-4.5 h-4.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </button>

        <div className="w-6 border-b border-border/60 my-1" />

        {/* New Note Button (Plus Document Icon) */}
        <button
          onClick={openNewNote}
          title="Create New Note (Ctrl+N)"
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
        >
          <svg className="w-4.5 h-4.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
          </svg>
        </button>
      </div>

      {/* Bottom Settings Button (Gear Icon) */}
      <button
        onClick={() => setShowSettings(true)}
        title="Settings"
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
      >
        <svg className="w-5 h-5 stroke-current animate-hover-spin" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </nav>
  );
}
