import { useRef, useState } from "react";
import { useStore } from "../stores/useStore";
import type { Project } from "../types";
import type { AgentSession } from "../stores/useStore";
import EdgeResizer from "./EdgeResizer";

type SectionKey = "projects" | "recents" | "allChats";

export default function Navbar() {
  const showSidebar = useStore((s) => s.showSourcesPanel);
  const toggleSidebar = useStore((s) => s.toggleSourcesPanel);
  const showAssistant = useStore((s) => s.showAssistantPanel);
  const toggleAssistant = useStore((s) => s.toggleAssistantPanel);
  const showAgent = useStore((s) => s.showAgentPanel);
  const toggleAgent = useStore((s) => s.toggleAgentPanel);
  const showWorkTree = useStore((s) => s.showWorkTreePanel);
  const toggleWorkTree = useStore((s) => s.toggleWorkTreePanel);
  const openNewNote = useStore((s) => s.openNewNote);
  const setShowSettings = useStore((s) => s.setShowSettings);

  const leftNavWidth = useStore((s) => s.leftNavWidth);
  const setLeftNavWidth = useStore((s) => s.setLeftNavWidth);
  const leftNavSections = useStore((s) => s.leftNavSections);
  const toggleLeftNavSection = useStore((s) => s.toggleLeftNavSection);
  const loadLeftNavPrefs = useStore((s) => s.loadLeftNavPrefs);
  const projects = useStore((s) => s.projects);
  const openProject = useStore((s) => s.openProject);
  const agentSessions = useStore((s) => s.agentSessions);
  const setActiveAgentSession = useStore((s) => s.setActiveAgentSession);
  const activeAgentSessionId = useStore((s) => s.activeAgentSessionId);
  const agentRun = useStore((s) => s.agentRun);
  const goalRunning = useStore((s) => s.goalRunning);
  const goalPaused = useStore((s) => s.goalPaused);
  const currentFolderPath = useStore((s) => s.currentFolderPath);
  const gitStatus = useStore((s) => s.gitStatus);
  const archiveAgentSession = useStore((s) => s.archiveAgentSession);
  const deleteAgentSession = useStore((s) => s.deleteAgentSession);
  const forkAgentSession = useStore((s) => s.forkAgentSession);

  const [allChatsQuery, setAllChatsQuery] = useState("");
  const [hoverItem, setHoverItem] = useState<NavHover | null>(null);
  const closeHoverTimer = useRef<number | null>(null);

  const scheduleHoverClose = (delay = 300) => {
    if (closeHoverTimer.current) window.clearTimeout(closeHoverTimer.current);
    closeHoverTimer.current = window.setTimeout(() => setHoverItem(null), delay);
  };
  const showHover = (item: NavHover) => {
    if (closeHoverTimer.current) window.clearTimeout(closeHoverTimer.current);
    setHoverItem(item);
  };

  const sorted = [...agentSessions].sort(
    (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
  );
  const recents = sorted.slice(0, 5);
  const allChats = allChatsQuery
    ? sorted.filter((c) => (c.title ?? "").toLowerCase().includes(allChatsQuery.toLowerCase()))
    : sorted;

  const runSessionId = agentRun?.sessionId ?? null;
  const runProjectPath = runSessionId
    ? agentSessions.find((s) => s.id === runSessionId)?.projectPath ?? null
    : null;

  const sessionTone = (s: { id: string }): Tone => {
    if (goalRunning && runSessionId === s.id) return goalPaused ? "pending" : "agent";
    if (s.id === activeAgentSessionId) return "user";
    return "idle";
  };

  const openChat = (id: string) => {
    setActiveAgentSession(id);
    if (!showAssistant && !showAgent) toggleAssistant();
  };

  const handleResize = (delta: number) => {
    setLeftNavWidth(Math.min(Math.max(leftNavWidth + delta, 140), 520));
  };

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-r border-border bg-card select-none"
      style={{ width: leftNavWidth }}
    >
      <EdgeResizer onResize={handleResize} />

      {/* Toolbar pinned to the top of the left panel */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-1.5 py-1">
        <ToolbarButton onClick={toggleAssistant} title="Toggle Study Assistant" toggle active={showAssistant}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 stroke-current">
            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </ToolbarButton>
        <ToolbarButton onClick={toggleSidebar} title="Toggle File Explorer" toggle active={showSidebar}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 stroke-current">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </ToolbarButton>
        <ToolbarButton onClick={toggleAgent} title="Toggle Agent Panel" toggle active={showAgent}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 stroke-current">
            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </ToolbarButton>
        <ToolbarButton onClick={toggleWorkTree} title="Toggle Work-Tree Panel" toggle active={showWorkTree}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 stroke-current">
            <path d="M6 3v12" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 0 1-9 9" />
          </svg>
        </ToolbarButton>

        <div className="ml-auto flex items-center gap-1">
          <ToolbarButton onClick={openNewNote} title="Create New Note (Ctrl+N)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 stroke-current">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
            </svg>
          </ToolbarButton>
          <ToolbarButton onClick={() => setShowSettings(true)} title="Settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 stroke-current">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </ToolbarButton>
        </div>
      </div>

      {/* Collapsible sections */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <LeftNavSection title="Projects" expanded={leftNavSections.projects} onToggle={() => toggleLeftNavSection("projects")}>
          {projects.map((p) => {
            const isOpen = currentFolderPath?.toLowerCase() === p.path.toLowerCase();
            const projPending =
              gitStatus?.isRepo === true &&
              !!gitStatus.root &&
              gitStatus.root.toLowerCase() === p.path.toLowerCase() &&
              gitStatus.entries.length > 0;
            const tone = isOpen
              ? "user"
              : runProjectPath?.toLowerCase() === p.path.toLowerCase() && goalRunning
                ? goalPaused
                  ? "pending"
                  : "agent"
                : projPending
                  ? "pending"
                  : "idle";
            return (
              <button key={p.id} onClick={() => openProject(p.id)} title={isOpen ? `${p.name} (open) · ${TONE_LABEL[tone]}` : `${p.name} · ${TONE_LABEL[tone]}`}
                style={isOpen ? SELECTED_ROW_GRADIENT : undefined}
                onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); showHover({ kind: "project", project: p, tone, isCurrent: isOpen, x: r.right, y: r.top }); }}
                onMouseLeave={() => scheduleHoverClose()}
                className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors cursor-pointer ${isOpen ? "text-red-400 font-medium" : "text-muted hover:text-white"} hover:bg-bg`}>
                <StatusBullet tone={tone} />
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 stroke-current">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span className="truncate">{p.name}</span>
                <span className="ml-auto shrink-0 text-[10px] text-muted/70">{p.lastOpened ? timeAgo(new Date(p.lastOpened).getTime()) : ""}</span>
              </button>
            );
          })}
          {projects.length === 0 && <p className="px-2 py-1 text-[11px] text-muted">No projects yet.</p>}
        </LeftNavSection>

        <LeftNavSection title="Recents" expanded={leftNavSections.recents} onToggle={() => toggleLeftNavSection("recents")}>
          {recents.map((c) => (
            <button key={c.id} onClick={() => openChat(c.id)} title={`${c.title ?? "Untitled"} · ${TONE_LABEL[sessionTone(c)]}`}
              style={c.id === activeAgentSessionId ? SELECTED_ROW_GRADIENT : undefined}
              onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); showHover({ kind: "chat", session: c, tone: sessionTone(c), isCurrent: c.id === activeAgentSessionId, x: r.right, y: r.top }); }}
              onMouseLeave={() => scheduleHoverClose()}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors cursor-pointer ${c.id === activeAgentSessionId ? "text-red-400 font-medium" : "text-muted hover:text-white"} hover:bg-bg`}>
              <StatusBullet tone={sessionTone(c)} />
              <span className="truncate">{c.title ?? "Untitled"}</span>
              <span className="ml-auto shrink-0 text-[10px] text-muted/70">{timeAgo(c.updatedAt)}</span>
            </button>
          ))}
          {recents.length === 0 && <p className="px-2 py-1 text-[11px] text-muted">No recent chats.</p>}
        </LeftNavSection>

        <LeftNavSection title="All Chats" expanded={leftNavSections.allChats} onToggle={() => toggleLeftNavSection("allChats")}>
          <input
            type="text"
            value={allChatsQuery}
            onChange={(e) => setAllChatsQuery(e.target.value)}
            placeholder="Search all chats..."
            className="mx-2 mb-1 w-[calc(100%-16px)] rounded-md border border-border bg-bg px-2 py-1 text-[11px] text-white placeholder:text-muted outline-none"
          />
          {allChats.map((c) => (
            <button key={c.id} onClick={() => openChat(c.id)} title={`${c.title ?? "Untitled"} · ${TONE_LABEL[sessionTone(c)]}`}
              style={c.id === activeAgentSessionId ? SELECTED_ROW_GRADIENT : undefined}
              onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); showHover({ kind: "chat", session: c, tone: sessionTone(c), isCurrent: c.id === activeAgentSessionId, x: r.right, y: r.top }); }}
              onMouseLeave={() => scheduleHoverClose()}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors cursor-pointer ${c.id === activeAgentSessionId ? "text-red-400 font-medium" : "text-muted hover:text-white"} hover:bg-bg`}>
              <StatusBullet tone={sessionTone(c)} />
              <span className="truncate">{c.title ?? "Untitled"}</span>
              <span className="ml-auto shrink-0 text-[10px] text-muted/70">{timeAgo(c.updatedAt)}</span>
            </button>
          ))}
        </LeftNavSection>
      </div>

      {hoverItem && (
        <HoverDetailCard
          item={hoverItem}
          onMouseEnter={() => showHover(hoverItem)}
          onMouseLeave={() => scheduleHoverClose(150)}
          onClose={() => setHoverItem(null)}
          onOpenChat={(id) => { openChat(id); setHoverItem(null); }}
          onOpenProject={(id) => { openProject(id); setHoverItem(null); }}
          onArchive={(id) => { void archiveAgentSession(id); setHoverItem(null); }}
          onDelete={(id) => { void deleteAgentSession(id); setHoverItem(null); }}
          onFork={(id) => { void forkAgentSession(id); setHoverItem(null); }}
        />
      )}
    </aside>
  );
}

function ToolbarButton({
  children,
  onClick,
  title,
  active = false,
  toggle = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  toggle?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors cursor-pointer ${
        toggle
          ? active
            ? "text-accent"
            : "text-accent/50 hover:text-accent hover:bg-bg"
          : "text-muted hover:bg-bg hover:text-white"
      }`}>
      {children}
    </button>
  );
}

