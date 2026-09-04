import { useState, useEffect, useRef, useMemo } from "react";
import { useStore, Tab, ViewMode } from "../stores/useStore";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MarkdownEditor from "./MarkdownEditor";
import BacklinksPanel from "./BacklinksPanel";
import EditorContextMenu from "./EditorContextMenu";
import EdgeResizer from "./EdgeResizer";

export const TAB_DRAG_MIME = "application/x-lsn-tab";

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
  const splitLeftWidth = useStore((s) => s.splitLeftWidth);
  const setSplitLeftWidth = useStore((s) => s.setSplitLeftWidth);
  const [splitDropActive, setSplitDropActive] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const leftWidth = splitLeftWidth > 0 ? splitLeftWidth : (containerRef.current?.clientWidth ?? 800) / 2;

  const handleSplitResize = (delta: number) => {
    const containerWidth = containerRef.current?.clientWidth ?? 800;
    if (containerWidth <= 0) return;
    const next = Math.min(Math.max(leftWidth + delta, 200), containerWidth - 200);
    setSplitLeftWidth(next);
  };

  const leftStyle = splitActive ? { flex: `0 0 ${leftWidth}px` } : { flex: "1 1 0%" };
  const rightStyle = splitActive ? { flex: `1 1 0%` } : {};

  return (
    <div ref={containerRef} className="flex h-full w-full gap-1">
      <div
        onClick={() => setActivePanel("left")}
        style={leftStyle}
        className={`relative flex flex-col h-full overflow-hidden panel-rounded bg-card transition-colors ${
          activePanel === "left" && splitActive ? "border border-accent/60" : "border-r border-border/40"
        }`}
      >
        <EditorPanel panel="left" />
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

      {splitActive && (
        <>
          <EdgeResizer onResize={handleSplitResize} />
          <div
            onClick={() => setActivePanel("right")}
            style={rightStyle}
            className={`flex flex-col h-full overflow-hidden panel-rounded bg-card transition-colors ${
              activePanel === "right" ? "border border-accent/60" : "border-l border-border/40"
            }`}
          >
            <EditorPanel panel="right" />
          </div>
        </>
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
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const fontSize = settings.fontSize;
  const fontFamily = settings.fontFamily;
  const showWordCount = settings.showWordCount;
  const lineWrap = settings.lineWrap;

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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showTOC, setShowTOC] = useState(false);
  const [showFindBar, setShowFindBar] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(0);
  const [findCount, setFindCount] = useState(0);

  const optionsRef = useRef<HTMLDivElement | null>(null);
  const moreTabsRef = useRef<HTMLDivElement | null>(null);
  const tabContainerRef = useRef<HTMLDivElement | null>(null);
  const tocRef = useRef<HTMLDivElement | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const editorContentRef = useRef<HTMLDivElement | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const MAX_VISIBLE_TABS = 3;
  const visibleTabs = tabs.slice(0, MAX_VISIBLE_TABS);
  const hiddenTabs = tabs.slice(MAX_VISIBLE_TABS);

  let displayTabs = visibleTabs;
  if (activeTabId && !visibleTabs.some((t) => t.id === activeTabId)) {
    const activeObj = tabs.find((t) => t.id === activeTabId);
    if (activeObj) {
      displayTabs = [visibleTabs[0], visibleTabs[1], activeObj];
    }
  }

  const handleTabWheelScroll = (e: React.WheelEvent) => {
    if (tabContainerRef.current) {
      tabContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setShowOptions(false);
      }
      if (moreTabsRef.current && !moreTabsRef.current.contains(e.target as Node)) {
        setShowMoreTabs(false);
      }
      if (tocRef.current && !tocRef.current.contains(e.target as Node)) {
        setShowTOC(false);
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (showFindBar && findInputRef.current) {
      findInputRef.current.focus();
      findInputRef.current.select();
    }
  }, [showFindBar]);

  useEffect(() => {
    if (!findQuery || !draft) { setFindCount(0); setFindIndex(0); return; }
    const regex = new RegExp(findQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matches = draft.match(regex);
    setFindCount(matches ? matches.length : 0);
    setFindIndex(0);
  }, [findQuery, draft]);

  const tocHeadings = useMemo(() => {
    if (!draft) return [];
    const lines = draft.split(/\r?\n/);
    const headings: { level: number; text: string; line: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(#{1,6})\s+(.+)/);
      if (m) {
        headings.push({ level: m[1].length, text: m[2].replace(/[*_`~\[\]]/g, ""), line: i });
      }
    }
    return headings;
  }, [draft]);

  const isPinned = activeTabId ? pinnedPaths.includes(activeTabId) : false;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCopyAsFile = async () => {
    if (!activeTabId || !draft) { setShowOptions(false); return; }
    const blob = new Blob([draft], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (activeTabId.split(/[\\/]/).pop()) || "note.md";
    a.click();
    URL.revokeObjectURL(url);
    setShowOptions(false);
  };

  const handlePrint = () => {
    window.print();
    setShowOptions(false);
  };

  const handleFontSize = (delta: number) => {
    const next = Math.min(Math.max(fontSize + delta, 10), 28);
    updateSettings({ fontSize: next });
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      {/* Top Tab Bar */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/30 bg-bg/30 px-2 select-none">
        <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
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

        {/* Right Controls */}
        <div className="flex items-center gap-1 shrink-0 ml-2">
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

          {/* Enhanced Options Menu */}
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
              <div className="absolute right-0 top-7 z-30 flex w-52 flex-col rounded-md border border-border bg-card p-1 text-xs text-text shadow-xl max-h-[80vh] overflow-y-auto scrollbar-thin">
                {/* View Section */}
                <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted">View</div>
                <div className="flex items-center justify-between rounded px-2.5 py-1.5 hover:bg-accent hover:text-white cursor-pointer transition-colors">
                  <span>Font Size</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleFontSize(-1)} className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-bg/60 hover:bg-accent cursor-pointer">A-</button>
                    <span className="text-[10px] font-mono w-5 text-center">{fontSize}</span>
                    <button onClick={() => handleFontSize(1)} className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-bg/60 hover:bg-accent cursor-pointer">A+</button>
                  </div>
                </div>
                <button
                  onClick={() => { updateSettings({ lineWrap: !lineWrap }); setShowOptions(false); }}
                  className="flex items-center justify-between rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                >
                  <span>Line Wrap</span>
                  <span className={`text-[10px] font-mono ${lineWrap ? "text-accent" : "text-muted"}`}>{lineWrap ? "ON" : "OFF"}</span>
                </button>
                <button
                  onClick={() => { updateSettings({ showWordCount: !showWordCount }); setShowOptions(false); }}
                  className="flex items-center justify-between rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                >
                  <span>Word Count</span>
                  <span className={`text-[10px] font-mono ${showWordCount ? "text-accent" : "text-muted"}`}>{showWordCount ? "ON" : "OFF"}</span>
                </button>

                <div className="h-px bg-border/60 my-0.5" />

                {/* Export Section */}
                <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted">Export</div>
                <button onClick={handleCopyAsFile} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
                  Export as File
                </button>
                <button onClick={handlePrint} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
                  Print Note
                </button>

                <div className="h-px bg-border/60 my-0.5" />

                {/* Navigate Section */}
                <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted">Navigate</div>
                <button
                  onClick={() => { setShowFindBar(true); setShowOptions(false); }}
                  className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                >
                  Search in Note
                </button>
                <button
                  onClick={() => { setShowTOC(!showTOC); setShowOptions(false); }}
                  className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                >
                  Table of Contents
                </button>

                <div className="h-px bg-border/60 my-0.5" />

                {/* Pane Section */}
                <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted">Pane</div>
                {activeTabId && (
                  <button
                    onClick={() => { togglePinPath(activeTabId); setShowOptions(false); }}
                    className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                  >
                    {isPinned ? "Unpin Note" : "Pin Note"}
                  </button>
                )}
                {isLeft ? (
                  <button
                    onClick={() => { splitScreen(); setShowOptions(false); }}
                    className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                  >
                    Split Screen Side-by-Side
                  </button>
                ) : (
                  <button
                    onClick={() => { closeSplit(); setShowOptions(false); }}
                    className="rounded px-2.5 py-1.5 text-left text-red-400 hover:bg-red-500 hover:text-white cursor-pointer transition-colors"
                  >
                    Close Split Pane
                  </button>
                )}
                <button
                  onClick={() => { toggleAssistantPanel(); setShowOptions(false); }}
                  className="rounded px-2.5 py-1.5 text-left text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
                >
                  Toggle Assistant Panel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Find in Note Bar */}
      {showFindBar && (
        <div className="flex items-center gap-2 border-b border-border/30 bg-bg/40 px-3 py-1.5 shrink-0">
          <svg className="w-3.5 h-3.5 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={findInputRef}
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setShowFindBar(false); setFindQuery(""); }
            }}
            placeholder="Find in note..."
            className="flex-1 bg-transparent text-xs text-text outline-none placeholder:text-muted"
          />
          {findQuery && (
            <span className="text-[10px] text-muted font-mono shrink-0">
              {findCount > 0 ? `${findIndex + 1}/${findCount}` : "No results"}
            </span>
          )}
          <button
            onClick={() => { setShowFindBar(false); setFindQuery(""); }}
            className="text-muted hover:text-white text-[10px] cursor-pointer"
          >
            ESC
          </button>
        </div>
      )}

      {/* Main Document Workspace */}
      <div
        ref={editorContentRef}
        onContextMenu={handleContextMenu}
        className="flex-1 overflow-y-auto w-full bg-card scrollbar-thin"
      >
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
              <div className="markdown-preview leading-relaxed tracking-normal">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft || "*Empty document...*"}</ReactMarkdown>
              </div>
            ) : (
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

      {/* Table of Contents Overlay */}
      {showTOC && tocHeadings.length > 0 && (
        <div
          ref={tocRef}
          className="absolute right-2 top-12 z-40 w-56 max-h-64 overflow-y-auto rounded-md border border-border bg-card p-2 shadow-xl scrollbar-thin"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase text-muted">Table of Contents</span>
            <button onClick={() => setShowTOC(false)} className="text-muted hover:text-white text-[10px] cursor-pointer">✕</button>
          </div>
          <div className="space-y-0.5">
            {tocHeadings.map((h, i) => (
              <div
                key={i}
                onClick={() => setShowTOC(false)}
                className="rounded px-2 py-1 text-[11px] hover:bg-accent hover:text-white cursor-pointer transition-colors truncate"
                style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
              >
                <span className="text-muted font-mono text-[9px] mr-1">H{h.level}</span>
                {h.text}
              </div>
            ))}
          </div>
        </div>
      )}

      <BacklinksPanel activeTabId={activeTabId} panel={panel} />

      {/* Editor Status Bar */}
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

      {/* Context Menu */}
      {contextMenu && (
        <EditorContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          activeTabId={activeTabId}
          panel={panel}
          draft={draft}
        />
      )}
    </div>
  );
}
