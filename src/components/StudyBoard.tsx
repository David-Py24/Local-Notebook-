import { useState, useEffect, useRef } from "react";
import { useStore, Tab, ViewMode } from "../stores/useStore";
import ReactMarkdown from "react-markdown";
import MarkdownEditor from "./MarkdownEditor";

export const TAB_DRAG_MIME = "application/x-lsn-tab";

// Cycle order for the view-mode toggle button: live -> source -> preview -> live
const NEXT_VIEW_MODE: Record<ViewMode, ViewMode> = {
  live: "source",
  source: "preview",
  preview: "live",
};

export default function StudyBoard() {
  const splitActive = useStore((s) => s.splitActive);
  const activePanel = useStore((s) => s.activePanel);
  const setActivePanel = useStore((s) => s.setActivePanel);
  const moveTab = useStore((s) => s.moveTab);
  const [splitDropActive, setSplitDropActive] = useState(false);

  return (
    <div className="flex h-full w-full gap-1">
      {/* Left / Main Editor Pane */}
      <div
        onClick={() => setActivePanel("left")}
        className={`relative flex-1 flex flex-col h-full overflow-hidden panel-rounded bg-card transition-colors ${
          activePanel === "left" && splitActive ? "border border-accent/60" : "border-r border-border/40"
        }`}
      >
        <EditorPanel panel="left" />

        {/* Drop zone that auto-creates the split pane when a tab is dragged to the edge
            while unsplit — otherwise there's nothing to drop onto yet. */}
        {!splitActive && (
          <div
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(TAB_DRAG_MIME)) return;
              e.preventDefault();
              setSplitDropActive(true);
            }}
            onDragLeave={() => setSplitDropActive(false)}
            onDrop={(e) => {
              const raw = e.dataTransfer.getData(TAB_DRAG_MIME);
              setSplitDropActive(false);
              if (!raw) return;
              e.preventDefault();
              const { panel: fromPanel, path } = JSON.parse(raw) as { panel: "left" | "right"; path: string };
              if (fromPanel === "left") moveTab("left", "right", path);
            }}
            title="Drop here to open in a split pane"
            className={`absolute right-0 top-0 bottom-0 w-6 z-20 transition-colors ${
              splitDropActive ? "bg-accent/20 border-l-2 border-accent" : ""
            }`}
          />
        )}
      </div>

      {/* Right Split Pane (if active) */}
      {splitActive && (
        <div
          onClick={() => setActivePanel("right")}
          className={`flex-1 flex flex-col h-full overflow-hidden panel-rounded bg-card transition-colors ${
            activePanel === "right" ? "border border-accent/60" : "border-l border-border/40"
          }`}
        >
          <EditorPanel panel="right" />
        </div>
      )}
    </div>
  );
}

interface EditorPanelProps {
  panel: "left" | "right";
}

