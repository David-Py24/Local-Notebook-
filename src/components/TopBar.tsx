import { useState, useRef, useEffect } from "react";
import { useStore } from "../stores/useStore";

export default function TopBar() {
  const sessions = useStore((s) => s.sessions);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const selectSession = useStore((s) => s.selectSession);
  const createSession = useStore((s) => s.createSession);
  const closeSession = useStore((s) => s.closeSession);

  const toggleAssistantPanel = useStore((s) => s.toggleAssistantPanel);
  const showAssistantPanel = useStore((s) => s.showAssistantPanel);
  const toggleSourcesPanel = useStore((s) => s.toggleSourcesPanel);
  const showSourcesPanel = useStore((s) => s.showSourcesPanel);
  const toggleArtifactsPanel = useStore((s) => s.toggleArtifactsPanel);
  const showArtifactsPanel = useStore((s) => s.showArtifactsPanel);
  const splitActive = useStore((s) => s.splitActive);
  const splitScreen = useStore((s) => s.splitScreen);
  const closeSplit = useStore((s) => s.closeSplit);

  const setShowSettings = useStore((s) => s.setShowSettings);
  const setShowLauncherModal = useStore((s) => s.setShowLauncherModal);
  const setShowPanelLayoutModal = useStore((s) => s.setShowPanelLayoutModal);
  const userAccount = useStore((s) => s.userAccount);

  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const accountRef = useRef<HTMLDivElement | null>(null);

  // Close account menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setShowAccountDropdown(false);
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <header className="flex h-10 w-full shrink-0 items-center justify-between border-b border-border/50 bg-[#121214] px-3 select-none text-text">
      {/* LEFT TOPBAR SETUP (Picture 1) */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none flex-1 min-w-0 pr-2">
        {/* 1. Hamburger Menu Icon (≡) -> Opens Workspace Launcher */}
        <button
          onClick={() => setShowLauncherModal(true)}
          title="Open Start Launcher / Workspaces"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
        >
          <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* 2. Grid with Plus Icon (㗊+) -> Opens Panel Layout Manager GUI */}
        <button
          onClick={() => setShowPanelLayoutModal(true)}
          title="Custom Panel Layout Manager GUI"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
        >
          <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="1.8">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <line x1="17.5" y1="14" x2="17.5" y2="21" strokeWidth="2" />
            <line x1="14" y1="17.5" x2="21" y2="17.5" strokeWidth="2" />
          </svg>
        </button>

        {/* 3. Session Tabs List */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {sessions.map((sess) => {
            const isActive = sess.id === activeSessionId || sess.active;

            return (
              <div
                key={sess.id}
                onClick={() => selectSession(sess.id)}
                className={`group flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs transition-colors shrink-0 ${
                  isActive
                    ? "bg-[#33353d] text-white font-medium shadow-xs"
                    : "text-muted hover:bg-card/60 hover:text-text"
                }`}
              >
                {/* Grey square L badge icon */}
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-zinc-600/80 font-mono text-[9px] font-bold text-white">
                  L
                </div>

                <span className="truncate max-w-[150px] text-xs">{sess.title}</span>

                {/* Close ✕ button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeSession(sess.id);
                  }}
                  className="ml-0.5 rounded p-0.5 text-muted/70 hover:bg-zinc-600 hover:text-white cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity text-[9px]"
                >
                  ✕
                </button>
              </div>
            );
          })}

          {/* Vertical Divider */}
          <div className="h-4 w-px bg-border/60 mx-1 shrink-0" />

          {/* "New session" Edit Pencil Button */}
          <button
            onClick={() => createSession()}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-xs font-medium text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
          >
            <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            <span>New session</span>
          </button>

          {/* Plus Add Tab (+) Button */}
          <button
            onClick={() => createSession()}
            title="Create New Session"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
          >
            <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* RIGHT TOPBAR SETUP (Picture 2) */}
      <div className="flex items-center gap-2.5 shrink-0 pl-2">
        {/* 1. Pane Toggle Icons Group */}
        <div className="flex items-center gap-1">
          {/* Icon 1: Grid Layout (Left + 2 Split Right) */}
          <button
            onClick={() => {
              if (!splitActive) splitScreen();
              if (!showSourcesPanel) toggleSourcesPanel();
            }}
            title="Grid Layout View"
            className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
          >
            <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <rect x="3" y="3" width="7" height="18" rx="1" />
              <rect x="13" y="3" width="8" height="8" rx="1" />
              <rect x="13" y="13" width="8" height="8" rx="1" />
            </svg>
          </button>

          {/* Icon 2: Left Panel Toggle */}
          <button
            onClick={toggleAssistantPanel}
            title="Toggle Left Assistant Pane"
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors cursor-pointer ${
              showAssistantPanel ? "bg-[#33353d] text-white" : "text-muted hover:bg-card hover:text-white"
            }`}
          >
            <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>

          {/* Icon 3: Artifacts Panel Toggle */}
          <button
            onClick={toggleArtifactsPanel}
            title="Toggle Artifacts Panel"
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors cursor-pointer ${
              showArtifactsPanel ? "bg-[#33353d] text-white" : "text-muted hover:bg-card hover:text-white"
            }`}
          >
            <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="15" x2="21" y2="15" />
            </svg>
          </button>

          {/* Icon 4: Right Panel Toggle (Highlighted Rounded Gray Box matching picture 2) */}
          <button
            onClick={() => {
              if (splitActive) closeSplit(); else splitScreen();
            }}
            title="Toggle Right Study Board Pane"
            className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors cursor-pointer ${
              splitActive
                ? "border-zinc-500 bg-[#33353d] text-white shadow-xs"
                : "border-transparent text-muted hover:bg-card hover:text-white"
            }`}
          >
            <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </button>
        </div>

        {/* 2. Search Icon (🔍) */}
        <button
          onClick={() => setShowSearchModal(true)}
          title="Search Workspace (Ctrl+K)"
          className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
        >
          <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        {/* Vertical Divider */}
        <div className="h-4 w-px bg-border/60" />

        {/* 3. Browser View Icon (🌐 / Chrome Icon) */}
        <button
          onClick={() => alert("Local Study Notebook Browser Integration Active")}
          title="Open Web View"
          className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
        >
          <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </button>

        {/* 4. Settings Gear Icon (⚙️) */}
        <button
          onClick={() => setShowSettings(true)}
          title="Open Settings (800x600)"
          className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
        >
          <svg className="w-4 h-4 stroke-current animate-hover-spin" viewBox="0 0 24 24" fill="none" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        {/* 5. User Account Avatar (Purple 'D' + Chevron Down ˅) */}
        <div className="relative" ref={accountRef}>
          <button
            onClick={() => setShowAccountDropdown(!showAccountDropdown)}
            className="flex items-center gap-1 rounded-full hover:opacity-90 cursor-pointer transition-opacity"
            title="User Account Options"
          >
            {/* Purple circle avatar matching picture 2 */}
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-600 font-bold text-xs text-white shadow-xs">
              {userAccount?.avatarLetter || "D"}
            </div>
            {/* Chevron down arrow */}
            <svg className="w-3.5 h-3.5 text-muted hover:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* User Account Dropdown Menu */}
          {showAccountDropdown && (
            <div className="absolute right-0 top-8 z-50 flex w-56 flex-col rounded-md border border-border bg-card p-1.5 text-xs text-text shadow-2xl">
              <div className="flex items-center gap-2.5 border-b border-border/60 p-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-600 font-bold text-sm text-white">
                  {userAccount?.avatarLetter || "D"}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-white truncate">{userAccount?.name || "Developer Workspace"}</span>
                  <span className="text-[10px] text-muted truncate">{userAccount?.email || "developer@localnotebook.app"}</span>
                </div>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    setShowSettings(true);
                    setShowAccountDropdown(false);
                  }}
                  className="w-full rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                >
                  Account Preferences
                </button>
                <button
                  onClick={() => {
                    alert("Local study workspace active.");
                    setShowAccountDropdown(false);
                  }}
                  className="w-full rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                >
                  Switch Workspace
                </button>
              </div>

              <div className="h-px bg-border/60 my-0.5" />

              <button
                onClick={() => {
                  alert("Local session active.");
                  setShowAccountDropdown(false);
                }}
                className="w-full rounded px-2.5 py-1.5 text-left text-red-400 hover:bg-red-500 hover:text-white cursor-pointer transition-colors"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Global Quick Search Modal */}
      {showSearchModal && (
        <div
          onClick={() => setShowSearchModal(false)}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-20 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-lg flex-col rounded-lg border border-border bg-card p-3 shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-border/60 pb-2">
              <svg className="w-4 h-4 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                autoFocus
                type="text"
                placeholder="Search notes, sessions, or commands..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-xs text-text outline-none"
              />
              <button
                onClick={() => setShowSearchModal(false)}
                className="text-xs text-muted hover:text-white"
              >
                ESC
              </button>
            </div>
            <div className="p-4 text-center text-xs text-muted">
              {searchQuery ? `Searching for "${searchQuery}"...` : "Type a query to search local notebook notes..."}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