type Tone = "user" | "agent" | "pending" | "idle";

const TONE_LABEL: Record<Tone, string> = {
  user: "you are working here",
  agent: "agent working",
  pending: "pending progress",
  idle: "no activity",
};

/** Red gradient (~15% opacity) for the currently-opened chat/session/project. */
const SELECTED_ROW_GRADIENT: React.CSSProperties = {
  background: "linear-gradient(90deg, rgba(239,68,68,0.15), rgba(239,68,68,0.08))",
};

/** Status bullet: emerald=user active, amber=agent working, red beeping=pending, gray=idle. */
function StatusBullet({ tone }: { tone: Tone }) {
  const cls =
    tone === "user"
      ? "bg-emerald-400"
      : tone === "agent"
        ? "bg-amber-400 animate-pulse"
        : tone === "pending"
          ? "bg-red-500 animate-pulse"
          : "bg-zinc-500";
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cls}`} />;
}

type NavHover =
  | { kind: "chat"; session: AgentSession; tone: Tone; isCurrent: boolean; x: number; y: number }
  | { kind: "project"; project: Project; tone: Tone; isCurrent: boolean; x: number; y: number };

function timeAgo(ts?: number | null): string {
  if (!ts || Number.isNaN(ts)) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(ts).toLocaleDateString();
}

interface HoverDetailCardProps {
  item: NavHover;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClose: () => void;
  onOpenChat: (id: string) => void;
  onOpenProject: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onFork: (id: string) => void;
}

function HoverDetailCard({
  item,
  onMouseEnter,
  onMouseLeave,
  onClose,
  onOpenChat,
  onOpenProject,
  onArchive,
  onDelete,
  onFork,
}: HoverDetailCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const maxTop = Math.max(8, item.y);
  const maxLeft = Math.max(8, item.x + 8);

  const title = item.kind === "chat" ? (item.session.title ?? "Untitled") : item.project.name;
  const tone = item.tone;

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ left: maxLeft, top: maxTop, maxWidth: 280 }}
      className="fixed z-50 rounded-lg border border-border/70 bg-card/95 p-2.5 text-xs text-text shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <StatusBullet tone={tone} />
          <span className={`truncate font-medium ${item.isCurrent ? "text-red-400" : "text-text"}`}>{title}</span>
        </div>
        <button onClick={onClose} className="shrink-0 rounded p-0.5 text-muted hover:text-white cursor-pointer transition-colors" title="Close">✕</button>
      </div>

      <div className="mt-2 space-y-1 border-t border-border/50 pt-2 text-[11px] text-muted">
        {item.kind === "chat" ? (
          <>
            <div className="flex justify-between gap-3"><span>Status</span><span>{TONE_LABEL[tone]}</span></div>
            <div className="flex justify-between gap-3"><span>Engine</span><span>{item.session.engine ?? "—"}</span></div>
            <div className="flex justify-between gap-3"><span>Model</span><span>{item.session.model ?? "—"}</span></div>
            <div className="flex justify-between gap-3"><span>Tokens</span><span>{item.session.tokens.toLocaleString()}</span></div>
            <div className="flex justify-between gap-3"><span>Cost</span><span>${item.session.cost.toFixed(4)}</span></div>
            <div className="flex justify-between gap-3"><span>Created</span><span>{new Date(item.session.createdAt).toLocaleString()}</span></div>
            <div className="flex justify-between gap-3"><span>Last response</span><span>{new Date(item.session.updatedAt).toLocaleString()}</span></div>
          </>
        ) : (
          <>
            <div className="flex justify-between gap-3"><span>Status</span><span>{TONE_LABEL[tone]}</span></div>
            <div className="truncate"><span className="text-muted/70">Path: </span><span className="text-white/70 select-text">{item.project.path}</span></div>
            <div className="flex justify-between gap-3"><span>Last opened</span><span>{new Date(item.project.lastOpened).toLocaleString()}</span></div>
          </>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1 border-t border-border/50 pt-2">
        <button
          onClick={() => (item.kind === "chat" ? onOpenChat(item.session.id) : onOpenProject(item.project.id))}
          className="rounded bg-accent px-2.5 py-1 text-[10px] font-medium text-white hover:bg-accent-hover cursor-pointer transition-colors"
        >
          Open
        </button>
        {item.kind === "chat" && (
          <button
            onClick={() => onFork(item.session.id)}
            className="rounded border border-border/70 px-2.5 py-1 text-[10px] font-medium text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
          >
            Fork
          </button>
        )}
        {item.kind === "chat" && (
          <button
            onClick={() => onArchive(item.session.id)}
            className="rounded border border-border/70 px-2.5 py-1 text-[10px] font-medium text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
          >
            Archive
          </button>
        )}
        {item.kind === "chat" &&
          (confirmDelete ? (
            <button
              onClick={() => onDelete(item.session.id)}
              className="rounded bg-red-500/80 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-red-600 cursor-pointer transition-colors"
            >
              Confirm delete
            </button>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded border border-red-500/30 px-2.5 py-1 text-[10px] font-medium text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors"
            >
              Delete
            </button>
          ))}
      </div>
    </div>
  );
}

function LeftNavSection({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border/60 last:border-none">
      <button onClick={onToggle} title={`Toggle ${title}`}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted hover:bg-bg hover:text-white transition-colors cursor-pointer">
        <svg className={`w-2.5 h-2.5 shrink-0 stroke-current transition-transform ${expanded ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
        {title}
      </button>
      {expanded && <div className="pb-1">{children}</div>}
    </section>
  );
}