function EditorPanel({ panel }: EditorPanelProps) {
  const isLeft = panel === "left";
  const tabs = useStore((s) => (isLeft ? s.leftTabs : s.rightTabs));
  const activeTabId = useStore((s) => (isLeft ? s.activeLeftTabId : s.activeRightTabId));
  const draft = useStore((s) => (isLeft ? s.leftDraft : s.rightDraft));
  const viewMode = useStore((s) => (isLeft ? s.leftViewMode : s.rightViewMode));

  const selectTab = useStore((s) => s.selectTab);
  const closeTab = useStore((s) => s.closeTab);
  const moveTab = useStore((s) => s.moveTab);
  const setDraftContent = useStore((s) => s.setDraftContent);
  const setPanelViewMode = useStore((s) => s.setPanelViewMode);
  const splitScreen = useStore((s) => s.splitScreen);
  const closeSplit = useStore((s) => s.closeSplit);
  const splitActive = useStore((s) => s.splitActive);
  const pinnedPaths = useStore((s) => s.pinnedPaths);
  const togglePinPath = useStore((s) => s.togglePinPath);
  const toggleSourcesPanel = useStore((s) => s.toggleSourcesPanel);
  const toggleAssistantPanel = useStore((s) => s.toggleAssistantPanel);
  const openNewNote = useStore((s) => s.openNewNote);
  const fontSize = useStore((s) => s.settings.fontSize);
  const fontFamily = useStore((s) => s.settings.fontFamily);
  const showWordCount = useStore((s) => s.settings.showWordCount);

  const getFontFamilyStyle = (font: string) => {
    switch (font) {
      case "mono":
        return "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      case "serif":
        return 'Georgia, Cambria, "Times New Roman", Times, serif';
      case "system":
      default:
        return font === "system" || !font ? "system-ui, -apple-system, sans-serif" : font;
    }
  };

  const [showOptions, setShowOptions] = useState(false);
  const [showMoreTabs, setShowMoreTabs] = useState(false);

  const optionsRef = useRef<HTMLDivElement | null>(null);
  const moreTabsRef = useRef<HTMLDivElement | null>(null);
  const tabContainerRef = useRef<HTMLDivElement | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Maximum 3 visible tabs calculation (Requirement: Only shows max 3 open tabs)
  const MAX_VISIBLE_TABS = 3;
  const visibleTabs = tabs.slice(0, MAX_VISIBLE_TABS);
  const hiddenTabs = tabs.slice(MAX_VISIBLE_TABS);

  // If active tab is in hidden tabs, make sure active tab is visible
  let displayTabs = visibleTabs;
  if (activeTabId && !visibleTabs.some((t) => t.id === activeTabId)) {
    const activeObj = tabs.find((t) => t.id === activeTabId);
    if (activeObj) {
      displayTabs = [visibleTabs[0], visibleTabs[1], activeObj];
    }
  }

  // Horizontal mouse scroll function for navigating tabs (Requirement)
  const handleTabWheelScroll = (e: React.WheelEvent) => {
    if (tabContainerRef.current) {
      tabContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  // Close options dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setShowOptions(false);
      }
      if (moreTabsRef.current && !moreTabsRef.current.contains(e.target as Node)) {
        setShowMoreTabs(false);
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const isPinned = activeTabId ? pinnedPaths.includes(activeTabId) : false;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      {/* Top Tab Bar */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/30 bg-bg/30 px-2 select-none">
        {/* Left Side: Layout toggle + Max 3 Tabs list + Overflow Dropdown + Scroll container */}
        <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
          {/* Sidebar Toggle Icon [||] */}
          <button
            onClick={() => toggleSourcesPanel()}
            title="Toggle Explorer Panel"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
          >
            <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>

          {/* Tab container with horizontal wheel scroll; also a drop target for tabs
              dragged over from the other split pane. */}
          <div
            ref={tabContainerRef}
            onWheel={handleTabWheelScroll}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(TAB_DRAG_MIME)) e.preventDefault();
            }}
            onDrop={(e) => {
              const raw = e.dataTransfer.getData(TAB_DRAG_MIME);
              if (!raw) return;
              e.preventDefault();
              const { panel: fromPanel, path } = JSON.parse(raw) as { panel: "left" | "right"; path: string };
              if (fromPanel !== panel) moveTab(fromPanel, panel, path);
            }}
            className="flex items-center gap-1 overflow-x-auto scrollbar-none flex-1"
          >
            {displayTabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              const isMd = tab.title.endsWith(".md") || tab.id.endsWith(".md");

              return (
                <div
                  key={tab.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(TAB_DRAG_MIME, JSON.stringify({ panel, path: tab.id }));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => selectTab(panel, tab.id)}
                  className={`group flex h-6.5 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors shrink-0 ${
                    isActive
                      ? "bg-[#252836] text-white font-medium shadow-xs"
                      : "text-muted hover:bg-card/60 hover:text-text"
                  }`}
                >
                  {isMd ? (
                    <span className="text-[9px] text-cyan-400 font-mono font-bold">M+</span>
                  ) : (
                    <svg className="w-3 h-3 stroke-current shrink-0 text-muted" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    </svg>
                  )}

                  <span className="truncate max-w-[130px] text-xs">{tab.title}</span>

                  {pinnedPaths.includes(tab.id) && <span className="text-[8px] text-amber-500">📌</span>}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(panel, tab.id);
                    }}
                    className="ml-0.5 rounded p-0.5 text-muted hover:bg-border/80 hover:text-white cursor-pointer opacity-60 group-hover:opacity-100 transition-opacity text-[9px]"
                  >
                    ✕
                  </button>
                </div>
              );
            })}

            {/* Hidden tabs overflow badge indicator (+N more) */}
            {tabs.length > MAX_VISIBLE_TABS && (
              <div className="relative shrink-0" ref={moreTabsRef}>
                <button
                  onClick={() => setShowMoreTabs(!showMoreTabs)}
                  className="flex h-6 items-center gap-1 rounded bg-bg/80 border border-border/60 px-2 text-[11px] font-semibold text-accent hover:border-accent cursor-pointer transition-colors"
                >
                  <span>+{tabs.length - MAX_VISIBLE_TABS} more</span>
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {showMoreTabs && (
                  <div className="absolute left-0 top-7 z-30 flex w-48 flex-col rounded-md border border-border bg-card p-1 text-xs text-text shadow-xl">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted">More Open Tabs</div>
                    {hiddenTabs.map((ht) => (
                      <button
                        key={ht.id}
                        onClick={() => {
                          selectTab(panel, ht.id);
                          setShowMoreTabs(false);
                        }}
                        className="flex items-center justify-between rounded px-2 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                      >
                        <span className="truncate max-w-[130px]">{ht.title}</span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            closeTab(panel, ht.id);
                          }}
                          className="text-muted hover:text-red-400 text-[10px]"
                        >
                          ✕
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Add New Note (+) Button */}
          {isLeft && (
            <button
              onClick={() => openNewNote()}
              title="New Note (Ctrl+N)"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
            >
              <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          )}
        </div>

        {/* Right Controls of Tab Bar */}
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {/* View mode cycle: live (Obsidian-style rendered markdown) -> source (raw) -> preview (full reading view) -> live */}
          <button
            onClick={() => setPanelViewMode(panel, NEXT_VIEW_MODE[viewMode])}
            title={`Switch to ${NEXT_VIEW_MODE[viewMode]}`}
            className="rounded p-1 text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
          >
            {viewMode === "preview" ? (
              <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : viewMode === "source" ? (
              <span className="block w-3.5 text-center text-[10px] font-mono font-bold leading-none">{"</>"}</span>
            ) : (
              <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            )}
          </button>

          {/* Options Menu */}
          <div className="relative" ref={optionsRef}>
            <button
              onClick={() => setShowOptions(!showOptions)}
              className="rounded p-1 text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
              title="Pane options"
            >
              <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </button>

            {showOptions && (
              <div className="absolute right-0 top-7 z-30 flex w-44 flex-col rounded-md border border-border bg-card p-1 text-xs text-text shadow-xl">
                {activeTabId && (
                  <button
                    onClick={() => {
                      togglePinPath(activeTabId);
                      setShowOptions(false);
                    }}
                    className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                  >
                    {isPinned ? "Unpin Note" : "Pin Note"}
                  </button>
                )}
                {isLeft ? (
                  <button
                    onClick={() => {
                      splitScreen();
                      setShowOptions(false);
                    }}
                    className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                  >
                    Split Screen Side-by-Side
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      closeSplit();
                      setShowOptions(false);
                    }}
                    className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors text-red-400"
                  >
                    Close Split Pane
                  </button>
                )}
                <div className="h-px bg-border/60 my-0.5" />
                <button
                  onClick={() => {
                    toggleAssistantPanel();
                    setShowOptions(false);
                  }}
                  className="rounded px-2.5 py-1.5 text-left text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
                >
                  Toggle Assistant Panel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Document Workspace (Fine-grained word/sentence syntax reveal) */}
      <div className="flex-1 overflow-y-auto w-full bg-card scrollbar-thin">
        {tabs.length === 0 || !activeTabId || !activeTab ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center select-none text-muted">
            <div className="h-10 w-10 rounded-full border border-border bg-bg/40 flex items-center justify-center mb-3">
              <span className="text-cyan-400 font-mono font-bold text-sm">M+</span>
            </div>
            <h3 className="text-xs font-semibold text-text mb-1">No document active</h3>
            <p className="text-[11px] text-muted mb-4 max-w-[240px]">
              Select a note from the file explorer or create a new study document to begin.
            </p>
            {isLeft && (
              <button
                onClick={() => openNewNote()}
                className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover transition-colors cursor-pointer"
              >
                Create New Note
              </button>
            )}
          </div>
        ) : (
          <div
            className="max-w-4xl mx-auto w-full min-h-full px-8 py-8 flex flex-col space-y-1"
            style={{ fontSize: `${fontSize}px`, fontFamily: getFontFamilyStyle(fontFamily) }}
          >
            {viewMode === "preview" ? (
              /* Full Document Preview */
              <div className="markdown-preview leading-relaxed tracking-normal">
                <ReactMarkdown>{draft || "*Empty document...*"}</ReactMarkdown>
              </div>
            ) : (
              /* CodeMirror 6 editor — "live" renders Obsidian-style inline formatting
                 with syntax hidden except on the active line; "source" shows raw markdown. */
              <MarkdownEditor
                key={activeTabId}
                value={draft}
                onChange={(content) => setDraftContent(panel, content)}
                livePreview={viewMode === "live"}
              />
            )}
          </div>
        )}
      </div>

      {/* Editor Status Bar (Word count, char count, mode indicator) */}
      {activeTabId && (
        <div className="flex h-6 shrink-0 items-center justify-between border-t border-border/20 bg-bg/20 px-3 text-[11px] text-muted select-none">
          <div className="flex items-center gap-3">
            {showWordCount && (
              <>
                <span>
                  {draft.trim() ? draft.trim().split(/\s+/).length : 0} words
                </span>
                <span>{draft.length} chars</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 font-mono">
            <span className="capitalize">{viewMode} mode</span>
          </div>
        </div>
      )}
    </div>
  );
}
