import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { getThemeById, applyThemeToDocument } from "../themes";
import type { Project, McpConnector, GitRepoStatus, GitStatusEntry } from "../types";
import { streamAIResponse, fetchAvailableModels } from "../services/aiProvider";
import { applyProjectTemplate } from "../utils/projectTemplates";
import type { AgentRun, RunStatus } from "../services/agentOrchestrator";

// Debounce window for the lazy Memory-RAG embedding pass that runs after vault reindex.
let pendingEmbedRebuildTimer: ReturnType<typeof setTimeout> | null = null;


// Built-in research connector presets (offline-first: shipped disabled). Users opt in
// per-connector in Settings -> Connectors & Research. Remote presets that need a key
// leave `headers` empty until the user supplies credentials.
export const CONNECTOR_PRESETS: McpConnector[] = [
  {
    id: "preset-wikipedia",
    name: "Wikipedia",
    kind: "http",
    url: "https://mcp-wikipedia.vdo.pub/sse",
    enabled: false,
    headers: {},
  },
  {
    id: "preset-arxiv",
    name: "Arxiv Research",
    kind: "http",
    url: "https://mcp-papers-api.arxiv.org/sse",
    enabled: false,
    headers: {},
  },
  {
    id: "preset-filesystem",
    name: "Filesystem",
    kind: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
    enabled: false,
    env: {},
  },
  {
    id: "preset-fetch",
    name: "Fetch (raw URLs)",
    kind: "stdio",
    command: "npx",
    args: ["-y", "mcp-server-fetch"],
    enabled: false,
    env: {},
  },
];


export type ViewMode = "source" | "live" | "preview";
export type SaveStatus = "saved" | "saving" | "unsaved";
export type SidePanelId = "assistant" | "sources" | "artifacts" | "agent" | "worktree";

export interface Artifact {
  id: string;
  title: string;
  type: "code" | "markdown" | "html";
  content: string;
  createdAt: number;
}

export interface AgentMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  timestamp: number;
}

export type AgentTask = "summarize" | "improve" | "assess" | "custom";

export interface CustomLayout {
  id: string;
  name: string;
  panelOrder: SidePanelId[];
  showAssistantPanel: boolean;
  showSourcesPanel: boolean;
  showArtifactsPanel: boolean;
  showAgentPanel: boolean;
  assistantWidth: number;
  sourcePanelWidth: number;
  artifactsWidth: number;
  agentWidth: number;
  splitActive: boolean;
  // Work-Tree panel (optional so layouts saved before the panel existed load cleanly)
  showWorkTreePanel?: boolean;
  workTreeWidth?: number;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileEntry[] | null;
}

export interface Tab {
  id: string; // absolute file path (diff tabs append "#diff" / "#diff-staged")
  title: string;
  pinned: boolean;
  kind?: "document" | "diff";
  diffStaged?: boolean;
}

export interface SessionTab {
  id: string;
  title: string;
  active: boolean;
  openTabs: Tab[];
}

export interface UserAccount {
  name: string;
  email: string;
  avatarLetter: string;
  avatarColor: string;
}

export interface GoogleAccount {
  name: string;
  email: string;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// Persistent agent session (AGENTIC_ORCHESTRATION_PLAN.md Phase 1). Mirrors the
// agent_sessions row shape returned by the Rust commands (camelCase serde).
export interface AgentSession {
  id: string;
  title: string | null;
  agent: string | null;
  engine: string | null;
  model: string | null;
  status: string;
  goal: string | null;
  parentId: string | null;
  projectPath: string | null;
  context: string | null;
  summary: string | null;
  tokens: number;
  cost: number;
  createdAt: number;
  updatedAt: number;
}

// Scheduled/recurring study task (Phase 3 backend is already in place, so the
// store slice ships alongside the session slice).
export interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  model: string | null;
  agent: string | null;
  scope: string;
  scheduleSel: string;
  cron: string | null;
  weekday: string | null;
  time: string;
  timezone: string | null;
  disabled: boolean;
  lastRunAt: number | null;
  nextRun: number | null;
  createdAt: number;
}

// Pending destructive file-write tool approval (Phase 2b approval gate). A tool call
// suspends in `executeWorkspaceTool` until the user approves or rejects it.
export interface PendingToolApproval {
  id: string;
  tool: string;
  args: Record<string, any>;
  summary: string;
  status: "pending" | "approved" | "rejected";
}

const INITIAL_ASSISTANT_MESSAGES: AssistantMessage[] = [
  {
    id: "msg-1",
    role: "assistant",
    timestamp: "12:00 PM",
    content: "Welcome to Local Study Notebook! I am your offline study assistant. You can ask me for study tips, markdown help, or note-taking advice.",
  },
];

// Thread ⇄ agent_session porting (AGENTIC_ORCHESTRATION_PLAN.md Phase 1). The active
// assistant thread is mirrored into the active `agent_session.context` JSON column AND a
// localStorage map (`lsn_assistant_threads`, keyed by session id) during a transition
// window so threads survive even while the DB is unreadable (e.g. tauri invoke mocked).
function serializeThread(messages: AssistantMessage[]): string {
  return JSON.stringify(messages);
}

function deserializeThread(raw: string | null | undefined): AssistantMessage[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const valid = parsed.every(
        (m) =>
          m &&
          typeof m.id === "string" &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string"
      );
      if (valid) return parsed as AssistantMessage[];
    }
  } catch {
    // Not a valid thread payload — caller decides the fallback.
  }
  return null;
}

function readThreadMirror(): Record<string, AssistantMessage[]> {
  try {
    const raw = localStorage.getItem("lsn_assistant_threads");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, AssistantMessage[]>;
  } catch {
    // Ignore corrupt localStorage mirror.
  }
  return {};
}

// Runs the goal loop (imported lazily to avoid a static service↔store cycle) and keeps
// the store's live-run + session state in sync until the run finishes for any reason.
// Returns the finished AgentRun so callers (scheduled-task dispatch) can log status.
async function runGoalLoopWithHandlers(opts: {
  sessionId: string;
  goal: string;
  engine: "opencode" | "byok";
  abort: AbortController;
  pausedRef: { value: boolean };
}): Promise<AgentRun> {
  const { runGoalLoop, setActiveGoalRun } = await import("../services/agentOrchestrator");
  const store = useStore.getState();
  const finished = await runGoalLoop({
    sessionId: opts.sessionId,
    goal: opts.goal,
    engine: opts.engine,
    settings: store.settings,
    vaultRoot: store.currentFolderPath,
    signal: opts.abort.signal,
    pausedRef: opts.pausedRef,
    onRun: (run) => useStore.setState({ agentRun: run }),
    onStatus: (status) => {
      setActiveGoalRun(null);
      useStore.setState({
        goalRunning: false,
        goalPaused: false,
        assistantStatusText: status === "done" ? "Goal complete." : status === "blocked" ? "Goal blocked." : status === "stopped" ? "Goal stopped." : "Goal failed.",
      });
      // Reflect the terminal status on the owning session so the Sessions panel shows it.
      const reason = useStore.getState().agentRun?.lastVerdict?.reason;
      const summary = reason ? `Goal: ${opts.goal}\n${reason}` : `Goal: ${opts.goal}`;
      useStore.getState().patchAgentSession(opts.sessionId, { status, summary });
    },
  });
  void finished;
  return finished;
}

export interface Settings {
  fontSize: number;
  theme: string;
  accentColor: string;
  cornerRoundness: "sm" | "md" | "lg" | "none";
  lineWrap: boolean;
  tabSize: number;
  fontFamily: string;
  showLineNumbers: boolean;
  livePreviewEnabled: boolean;
  livePreviewTimeout: number; // in ms
  startupFolder: string;
  newNoteLocation: string;
  excludedFolders: string;
  attachmentsFolder: string;
  confirmBeforeDelete: boolean;
  reduceMotion: boolean;
  autoPairBrackets: boolean;
  showWordCount: boolean;

  // BYOK AI Engine Settings (also the fallback route when OpenCode fails)
  aiEnabled: boolean;
  aiProvider: string; // "ollama_hermes" | "openai" | "anthropic" | "gemini" | "custom"
  aiBaseUrl: string;
  aiApiKey: string;
  aiModelName: string;
  aiEnableWorkspaceTools: boolean;
  aiSystemPrompt: string;

  // Goal mode / auditor (AGENTIC_ORCHESTRATION_PLAN.md Phase 2). The auditor is a cheap
  // judge model; when empty, the main BYOK model is used. Goal loops cap spend via a
  // token budget and 3 stuck strikes.
  smallModel: string;
  smallModelBaseUrl: string;
  goalTokenBudget: number;
  goalMaxIterations: number;
  aiEnableAgentControls: boolean;

  // Primary assistant engine (fused panel): "opencode" (default) or "byok" (direct API)
  assistantEngine: "opencode" | "byok";
  opencodeFallbackToByok: boolean; // route to BYOK automatically when OpenCode is unavailable

  // Memory-RAG (Agent Knowledge) settings
  embedBaseUrl: string; // Ollama HTTP root, e.g. http://localhost:11434
  embedModel: string;   // embedding model tag, e.g. nomic-embed-text
  ragTopK: number;      // RAG passages injected into context per turn
  memoryAutoSave: boolean; // persist Q&A turns and extracted facts to memory_entries

  // File-mutation tools (create/update/delete) — off by default
  aiEnableFileWrite: boolean;

  // Diagnostics: append tool-calling activity (tools offered, calls made, results
  // returned) to a local debug log file — off by default, opt-in for troubleshooting.
  aiVerboseLogging: boolean;

  // OpenCode Agent Settings
  opencodePort: number;       // default 4096 (OpenCode's own default for `opencode serve`)
  opencodeAutoStart: boolean; // auto-start server when switching to OpenCode Agent tab

  // MCP Connectors
  connectors: McpConnector[];
}

const DEFAULT_SETTINGS: Settings = {
  fontSize: 14,
  theme: "obsidian-dark",
  accentColor: "",
  cornerRoundness: "md",
  lineWrap: true,
  tabSize: 4,
  fontFamily: "system",
  showLineNumbers: false,
  livePreviewEnabled: true,
  livePreviewTimeout: 1000,
  startupFolder: "",
  newNoteLocation: "",
  excludedFolders: "node_modules, .git",
  attachmentsFolder: "_attachments",
  confirmBeforeDelete: true,
  reduceMotion: false,
  autoPairBrackets: true,
  showWordCount: true,

  // BYOK AI Defaults
  aiEnabled: true,
  aiProvider: "ollama_hermes",
  aiBaseUrl: "http://localhost:11434/v1",
  aiApiKey: "",
  aiModelName: "hermes3:8b",
  aiEnableWorkspaceTools: true,
  aiSystemPrompt: "You are an intelligent study assistant for Local Study Notebook. Use workspace tools and context to provide accurate study summaries.",

  // Goal mode defaults: auditor pins to the main model + URL until the user supplies
  // a dedicated small model; budget 80k tokens / 12 iterations per goal run.
  smallModel: "",
  smallModelBaseUrl: "",
  goalTokenBudget: 80000,
  goalMaxIterations: 12,
  aiEnableAgentControls: true,

  // Memory-RAG defaults
  embedBaseUrl: "http://localhost:11434",
  embedModel: "nomic-embed-text",
  ragTopK: 5,
  memoryAutoSave: true,

  // File-mutation tools (create/update/delete) are gated off by default
  aiEnableFileWrite: false,
  aiVerboseLogging: false,

  // Primary engine defaults: OpenCode first, auto-fallback to BYOK
  assistantEngine: "opencode",
  opencodeFallbackToByok: true,

  // OpenCode Agent defaults
  opencodePort: 4096,        // OpenCode's actual documented default port for `opencode serve`
  opencodeAutoStart: true,

  // MCP Connectors — all disabled by default (offline-first, opt-in). Ship with the
  // research presets below so the user can flip them on in Settings -> Connectors.
  connectors: [],
};

interface AppState {
  // Explorer States
  currentFolderPath: string | null;
  explorerEntries: FileEntry[];
  pinnedPaths: string[];
  showSourcesPanel: boolean; // Toggles the Sidebar Explorer panel
  sidebarTab: "sources" | "notes"; // "sources" represents Folder Explorer, "notes" is Pinned/Recent notes list

  // Panel ordering (left-to-right order of the two side panels, StudyBoard is always last/center)
  panelOrder: SidePanelId[];
  reorderPanels: (fromId: SidePanelId, toId: SidePanelId) => void;

  // Split-Screen Workspace States
  splitActive: boolean;
  activePanel: "left" | "right";
  leftTabs: Tab[];
  rightTabs: Tab[];
  activeLeftTabId: string | null;
  activeRightTabId: string | null;
  leftDraft: string;
  rightDraft: string;
  leftViewMode: ViewMode;
  rightViewMode: ViewMode;
  leftSaveStatus: SaveStatus;
  rightSaveStatus: SaveStatus;
  leftLivePreviewActive: boolean;
  rightLivePreviewActive: boolean;
  sourcePreviewHeight: number;
  sourcePanelWidth: number;
  splitLeftWidth: number;   // pixel width of the left split pane (right pane absorbs the rest)

  // Artifacts panel
  showArtifactsPanel: boolean;
  artifactsWidth: number;
  activeArtifact: Artifact | null;
  artifacts: Artifact[];

  // Agent panel
  showAgentPanel: boolean;
  agentWidth: number;
  agentMessages: AgentMessage[];
  agentContext: string | null;
  agentTask: AgentTask;

  // Work-Tree (git) panel
  showWorkTreePanel: boolean;
  workTreeWidth: number;
  gitStatus: GitRepoStatus | null;
  gitStatusLoading: boolean;
  gitStatusError: string | null;
  diffContents: Record<string, string>;

  // Settings
  showSettings: boolean;
  settings: Settings;

  // Projects
  projects: Project[];
  showProjectsPanel: boolean;
  addProject: (id: string, name: string, path: string) => void;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  toggleProjectPinned: (id: string) => void;
  openProject: (id: string) => Promise<void>;
  setShowProjectsPanel: (show: boolean) => void;

  // Actions
  openFolder: (path: string) => Promise<void>;
  closeFolder: () => void;
  refreshExplorer: () => Promise<void>;
  createFile: (dirPath: string, name: string) => Promise<string>;
  createFolder: (parentPath: string, name: string) => Promise<string>;
  renameEntry: (oldPath: string, newPath: string) => Promise<void>;
  deleteEntry: (path: string) => Promise<void>;
  moveEntries: (entries: { oldPath: string; newPath: string }[]) => Promise<void>;

  openFile: (path: string, panel?: "left" | "right") => Promise<void>;
  openNewNote: () => Promise<void>;
  closeTab: (panel: "left" | "right", path: string) => Promise<void>;
  selectTab: (panel: "left" | "right", path: string) => Promise<void>;
  flushPendingSave: (panel?: "left" | "right") => Promise<void>;
  setDraftContent: (panel: "left" | "right", content: string) => void;
  saveFile: (panel: "left" | "right", path: string, content: string) => Promise<void>;
  togglePinPath: (path: string) => void;
  setPanelViewMode: (panel: "left" | "right", mode: ViewMode) => void;
  setPanelLivePreview: (panel: "left" | "right", active: boolean) => void;
  setActivePanel: (panel: "left" | "right") => void;
  splitScreen: () => void;
  closeSplit: () => void;
  moveTab: (fromPanel: "left" | "right", toPanel: "left" | "right", path: string) => Promise<void>;
  toggleSourcesPanel: () => void;
  setSidebarTab: (t: "sources" | "notes") => void;
  setSourcePreviewHeight: (h: number) => void;
  setSourcePanelWidth: (w: number) => void;
  setSplitLeftWidth: (w: number) => void;

  // Artifacts actions
  toggleArtifactsPanel: () => void;
  setArtifactsWidth: (w: number) => void;
  setActiveArtifact: (a: Artifact | null) => void;
  addArtifact: (a: Artifact) => void;
  deleteArtifact: (id: string) => void;

  // Agent actions
  toggleAgentPanel: () => void;
  setAgentWidth: (w: number) => void;
  setAgentMessages: (msgs: AgentMessage[]) => void;
  addAgentMessage: (msg: AgentMessage) => void;
  setAgentContext: (ctx: string | null) => void;
  setAgentTask: (task: AgentTask) => void;

  // Work-Tree (git) actions
  toggleWorkTreePanel: () => void;
  setWorkTreeWidth: (w: number) => void;
  refreshGitStatus: () => Promise<void>;
  openGitFile: (entry: GitStatusEntry) => Promise<void>;
  openGitDiff: (path: string, staged: boolean, panel?: "left" | "right") => Promise<void>;

  // Settings Actions
  setShowSettings: (show: boolean) => void;
  updateSettings: (s: Partial<Settings>) => void;

  // MCP Connector actions
  addConnector: (c: Omit<McpConnector, "id" | "enabled" | "tools">) => void;
  updateConnector: (id: string, patch: Partial<McpConnector>) => void;
  removeConnector: (id: string) => void;

  // Assistant / Co-pilot States & Actions
  showAssistantPanel: boolean;
  assistantWidth: number;
  assistantMessages: AssistantMessage[];
  selectedModel: string;
  assistantTopicTitle: string;
  filterQuery: string;
  isAssistantStreaming: boolean;
  assistantStatusText: string;
  availableModels: string[];                              // dynamically fetched from provider
  assistantAbortController: AbortController | null;       // never persisted to localStorage

  // Persistent agent sessions (AGENTIC_ORCHESTRATION_PLAN.md Phase 1)
  agentSessions: AgentSession[];
  activeAgentSessionId: string | null;
  scheduledTasks: ScheduledTask[];
  loadAgentSessions: () => Promise<void>;
  createAgentSession: (opts?: {
    title?: string | null;
    agent?: string | null;
    engine?: string | null;
    model?: string | null;
    parentId?: string | null;
  }) => Promise<AgentSession | null>;
  patchAgentSession: (id: string, fields: Partial<AgentSession>) => Promise<void>;
  archiveAgentSession: (id: string) => Promise<void>;
  forkAgentSession: (sessionId: string) => Promise<AgentSession | null>;
  setActiveAgentSession: (id: string | null) => void;
  loadScheduledTasks: () => Promise<void>;
  createScheduledTask: (opts: {
    name: string;
    prompt: string;
    scheduleSel: string;
    time?: string;
    cron?: string;
    weekday?: string;
  }) => Promise<ScheduledTask | null>;

  // Goal mode (AGENTIC_ORCHESTRATION_PLAN.md Phase 2) — live run + loop control
  agentRun: AgentRun | null;
  goalRunning: boolean;
  goalPaused: boolean;
  startGoalRun: (goal: string) => Promise<void>;
  stopGoalRun: () => void;
  pauseGoalRun: () => void;
  resumeGoalRun: () => void;
  patchScheduledTask: (id: string, fields: Partial<ScheduledTask>) => Promise<void>;
  deleteScheduledTask: (id: string) => Promise<void>;
  checkDueTasks: () => Promise<ScheduledTask[]>;
  scheduledTaskRunning: boolean;                       // wait-for-idle guard: never overlap two runs
  runScheduledTask: (task: ScheduledTask) => Promise<boolean>;

  // OpenCode Agent runtime state (never persisted to localStorage)
  opencodeInstalled: boolean;                            // result of check_opencode_installed
  opencodeServerPid: number | null;                      // PID of running opencode serve
  opencodeServerPort: number | null;                     // actual port the sidecar bound (may differ from settings.opencodePort if that was busy)
  opencodeServerPassword: string | null;                 // in-memory only, never persisted
  opencodeSessionId: string | null;                      // active opencode session (fused panel)
  opencodeStatus: "off" | "starting" | "ready" | "error"; // server readiness for engine routing

  // Destructive file-tool approval gate (Phase 2b)
  pendingToolApprovals: PendingToolApproval[];
  addPendingToolApproval: (approval: PendingToolApproval) => void;
  resolveToolApproval: (id: string, status: "approved" | "rejected") => void;
  clearToolApproval: (id: string) => void;

  sendAssistantMessage: (text: string) => Promise<void>;
  cancelAssistantMessage: () => void;
  clearAssistantMessages: () => void;
  setAssistantWidth: (w: number) => void;
  toggleAssistantPanel: () => void;
  setSelectedModel: (m: string) => void;
  setAssistantTopicTitle: (t: string) => void;
  setFilterQuery: (q: string) => void;
  fetchAndSetAvailableModels: () => Promise<void>;        // fetches live models from provider

  // OpenCode Agent actions
  checkOpencodeInstalled: () => Promise<void>;
  startOpencodeServer: () => Promise<void>;
  stopOpencodeServer: () => Promise<void>;
  ensureOpencodeReady: () => Promise<void>;   // server + session up, routes study chat
  resetOpencodeSession: () => void;           // starts a fresh opencode session on next turn

  // Google Drive backup (BACKUP-0): account + OAuth flow
  googleAccount: GoogleAccount | null;
  backupSigningIn: boolean;
  refreshGoogleAccount: () => Promise<void>;
  connectGoogle: () => Promise<void>;
  signOutGoogle: () => Promise<void>;

  // Session & Account States & Actions (TopBar)
  sessions: SessionTab[];
  activeSessionId: string;
  userAccount: UserAccount;
  showSearchModal: boolean;
  topbarViewMode: "grid" | "split" | "single";
  createSession: (title?: string) => void;
  closeSession: (id: string) => void;
  selectSession: (id: string) => void;
  setShowSearchModal: (show: boolean) => void;
  setTopbarViewMode: (mode: "grid" | "split" | "single") => void;

  // Onboarding
  onboardingComplete: boolean;
  completeOnboarding: () => void;

  // Launcher & Panel Arrangement States & Actions (Iteration 3)
  showLauncherModal: boolean;
  showPanelLayoutModal: boolean;
  panelPreset: "default" | "focus" | "assistant" | "explorer" | "custom";
  setShowLauncherModal: (show: boolean) => void;
  setShowPanelLayoutModal: (show: boolean) => void;
  applyPanelPreset: (preset: "default" | "focus" | "assistant" | "explorer") => void;
  scaffoldWorkspaceTemplate: (folderPath: string, templateId?: string) => Promise<void>;

  // Custom saved layouts (TICKET-B4)
  customLayouts: CustomLayout[];
  saveCustomLayout: (name: string) => void;
  applyCustomLayout: (id: string) => void;
  deleteCustomLayout: (id: string) => void;
}

/**
 * Renders the enabled connector registry into the OpenCode config shape opencode actually
 * accepts (verified live on v1.18): "local" (stdio) and "remote" (streamable-http) entries.
 * Secrets (headers/env) become `{env:VAR}` placeholders and the real values are returned in
 * `env` so the Rust side can scope them to the sidecar child only — nothing secret is written
 * to disk. Offline http connectors are skipped, mirroring the workspace-tools router.
 *
 * Always includes a `permission` block denying the `bash` tool by default: OpenCode's "ask"
 * outcome only has a documented approval flow in its own TUI, not over the `serve` HTTP/SSE
 * API this app drives, so a note or connector that prompt-injects the agent can't get it to
 * run shell commands unattended. Edit/read/git-via-MCP tools stay allowed. A user who wants
 * bash back can drop their own opencode.json in the vault — this export is skipped whenever
 * a user-authored one already exists (see spawn_opencode_server).
 *
 * The payload carries a `_lsnManaged: true` marker so a future run can tell this file
 * apart from a real user config. Without it, a file orphaned by an unclean shutdown
 * (kill_opencode_server normally deletes it, but a crash/force-kill skips that) would
 * look identical to a hand-authored config on the next launch and permanently block
 * the export — silently freezing stale MCP servers/permissions in place.
 */
export function buildOpencodeMcpExport(
  connectors: McpConnector[],
): { config: string | null; env: Record<string, string> } {
  const servers: Record<string, unknown> = {};
  const env: Record<string, string> = {};
  const used = new Set<string>();
  let envIdx = 0;

  const safeName = (raw: string, _id: string) => {
    let base = (raw || "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (!base) base = "connector";
    let name = base;
    let n = 2;
    while (used.has(name)) {
      name = `${base}-${n++}`;
    }
    used.add(name);
    return name;
  };
  const secretToPlaceholder = (value: string) => {
    const varName = `LSN_MCP_${++envIdx}`;
    env[varName] = value;
    return `{env:${varName}}`;
  };

  for (const c of connectors) {
    if (!c.enabled) continue;
    if (c.kind === "http" && (typeof navigator === "undefined" || !navigator.onLine)) continue;

    if (c.kind === "stdio") {
      const command = (c.command || "").trim();
      if (!command) continue;
      const args = (c.args ?? []).filter((a) => a.trim() !== "");
      const entry: Record<string, unknown> = {
        type: "local",
        command: [command, ...args],
        enabled: true,
      };
      const cEnv = c.env ?? {};
      const envKeys = Object.keys(cEnv).filter((k) => cEnv[k].trim() !== "");
      if (envKeys.length > 0) {
        const mapped: Record<string, string> = {};
        for (const k of envKeys) {
          mapped[k] = secretToPlaceholder(cEnv[k]);
        }
        entry.env = mapped;
      }
      servers[safeName(c.name, c.id)] = entry;
    } else {
      const url = (c.url || "").trim();
      if (!url) continue;
      const entry: Record<string, unknown> = { type: "remote", url };
      const h = c.headers ?? {};
      const headerKeys = Object.keys(h).filter((k) => h[k].trim() !== "");
      if (headerKeys.length > 0) {
        const mapped: Record<string, string> = {};
        for (const k of headerKeys) {
          mapped[k] = secretToPlaceholder(h[k]);
        }
        entry.headers = mapped;
      }
      servers[safeName(c.name, c.id)] = entry;
    }
  }

  const payload: Record<string, unknown> = { _lsnManaged: true, permission: { bash: "deny" } };
  if (Object.keys(servers).length > 0) payload.mcp = servers;
  return { config: JSON.stringify(payload), env };
}

export const useStore = create<AppState>((set, get) => {
  // Load initial settings and pinned paths from localStorage
  const localSettings = localStorage.getItem("lsn_settings");
  const parsedSettings = localSettings ? JSON.parse(localSettings) : {};
  // Merge persisted settings over defaults; seed the connector registry with presets only
  // on a true first run (no `connectors` key at all). Once the registry exists — even as an
  // empty array — the user's choice is respected.
  const existingConnectors: McpConnector[] | undefined = parsedSettings?.connectors;
  const initialConnectors: McpConnector[] =
    Array.isArray(existingConnectors) ? existingConnectors : CONNECTOR_PRESETS;
  const initialSettings = { ...DEFAULT_SETTINGS, ...parsedSettings, connectors: initialConnectors };
  const initialPinned = localStorage.getItem("lsn_pinned");
  const pinnedPaths = initialPinned ? JSON.parse(initialPinned) : [];
  const savedFolder = localStorage.getItem("lsn_last_folder");
  const localProjects = localStorage.getItem("lsn_projects");
  const initialProjects: Project[] = localProjects ? JSON.parse(localProjects) : [];
  const localPanelOrder = localStorage.getItem("lsn_panel_order");
  const parsedPanelOrder: SidePanelId[] | null = localPanelOrder ? JSON.parse(localPanelOrder) : null;
  const VALID_PANEL_IDS: SidePanelId[] = ["assistant", "sources", "artifacts", "agent", "worktree"];
  const isValidPanelOrder =
    parsedPanelOrder &&
    Array.isArray(parsedPanelOrder) &&
    parsedPanelOrder.length >= 1 &&
    parsedPanelOrder.length <= 5 &&
    parsedPanelOrder.every((id) => VALID_PANEL_IDS.includes(id)) &&
    parsedPanelOrder.includes("assistant") &&
    parsedPanelOrder.includes("sources");
  const initialPanelOrder: SidePanelId[] = isValidPanelOrder ? parsedPanelOrder! : ["assistant", "sources"];
  const localCustomLayouts = localStorage.getItem("lsn_custom_layouts");
  const initialCustomLayouts: CustomLayout[] = localCustomLayouts ? JSON.parse(localCustomLayouts) : [];
  const onboardingComplete = localStorage.getItem("lsn_onboarding_complete") === "true";
  const localSessions = localStorage.getItem("lsn_sessions");
  const initialSessions: SessionTab[] = localSessions
    ? JSON.parse(localSessions)
    : [{ id: "sess-default", title: "Default Session", active: true, openTabs: [] }];
  const initialActiveSessionId = initialSessions.find((s) => s.active)?.id || initialSessions[0].id;

  // Apply the persisted theme immediately (live colors)
  const themeColors = getThemeById(initialSettings.theme).colors;
  applyThemeToDocument({
    ...themeColors,
    accent: initialSettings.accentColor || themeColors.accent,
    accentHover: initialSettings.accentColor || themeColors.accentHover,
  });

  // Local write timer refs managed inside store callbacks
  let leftSaveTimer: number | null = null;
  let rightSaveTimer: number | null = null;
  // Debounced git status refresh after a file write (Work-Tree panel)
  let gitRefreshTimer: number | null = null;

  return {
    // Explorer States
    currentFolderPath: savedFolder || null,
    explorerEntries: [],
    pinnedPaths: pinnedPaths,
    showSourcesPanel: true,
    sidebarTab: "sources",
    sourcePanelWidth: 200,
    panelOrder: initialPanelOrder,

    // Projects
    projects: initialProjects,
    showProjectsPanel: false,

    // Split-Screen Workspace States
    splitActive: false,
    activePanel: "left",
    leftTabs: [],
    rightTabs: [],
    activeLeftTabId: null,
    activeRightTabId: null,
    leftDraft: "",
    rightDraft: "",
    leftViewMode: "live",
    rightViewMode: "live",
    leftSaveStatus: "saved",
    rightSaveStatus: "saved",
    leftLivePreviewActive: false,
    rightLivePreviewActive: false,
    sourcePreviewHeight: 250,
    splitLeftWidth: 0,

    // Artifacts
    showArtifactsPanel: false,
    artifactsWidth: 340,
    activeArtifact: null,
    artifacts: [],

    // Agent
    showAgentPanel: false,
    agentWidth: 340,
    agentMessages: [],
    agentContext: null,
    agentTask: "custom",

    // Work-Tree (git)
    showWorkTreePanel: false,
    workTreeWidth: 320,
    gitStatus: null,
    gitStatusLoading: false,
    gitStatusError: null,
    diffContents: {},

    // Assistant States
    showAssistantPanel: true,
    assistantWidth: 380,
    assistantMessages: INITIAL_ASSISTANT_MESSAGES,
    agentSessions: [],
    activeAgentSessionId: null,
    scheduledTasks: [],
    scheduledTaskRunning: false,
    agentRun: null,
    goalRunning: false,
    goalPaused: false,
    selectedModel: "Big Pickle",
    assistantTopicTitle: "Local Study Notebook implementation plan",
    filterQuery: "",

    // Session & Account States
    sessions: initialSessions,
    activeSessionId: initialActiveSessionId,
    userAccount: {
      name: "Developer Workspace",
      email: "developer@localnotebook.app",
      avatarLetter: "D",
      avatarColor: "#7c3aed"
    },
    googleAccount: null,
    backupSigningIn: false,
    showSearchModal: false,
    topbarViewMode: "split",

    // Launcher & Panel Arrangement States (Iteration 3)
    showLauncherModal: false,
    showPanelLayoutModal: false,
    panelPreset: "default",
    customLayouts: initialCustomLayouts,

    // Onboarding
    onboardingComplete: onboardingComplete,

    // Settings
    showSettings: false,
    settings: initialSettings,

    // Folder Actions
    openFolder: async (path) => {
      set({ currentFolderPath: path });
      localStorage.setItem("lsn_last_folder", path);
      await get().refreshExplorer();
      get().refreshGitStatus();
      // Full vault-index rescan (DATA-2) — fire-and-forget so a large vault's content
      // hashing doesn't delay the folder actually opening; incremental updates from
      // individual file operations keep the index current the rest of the time.
      // Once the rescan lands, kick the lazy Memory-RAG embedding pass (debounced) so
      // chunk rows written by this rescan get vectors without blocking the open.
      invoke("reindex_vault", { vaultRoot: path })
        .then(() => {
          if (pendingEmbedRebuildTimer !== null) clearTimeout(pendingEmbedRebuildTimer);
          pendingEmbedRebuildTimer = setTimeout(() => {
            pendingEmbedRebuildTimer = null;
            const s = get().settings;
            if (!s.aiEnabled) return;
            import("../services/agentKnowledge").then(({ rebuildEmbeddings }) => {
              rebuildEmbeddings(path, s).catch(() => {});
            });
          }, 800);
        })
        .catch((err) => {
          console.error("Failed to reindex vault:", err);
        });
      // Restore the vault's persisted artifact registry (P0.2) so AI output from a
      // previous session reappears once the folder is open.
      import("../services/agentKnowledge").then(({ loadPersistedArtifacts }) =>
        loadPersistedArtifacts(path)
          .then((list) => {
            if (list) set({ artifacts: list });
          })
          .catch(() => {})
      );
    },

    closeFolder: () => {
      set({ currentFolderPath: null, explorerEntries: [], leftTabs: [], rightTabs: [], activeLeftTabId: null, activeRightTabId: null, gitStatus: null, gitStatusError: null, artifacts: [], activeArtifact: null });
      localStorage.removeItem("lsn_last_folder");
    },

    refreshExplorer: async () => {
      const folderPath = get().currentFolderPath;
      if (!folderPath) return;
      try {
        const excludedList = get()
          .settings.excludedFolders.split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        const entries = await invoke<FileEntry[]>("read_local_dir", {
          path: folderPath,
          excludedFolders: excludedList,
        });
        set({ explorerEntries: entries });
      } catch (err) {
        console.error("Failed to read local folder explorer directory:", err);
      }
    },

    createFile: async (dirPath, name) => {
      try {
        const path = await invoke<string>("create_local_file", {
          dirPath,
          name,
          vaultRoot: get().currentFolderPath || undefined,
        });
        await get().refreshExplorer();
        get().refreshGitStatus();
        return path;
      } catch (err) {
        throw new Error(String(err));
      }
    },

    createFolder: async (parentPath, name) => {
      try {
        const path = await invoke<string>("create_local_dir", {
          parentPath,
          name,
          vaultRoot: get().currentFolderPath || undefined,
        });
        await get().refreshExplorer();
        get().refreshGitStatus();
        return path;
      } catch (err) {
        throw new Error(String(err));
      }
    },

    renameEntry: async (oldPath, newPath) => {
      try {
        await invoke("rename_local_entry", {
          oldPath,
          newPath,
          vaultRoot: get().currentFolderPath || undefined,
        });
        
        // Update tabs referencing this path
        const updateTabs = (tabs: Tab[]) =>
          tabs.map((t) => {
            if (t.id === oldPath) {
              const name = newPath.split(/[\\/]/).pop() ?? newPath;
              return { ...t, id: newPath, title: name.replace(/\.md$/, "") };
            }
            return t;
          });

        const leftTabs = updateTabs(get().leftTabs);
        const rightTabs = updateTabs(get().rightTabs);
        const activeLeft = get().activeLeftTabId === oldPath ? newPath : get().activeLeftTabId;
        const activeRight = get().activeRightTabId === oldPath ? newPath : get().activeRightTabId;

        set({ leftTabs, rightTabs, activeLeftTabId: activeLeft, activeRightTabId: activeRight });
        await get().refreshExplorer();
        get().refreshGitStatus();
      } catch (err) {
        throw new Error(String(err));
      }
    },

    moveEntries: async (entries) => {
      try {
        for (const entry of entries) {
          await invoke("rename_local_entry", {
            oldPath: entry.oldPath,
            newPath: entry.newPath,
            vaultRoot: get().currentFolderPath || undefined,
          });

          // Update open tabs that reference the old path
          const updateTabs = (tabs: Tab[]) =>
            tabs.map((t) => {
              if (t.id === entry.oldPath) {
                const name = entry.newPath.split(/[\\/]/).pop() ?? entry.newPath;
                return { ...t, id: entry.newPath, title: name.replace(/\.md$/, "") };
              }
              return t;
            });

          const leftTabs = updateTabs(get().leftTabs);
          const rightTabs = updateTabs(get().rightTabs);
          const activeLeft = get().activeLeftTabId === entry.oldPath ? entry.newPath : get().activeLeftTabId;
          const activeRight = get().activeRightTabId === entry.oldPath ? entry.newPath : get().activeRightTabId;

          set({ leftTabs, rightTabs, activeLeftTabId: activeLeft, activeRightTabId: activeRight });
        }
        await get().refreshExplorer();
        get().refreshGitStatus();
      } catch (err) {
        throw new Error(String(err));
      }
    },

    deleteEntry: async (path) => {
      try {
        await invoke("delete_local_entry", {
          path,
          vaultRoot: get().currentFolderPath || undefined,
        });
        
        // Close tabs referencing this path
        get().closeTab("left", path);
        get().closeTab("right", path);
        
        await get().refreshExplorer();
        get().refreshGitStatus();
      } catch (err) {
        throw new Error(String(err));
      }
    },

    // File Workspace Actions
    openFile: async (path, panel) => {
      const targetPanel = panel || get().activePanel;
      const isLeft = targetPanel === "left";
      const tabs = isLeft ? get().leftTabs : get().rightTabs;
      const activeId = isLeft ? get().activeLeftTabId : get().activeRightTabId;

      if (activeId === path) return;

      await get().flushPendingSave(targetPanel);

      // Check if already open in this panel
      const existing = tabs.find((t) => t.id === path);
      if (existing) {
        if (isLeft) {
          set({ activeLeftTabId: path });
        } else {
          set({ activeRightTabId: path });
        }
        // Load contents into draft
        try {
          const content = await invoke<string>("read_local_file", {
            path,
            vaultRoot: get().currentFolderPath || undefined,
          });
          if (isLeft) set({ leftDraft: content, leftSaveStatus: "saved" }); else set({ rightDraft: content, rightSaveStatus: "saved" });
        } catch {}
        return;
      }

      // Read file content
      let content = "";
      try {
        content = await invoke<string>("read_local_file", {
          path,
          vaultRoot: get().currentFolderPath || undefined,
        });
      } catch (err) {
        console.error("Failed to read file", err);
        return;
      }

      const filename = path.split(/[\\/]/).pop() ?? "Note";
      const title = filename.replace(/\.md$/, "");
      const isPinned = get().pinnedPaths.includes(path);
      const newTab: Tab = { id: path, title, pinned: isPinned };

      const activeTab = tabs.find((t) => t.id === activeId);

      if (tabs.length === 0 || activeId === null || !activeTab || activeTab.pinned) {
        // Open in new tab
        const newTabs = [...tabs, newTab];
        if (isLeft) {
          set({ leftTabs: newTabs, activeLeftTabId: path, leftDraft: content, leftSaveStatus: "saved" });
        } else {
          set({ rightTabs: newTabs, activeRightTabId: path, rightDraft: content, rightSaveStatus: "saved" });
        }
      } else {
        // Reuse current active unpinned tab
        const newTabs = tabs.map((t) => (t.id === activeId ? newTab : t));
        if (isLeft) {
          set({ leftTabs: newTabs, activeLeftTabId: path, leftDraft: content, leftSaveStatus: "saved" });
        } else {
          set({ rightTabs: newTabs, activeRightTabId: path, rightDraft: content, rightSaveStatus: "saved" });
        }
      }
    },

    openNewNote: async () => {
      const folderPath = get().currentFolderPath;
      if (!folderPath) {
        alert("Please open a local workspace folder first to create notes!");
        return;
      }

      const subFolder = get().settings.newNoteLocation.trim();
      let targetDir = folderPath;
      if (subFolder) {
        targetDir = `${folderPath}/${subFolder}`.replace(/[\\/]+/g, "/");
        try {
          await get().createFolder(folderPath, subFolder);
        } catch {
          // Subfolder may already exist
        }
      }

      // Try "Untitled", "Untitled 1", "Untitled 2", ... letting the backend's actual
      // filesystem check decide what already exists, rather than predicting it here —
      // `explorerEntries` is a flat, top-level-only, possibly-stale list, and comparing
      // its paths against a JS-joined `${dir}/${name}` string breaks on Windows anyway
      // (backend paths use `\`, this join always uses `/`), so a real pre-existing
      // "Untitled.md" was never detected and every click hit the backend's own
      // "File already exists" rejection instead of picking the next available name.
      const MAX_ATTEMPTS = 200;
      let lastErr: unknown = null;
      for (let index = 0; index <= MAX_ATTEMPTS; index++) {
        const name = index === 0 ? "Untitled" : `Untitled ${index}`;
        try {
          const path = await get().createFile(targetDir, name);
          await get().openFile(path);
          return;
        } catch (err) {
          lastErr = err;
          if (!String(err).toLowerCase().includes("already exists")) break;
        }
      }
      alert("Failed to create new file: " + lastErr);
    },

    closeTab: async (panel, path) => {
      const isLeft = panel === "left";
      const activeId = isLeft ? get().activeLeftTabId : get().activeRightTabId;

      if (activeId === path) {
        await get().flushPendingSave(panel);
      }

      const tabs = isLeft ? get().leftTabs : get().rightTabs;
      const newTabs = tabs.filter((t) => t.id !== path);
      let nextActive = activeId;

      if (activeId === path) {
        nextActive = newTabs.length ? newTabs[newTabs.length - 1].id : null;
      }

      if (isLeft) {
        set({ leftTabs: newTabs, activeLeftTabId: nextActive });
        if (nextActive) {
          const nextIsDiff = (newTabs.find((t) => t.id === nextActive)?.kind ?? "document") === "diff";
          if (nextIsDiff) {
            set({ leftDraft: "", leftSaveStatus: "saved" });
          } else {
            try {
              const c = await invoke<string>("read_local_file", { path: nextActive });
              set({ leftDraft: c, leftSaveStatus: "saved" });
            } catch {}
          }
        } else {
          set({ leftDraft: "", leftSaveStatus: "saved" });
        }
      } else {
        set({ rightTabs: newTabs, activeRightTabId: nextActive });
        if (nextActive) {
          const nextIsDiff = (newTabs.find((t) => t.id === nextActive)?.kind ?? "document") === "diff";
          if (nextIsDiff) {
            set({ rightDraft: "", rightSaveStatus: "saved" });
          } else {
            try {
              const c = await invoke<string>("read_local_file", { path: nextActive });
              set({ rightDraft: c, rightSaveStatus: "saved" });
            } catch {}
          }
        } else {
          set({ rightDraft: "", rightSaveStatus: "saved" });
        }
      }
    },

    selectTab: async (panel, path) => {
      const isLeft = panel === "left";
      const activeId = isLeft ? get().activeLeftTabId : get().activeRightTabId;
      if (activeId === path) return;

      await get().flushPendingSave(panel);

      // Diff tabs are virtual — their content lives in `diffContents`, not on disk.
      const tabs = isLeft ? get().leftTabs : get().rightTabs;
      const isDiff = (tabs.find((t) => t.id === path)?.kind ?? "document") === "diff";
      if (isDiff) {
        if (isLeft) set({ activeLeftTabId: path, leftDraft: "" });
        else set({ activeRightTabId: path, rightDraft: "" });
        return;
      }

      if (isLeft) {
        set({ activeLeftTabId: path });
        try {
          const c = await invoke<string>("read_local_file", { path });
          set({ leftDraft: c, leftSaveStatus: "saved" });
        } catch (e) {
          console.error("Failed to read file on selectTab", e);
        }
      } else {
        set({ activeRightTabId: path });
        try {
          const c = await invoke<string>("read_local_file", { path });
          set({ rightDraft: c, rightSaveStatus: "saved" });
        } catch (e) {
          console.error("Failed to read file on selectTab", e);
        }
      }
    },

    flushPendingSave: async (panel) => {
      if (!panel || panel === "left") {
        if (leftSaveTimer !== null) {
          window.clearTimeout(leftSaveTimer);
          leftSaveTimer = null;
        }
        const leftId = get().activeLeftTabId;
        if (leftId && get().leftSaveStatus === "unsaved") {
          await get().saveFile("left", leftId, get().leftDraft);
        }
      }
      if (!panel || panel === "right") {
        if (rightSaveTimer !== null) {
          window.clearTimeout(rightSaveTimer);
          rightSaveTimer = null;
        }
        const rightId = get().activeRightTabId;
        if (rightId && get().rightSaveStatus === "unsaved") {
          await get().saveFile("right", rightId, get().rightDraft);
        }
      }
    },

    setDraftContent: (panel, content) => {
      const isLeft = panel === "left";
      const activeId = isLeft ? get().activeLeftTabId : get().activeRightTabId;
      if (!activeId) return;

      if (isLeft) {
        set({ leftDraft: content, leftSaveStatus: "unsaved" });
        if (leftSaveTimer !== null) window.clearTimeout(leftSaveTimer);
        leftSaveTimer = window.setTimeout(async () => {
          leftSaveTimer = null;
          if (get().activeLeftTabId === activeId && get().leftSaveStatus === "unsaved") {
            await get().saveFile("left", activeId, content);
          }
        }, get().settings.livePreviewTimeout);
      } else {
        set({ rightDraft: content, rightSaveStatus: "unsaved" });
        if (rightSaveTimer !== null) window.clearTimeout(rightSaveTimer);
        rightSaveTimer = window.setTimeout(async () => {
          rightSaveTimer = null;
          if (get().activeRightTabId === activeId && get().rightSaveStatus === "unsaved") {
            await get().saveFile("right", activeId, content);
          }
        }, get().settings.livePreviewTimeout);
      }
    },

    saveFile: async (panel, path, content) => {
      const isLeft = panel === "left";
      if (isLeft) set({ leftSaveStatus: "saving" }); else set({ rightSaveStatus: "saving" });

      try {
        await invoke("write_local_file", {
          path,
          content,
          vaultRoot: get().currentFolderPath || undefined,
        });
        if (isLeft) set({ leftSaveStatus: "saved" }); else set({ rightSaveStatus: "saved" });
        
        // Refresh filename if user updated the first header
        const filename = path.split(/[\\/]/).pop() ?? "Note";
        let displayTitle = filename.replace(/\.md$/, "");
        
        const firstHeading = content
          .split(/\r?\n/)
          .map((str: string) => str.trim())
          .find((l: string) => l.startsWith('#'));
        
        if (firstHeading) {
          displayTitle = firstHeading.replace(/^#+\s*/, "").trim();
        }

        const updateTabTitle = (tabs: Tab[]) =>
          tabs.map((t) => (t.id === path ? { ...t, title: displayTitle } : t));

        if (isLeft) {
          set({ leftTabs: updateTabTitle(get().leftTabs) });
        } else {
          set({ rightTabs: updateTabTitle(get().rightTabs) });
        }

        // The on-disk working tree changed — refresh the git panel (debounced).
        if (get().showWorkTreePanel) {
          if (gitRefreshTimer !== null) window.clearTimeout(gitRefreshTimer);
          gitRefreshTimer = window.setTimeout(() => {
            gitRefreshTimer = null;
            get().refreshGitStatus();
          }, 600);
        }
      } catch (err) {
        if (isLeft) set({ leftSaveStatus: "unsaved" }); else set({ rightSaveStatus: "unsaved" });
        console.error("Autosave failed", err);
      }
    },

    togglePinPath: (path) => {
      const pinned = get().pinnedPaths;
      const isPinned = pinned.includes(path);
      const nextPinned = isPinned ? pinned.filter((p) => p !== path) : [...pinned, path];
      
      set({ pinnedPaths: nextPinned });
      localStorage.setItem("lsn_pinned", JSON.stringify(nextPinned));

      const updatePin = (tabs: Tab[]) =>
        tabs.map((t) => (t.id === path ? { ...t, pinned: !isPinned } : t));

      set({ leftTabs: updatePin(get().leftTabs), rightTabs: updatePin(get().rightTabs) });
    },

    setPanelViewMode: (panel, mode) => {
      if (panel === "left") set({ leftViewMode: mode }); else set({ rightViewMode: mode });
    },

    setPanelLivePreview: (panel, active) => {
      if (panel === "left") set({ leftLivePreviewActive: active }); else set({ rightLivePreviewActive: active });
    },

    setActivePanel: (panel) => set({ activePanel: panel }),

    splitScreen: () => {
      // Set split to active and copy left tab structure into right if right is empty
      const leftActiveId = get().activeLeftTabId;
      const rightTabs = get().rightTabs;
      
      if (rightTabs.length === 0 && leftActiveId) {
        const leftTab = get().leftTabs.find((t) => t.id === leftActiveId);
        if (leftTab) {
          set({
            rightTabs: [leftTab],
            activeRightTabId: leftActiveId,
            rightDraft: get().leftDraft,
            rightViewMode: get().leftViewMode,
            rightSaveStatus: "saved"
          });
        }
      }
      set({ splitActive: true, activePanel: "right" });
    },

    closeSplit: () => {
      set({ splitActive: false, rightTabs: [], activeRightTabId: null, activePanel: "left" });
    },

    moveTab: async (fromPanel, toPanel, path) => {
      if (fromPanel === toPanel) return;
      const fromIsLeft = fromPanel === "left";
      const toIsLeft = toPanel === "left";

      const fromTabs = fromIsLeft ? get().leftTabs : get().rightTabs;
      const tab = fromTabs.find((t) => t.id === path);
      if (!tab || (tab.kind ?? "document") === "diff") return;

      const fromActiveId = fromIsLeft ? get().activeLeftTabId : get().activeRightTabId;
      const isActiveInSource = fromActiveId === path;

      // Reuse the already-loaded draft when moving the source panel's active tab;
      // otherwise (a background tab) there's no in-memory copy, so read it from disk.
      let content: string;
      if (isActiveInSource) {
        await get().flushPendingSave(fromPanel);
        content = fromIsLeft ? get().leftDraft : get().rightDraft;
      } else {
        try {
          content = await invoke<string>("read_local_file", { path });
        } catch (err) {
          console.error("Failed to read file for tab move", err);
          return;
        }
      }

      // Remove from source panel, promoting another tab to active there if needed
      const newFromTabs = fromTabs.filter((t) => t.id !== path);
      const nextFromActive = isActiveInSource
        ? newFromTabs.length
          ? newFromTabs[newFromTabs.length - 1].id
          : null
        : fromActiveId;

      if (fromIsLeft) {
        set({ leftTabs: newFromTabs, activeLeftTabId: nextFromActive });
      } else {
        set({ rightTabs: newFromTabs, activeRightTabId: nextFromActive });
      }

      if (isActiveInSource) {
        if (nextFromActive) {
          try {
            const c = await invoke<string>("read_local_file", { path: nextFromActive });
            if (fromIsLeft) set({ leftDraft: c, leftSaveStatus: "saved" });
            else set({ rightDraft: c, rightSaveStatus: "saved" });
          } catch {}
        } else {
          if (fromIsLeft) set({ leftDraft: "", leftSaveStatus: "saved" });
          else set({ rightDraft: "", rightSaveStatus: "saved" });
        }
      }

      // Ensure the destination panel exists (auto-split when dropping into an unsplit view)
      if (!get().splitActive) {
        set({ splitActive: true });
      }

      const toTabs = toIsLeft ? get().leftTabs : get().rightTabs;
      const newToTabs = toTabs.some((t) => t.id === path) ? toTabs : [...toTabs, tab];

      if (toIsLeft) {
        set({ leftTabs: newToTabs, activeLeftTabId: path, leftDraft: content, leftSaveStatus: "saved" });
      } else {
        set({ rightTabs: newToTabs, activeRightTabId: path, rightDraft: content, rightSaveStatus: "saved" });
      }

      set({ activePanel: toPanel });
    },

    toggleSourcesPanel: () => set((s) => ({ showSourcesPanel: !s.showSourcesPanel })),
    setSidebarTab: (t) => set({ sidebarTab: t }),
    setSourcePreviewHeight: (h) => set({ sourcePreviewHeight: h }),
    setSourcePanelWidth: (w) => set({ sourcePanelWidth: w }),
    setSplitLeftWidth: (w) => set({ splitLeftWidth: Math.max(w, 200) }),
    toggleArtifactsPanel: () => set((s) => ({ showArtifactsPanel: !s.showArtifactsPanel })),
    setArtifactsWidth: (w) => set({ artifactsWidth: w }),
    setActiveArtifact: (a) => set({ activeArtifact: a }),
    addArtifact: (a) => {
      set((s) => ({ artifacts: [...s.artifacts, a], activeArtifact: a }));
      const { currentFolderPath, artifacts } = get();
      if (currentFolderPath && artifacts.length) {
        import("../services/agentKnowledge").then(({ persistArtifacts }) =>
          persistArtifacts(currentFolderPath, artifacts).catch(() => {})
        );
      }
    },
    deleteArtifact: (id) => {
      set((s) => ({
        artifacts: s.artifacts.filter((a) => a.id !== id),
        activeArtifact: s.activeArtifact?.id === id ? null : s.activeArtifact,
      }));
      const { currentFolderPath, artifacts } = get();
      if (currentFolderPath) {
        import("../services/agentKnowledge").then(({ persistArtifacts }) =>
          persistArtifacts(currentFolderPath, artifacts).catch(() => {})
        );
      }
    },
    toggleAgentPanel: () => set((s) => ({ showAgentPanel: !s.showAgentPanel })),
    setAgentWidth: (w) => set({ agentWidth: w }),
    toggleWorkTreePanel: () => set((s) => ({ showWorkTreePanel: !s.showWorkTreePanel })),
    setWorkTreeWidth: (w) => set({ workTreeWidth: w }),

    // Persistent agent sessions + scheduled tasks (AGENTIC_ORCHESTRATION_PLAN.md Phase 1)
    loadAgentSessions: async () => {
      try {
        const list = await invoke<AgentSession[]>("list_agent_sessions");
        set((s) => ({
          agentSessions: list,
          activeAgentSessionId:
            s.activeAgentSessionId && list.some((x) => x.id === s.activeAgentSessionId)
              ? s.activeAgentSessionId
              : list[0]?.id ?? null,
        }));
      } catch (err) {
        set((s) => ({ agentSessions: s.agentSessions }));
      }
    },
    createAgentSession: async (opts) => {
      try {
        const session = await invoke<AgentSession>("create_agent_session", {
          title: opts?.title ?? null,
          agent: opts?.agent ?? null,
          engine: opts?.engine ?? "opencode",
          model: opts?.model ?? null,
          parentId: opts?.parentId ?? null,
        });
        set((s) => ({
          agentSessions: [session, ...s.agentSessions],
          activeAgentSessionId: session.id,
        }));
        return session;
      } catch (err) {
        console.error("create_agent_session failed", err);
        return null;
      }
    },
    patchAgentSession: async (id, fields) => {
      try {
        const updated = await invoke<AgentSession>("patch_agent_session", { id, fields });
        set((s) => ({
          agentSessions: s.agentSessions.map((x) => (x.id === id ? updated : x)),
        }));
      } catch (err) {
        console.error("patch_agent_session failed", err);
      }
    },
    archiveAgentSession: async (id) => {
      try {
        await invoke<void>("archive_agent_session", { id });
        set((s) => {
          const agentSessions = s.agentSessions.filter((x) => x.id !== id);
          return {
            agentSessions,
            activeAgentSessionId:
              s.activeAgentSessionId === id ? (agentSessions[0]?.id ?? null) : s.activeAgentSessionId,
          };
        });
      } catch (err) {
        console.error("archive_agent_session failed", err);
      }
    },
    forkAgentSession: async (sessionId) => {
      try {
        const child = await invoke<AgentSession>("fork_agent_session", { sessionId });
        set((s) => ({
          agentSessions: [child, ...s.agentSessions],
          activeAgentSessionId: child.id,
        }));
        return child;
      } catch (err) {
        console.error("fork_agent_session failed", err);
        return null;
      }
    },
    setActiveAgentSession: (id) => {
      set((s) => {
        const sess = s.agentSessions.find((x) => x.id === id);
        const restored = sess
          ? deserializeThread(sess.context) ??
            (readThreadMirror()[sess.id] as AssistantMessage[] | undefined) ??
            null
          : null;
        return {
          activeAgentSessionId: id,
          assistantMessages: restored ?? s.assistantMessages,
        };
      });
    },

    // Goal mode (AGENTIC_ORCHESTRATION_PLAN.md Phase 2). The loop service owns the
    // state machine; the store owns the live run + pause/stop control surface.
    startGoalRun: async (goal) => {
      const goalText = goal.trim();
      if (!goalText) return;
      const store = get();
      if (store.goalRunning) return;

      let sessionId = store.activeAgentSessionId;
      if (!sessionId) {
        const created = await store.createAgentSession({
          title: goalText.length > 40 ? `${goalText.slice(0, 40)}…` : goalText,
          engine: store.settings.assistantEngine,
        });
        if (!created) return;
        sessionId = created.id;
      }

      const abort = new AbortController();
      const pausedRef = { value: false };
      set((s) => ({
        agentRun: {
          id: "",
          sessionId: sessionId as string,
          goal: goalText,
          status: "running",
          iterations: 0,
          stuckStrikes: 0,
          tokenEstimate: 0,
          lastVerdict: null,
          startedAt: Date.now(),
          finishedAt: null,
        },
        goalRunning: true,
        goalPaused: false,
        assistantStatusText: `🎯 Running goal…`,
      }));

      const control = { abort, paused: pausedRef };
      await import("../services/agentOrchestrator").then(({ setActiveGoalRun }) =>
        setActiveGoalRun(control)
      );

      runGoalLoopWithHandlers({
        sessionId: sessionId as string,
        goal: goalText,
        engine: store.settings.assistantEngine,
        abort,
        pausedRef,
      }).catch((err) => console.error("goal run loop failed", err));
    },
    stopGoalRun: () => {
      import("../services/agentOrchestrator").then(({ getActiveGoalRun, setActiveGoalRun }) => {
        const ctrl = getActiveGoalRun();
        ctrl?.abort.abort();
        setActiveGoalRun(null);
      });
      set({ goalPaused: false });
    },
    pauseGoalRun: () => {
      import("../services/agentOrchestrator").then(({ getActiveGoalRun }) => {
        const ctrl = getActiveGoalRun();
        if (ctrl) ctrl.paused.value = true;
      });
      set({ goalPaused: true });
    },
    resumeGoalRun: () => {
      import("../services/agentOrchestrator").then(({ getActiveGoalRun }) => {
        const ctrl = getActiveGoalRun();
        if (ctrl) ctrl.paused.value = false;
      });
      set({ goalPaused: false });
    },
    loadScheduledTasks: async () => {
      try {
        const list = await invoke<ScheduledTask[]>("list_scheduled_tasks");
        set({ scheduledTasks: list });
      } catch (err) {
        console.error("list_scheduled_tasks failed", err);
      }
    },
    createScheduledTask: async (opts) => {
      try {
        const task = await invoke<ScheduledTask>("create_scheduled_task", {
          name: opts.name,
          prompt: opts.prompt,
          model: null,
          agent: null,
          scope: "session",
          scheduleSel: opts.scheduleSel,
          cron: opts.cron ?? null,
          weekday: opts.weekday ?? null,
          time: opts.time ?? "09:00",
          timezone: null,
          disabled: false,
        });
        set((s) => ({ scheduledTasks: [task, ...s.scheduledTasks] }));
        return task;
      } catch (err) {
        console.error("create_scheduled_task failed", err);
        return null;
      }
    },
    patchScheduledTask: async (id, fields) => {
      try {
        const updated = await invoke<ScheduledTask>("patch_scheduled_task", { id, fields });
        set((s) => ({
          scheduledTasks: s.scheduledTasks.map((x) => (x.id === id ? updated : x)),
        }));
      } catch (err) {
        console.error("patch_scheduled_task failed", err);
      }
    },
    deleteScheduledTask: async (id) => {
      try {
        await invoke<void>("delete_scheduled_task", { id });
        set((s) => ({ scheduledTasks: s.scheduledTasks.filter((x) => x.id !== id) }));
      } catch (err) {
        console.error("delete_scheduled_task failed", err);
      }
    },
    checkDueTasks: async () => {
      try {
        const due = await invoke<ScheduledTask[]>("check_due_tasks");
        return due;
      } catch (err) {
        console.error("check_due_tasks failed", err);
        return [];
      }
    },
    runScheduledTask: async (task) => {
      // Wait-for-idle contract (AGENTIC_ORCHESTRATION_PLAN.md §5.3): never overlap two
      // runs on the same engine. If a goal or another scheduled run is active, skip this
      // task — the next 60s tick will retry it via check_due_tasks (next_run unchanged).
      const store = get();
      if (store.goalRunning || store.scheduledTaskRunning) return false;
      set({ scheduledTaskRunning: true });

      let sessionId: string | null = null;
      let status = "failed";
      try {
        // Scope the task to the currently-open vault when one is open (Memory-RAG context
        // inside the orchestrator resolves the vault root from the store).
        const created = await store.createAgentSession({
          title: task.name,
          agent: store.settings.assistantEngine === "opencode" ? "build" : null,
          engine: store.settings.assistantEngine,
        });
        if (!created) {
          console.error("runScheduledTask: session create failed");
          return false;
        }
        sessionId = created.id;

        // Emulate the manual goal-run control wiring so Stop/Pause in the panel applies.
        const abort = new AbortController();
        const pausedRef = { value: false };
        set({
          goalRunning: true,
          goalPaused: false,
          agentRun: {
            id: "",
            sessionId: created.id,
            goal: task.prompt,
            status: "running",
            iterations: 0,
            stuckStrikes: 0,
            tokenEstimate: 0,
            lastVerdict: null,
            startedAt: Date.now(),
            finishedAt: null,
          },
        });
        await import("../services/agentOrchestrator").then(({ setActiveGoalRun }) =>
          setActiveGoalRun({ abort, paused: pausedRef })
        );

        const finished = await runGoalLoopWithHandlers({
          sessionId: created.id,
          goal: task.prompt,
          engine: store.settings.assistantEngine,
          abort,
          pausedRef,
        });
        status = finished.status;
        await invoke("log_task_run", {
          taskId: task.id,
          sessionId: created.id,
          status: finished.status,
          summary: finished.lastVerdict?.reason ?? (finished.status === "done" ? "Goal completed." : null),
        });

        // Advance the schedule after a firing so recurring tasks get a fresh next_run
        // (compute_next_run runs from "now" in the backend). One-shot 'once' tasks are
        // turned off so they don't re-fire on later ticks.
        if (task.scheduleSel === "once") {
          await store.patchScheduledTask(task.id, { disabled: true });
        } else {
          await store.patchScheduledTask(task.id, {
            scheduleSel: task.scheduleSel,
            cron: task.cron ?? undefined,
            weekday: task.weekday ?? undefined,
            time: task.time,
          });
        }
        return true;
      } catch (err) {
        console.error("runScheduledTask failed", err);
        await invoke("log_task_run", {
          taskId: task.id,
          sessionId,
          status,
          summary: String(err),
        }).catch(() => {});
        return false;
      } finally {
        set({ scheduledTaskRunning: false, goalRunning: false, goalPaused: false });
        get().loadScheduledTasks();
      }
    },
    refreshGitStatus: async () => {
      const folderPath = get().currentFolderPath;
      if (!folderPath || !get().showWorkTreePanel) return;
      set({ gitStatusLoading: true, gitStatusError: null });
      try {
        const status = await invoke<GitRepoStatus>("git_status", { vaultRoot: folderPath });
        set({ gitStatus: status, gitStatusLoading: false });
      } catch (err) {
        set({ gitStatusLoading: false, gitStatusError: String(err) });
      }
    },
    openGitFile: async (entry) => {
      const status = get().gitStatus;
      if (!status) return;
      const abs = status.root.replace(/\\/g, "/") + "/" + entry.path;
      await get().openFile(abs);
    },
    openGitDiff: async (path, staged, panel) => {
      const targetPanel = panel || get().activePanel;
      const isLeft = targetPanel === "left";
      const tabs = isLeft ? get().leftTabs : get().rightTabs;
      const tabId = staged ? `${path}#diff-staged` : `${path}#diff`;

      await get().flushPendingSave(targetPanel);

      const existing = tabs.find((t) => t.id === tabId);
      if (existing) {
        if (isLeft) set({ activeLeftTabId: tabId }); else set({ activeRightTabId: tabId });
      } else {
        const filename = path.split(/[\\/]/).pop() ?? "file";
        const tab: Tab = {
          id: tabId,
          title: `${filename}${staged ? " (staged)" : ""}`,
          pinned: false,
          kind: "diff",
          diffStaged: staged,
        };
        if (isLeft) set({ leftTabs: [...tabs, tab], activeLeftTabId: tabId });
        else set({ rightTabs: [...tabs, tab], activeRightTabId: tabId });
      }

      if (isLeft) set({ leftDraft: "", leftSaveStatus: "saved" });
      else set({ rightDraft: "", rightSaveStatus: "saved" });

      set({ diffContents: { ...get().diffContents, [tabId]: "" } });
      try {
        const patch = await invoke<string | null>("git_diff_file", {
          vaultRoot: get().currentFolderPath || undefined,
          path,
          staged,
        });
        set({ diffContents: { ...get().diffContents, [tabId]: patch ?? "" } });
      } catch (err) {
        set({ diffContents: { ...get().diffContents, [tabId]: `// Failed to load diff: ${String(err)}` } });
      }
    },
    setAgentMessages: (msgs) => set({ agentMessages: msgs }),
    addAgentMessage: (msg) => set((s) => ({ agentMessages: [...s.agentMessages, msg] })),
    setAgentContext: (ctx) => set({ agentContext: ctx }),
    setAgentTask: (task) => set({ agentTask: task }),
    reorderPanels: (fromId, toId) => {
      const order = get().panelOrder;
      const fromIndex = order.indexOf(fromId);
      const toIndex = order.indexOf(toId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

      const nextOrder = [...order];
      nextOrder.splice(fromIndex, 1);
      nextOrder.splice(toIndex, 0, fromId);

      set({ panelOrder: nextOrder });
      localStorage.setItem("lsn_panel_order", JSON.stringify(nextOrder));
    },
// Settings
    setShowSettings: (show) => set({ showSettings: show }),
    updateSettings: (updated) => {
      const nextSettings = { ...get().settings, ...updated };
      set({ settings: nextSettings });
      localStorage.setItem("lsn_settings", JSON.stringify(nextSettings));

      if (updated.excludedFolders !== undefined) {
        setTimeout(() => get().refreshExplorer(), 0);
      }

      // Apply theme colors live
      const theme = getThemeById(nextSettings.theme).colors;
      const accent = nextSettings.accentColor || theme.accent;
      applyThemeToDocument({
        ...theme,
        accent,
        accentHover: nextSettings.accentColor || theme.accentHover,
      });
    },

    // MCP Connector actions
    addConnector: (c) => {
      const connector: McpConnector = { ...c, id: "conn-" + Date.now(), enabled: false, tools: [] };
      const { updateSettings } = get();
      updateSettings({ connectors: [...get().settings.connectors, connector] });
    },
    updateConnector: (id, patch) => {
      const connectors = get().settings.connectors.map((c) => (c.id === id ? { ...c, ...patch } : c));
      get().updateSettings({ connectors });
      if (patch.enabled === false) {
        // Tear the child process / http session down so a disabled connector never lingers.
        invoke("stop_connector", { id }).catch(() => {});
      }
    },
    removeConnector: (id) => {
      const connectors = get().settings.connectors.filter((c) => c.id !== id);
      get().updateSettings({ connectors });
    },

    // Project actions
    addProject: (id, name, path) => {
      const project: Project = { id, name, path, lastOpened: new Date().toISOString() };
      const exists = get().projects.some((p) => p.path === path || p.id === id);
      const projects = exists
        ? get().projects.map((p) => (p.path === path || p.id === id ? project : p))
        : [...get().projects, project];
      set({ projects });
      localStorage.setItem("lsn_projects", JSON.stringify(projects));
      set({ showProjectsPanel: false });
    },
    renameProject: (id, name) => {
      const projects = get().projects.map((p) => (p.id === id ? { ...p, name } : p));
      set({ projects });
      localStorage.setItem("lsn_projects", JSON.stringify(projects));
    },
    deleteProject: (id) => {
      const projects = get().projects.filter((p) => p.id !== id);
      set({ projects });
      localStorage.setItem("lsn_projects", JSON.stringify(projects));
    },
    toggleProjectPinned: (id) => {
      const projects = get().projects.map((p) =>
        p.id === id ? { ...p, pinned: !p.pinned } : p
      );
      set({ projects });
      localStorage.setItem("lsn_projects", JSON.stringify(projects));
    },
    openProject: async (id) => {
      const project = get().projects.find((p) => p.id === id);
      if (!project) return;
      await get().openFolder(project.path);
      const projects = get().projects.map((p) =>
        p.id === id ? { ...p, lastOpened: new Date().toISOString() } : p
      );
      set({ projects });
      localStorage.setItem("lsn_projects", JSON.stringify(projects));
      set({ showProjectsPanel: false, currentFolderPath: project.path });
    },
    setShowProjectsPanel: (show) => set({ showProjectsPanel: show }),

    isAssistantStreaming: false,
    assistantStatusText: "",
    assistantAbortController: null,
    availableModels: [],

    // OpenCode Agent runtime state — never persisted (no localStorage)
    opencodeInstalled: false,
    opencodeServerPid: null,
    opencodeServerPort: null,
    opencodeServerPassword: null,
    opencodeSessionId: null,
    opencodeStatus: "off",

    // Destructive file-tool approval gate
    pendingToolApprovals: [],

    addPendingToolApproval: (approval) =>
      set((s) => ({ pendingToolApprovals: [...s.pendingToolApprovals, approval] })),

    resolveToolApproval: (id, status) =>
      set((s) => ({
        pendingToolApprovals: s.pendingToolApprovals.map((p) =>
          p.id === id && p.status === "pending" ? { ...p, status } : p
        ),
      })),

    clearToolApproval: (id) =>
      set((s) => ({ pendingToolApprovals: s.pendingToolApprovals.filter((p) => p.id !== id) })),


    sendAssistantMessage: async (text: string) => {
      if (!text.trim()) return;
      const store = get();

      // Ensure a session exists so the thread has a durable home. Auto-creates a
      // persistent agent_session when the panel has never been given one.
      if (!store.activeAgentSessionId) {
        const created = await get().createAgentSession({
          title: store.assistantTopicTitle || `Session ${store.agentSessions.length + 1}`,
          engine: store.settings.assistantEngine,
        });
        if (!created) {
          set({ assistantStatusText: "" });
          return;
        }
      }

      const userMsg: AssistantMessage = {
        id: "msg-" + Date.now(),
        role: "user",
        content: text.trim(),
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      const updatedMessages = [...store.assistantMessages, userMsg];
      set({ assistantMessages: updatedMessages, isAssistantStreaming: true, assistantStatusText: "Thinking..." });

      if (!store.settings.aiEnabled) {
        const disabledMsg: AssistantMessage = {
          id: "msg-" + (Date.now() + 1),
          role: "assistant",
          content: "AI Study Assistant is currently disabled. You can enable it in **Settings -> AI & BYOK Model**.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        set({ assistantMessages: [...updatedMessages, disabledMsg], isAssistantStreaming: false, assistantStatusText: "" });
        return;
      }

      let contextPrefix = "";
      const activePath = store.activeLeftTabId || store.activeRightTabId;
      if (activePath && (text.includes("@") || text.includes("active"))) {
        const activeContent = store.activePanel === "left" ? store.leftDraft : store.rightDraft;
        const noteName = activePath.split(/[\\/]/).pop() || "Active Note";
        contextPrefix += `[Attached Context - Note: ${noteName}]\n${activeContent}\n\n`;
      }

      const scope = store.assistantTopicTitle || (store.currentFolderPath ? store.currentFolderPath.split(/[\\/]/).pop() || store.currentFolderPath : "global");

      const assistantMsgId = "msg-" + (Date.now() + 1);
      const assistantMsg: AssistantMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      set({ assistantMessages: [...updatedMessages, assistantMsg] });

      const controller = new AbortController();
      set({ assistantAbortController: controller });

      let finalText = "";
      let servedBy: "opencode" | "byok" = store.settings.assistantEngine;

      try {
        // ─── OpenCode engine path ──────────────────────────────────────────────
        if (store.settings.assistantEngine === "opencode") {
          try {
            const { streamOpencodeReply, reindexOpencodeVault, resolveOpencodeModel } = await import("../services/opencodeClient");
            await get().ensureOpencodeReady();
            const { opencodeSessionId, opencodeServerPassword, opencodeServerPort, settings, currentFolderPath } = get();
            if (!opencodeSessionId || !opencodeServerPassword) throw new Error("no opencode session");

            let payloadText = text;
            const hasPriorUserTurn = store.assistantMessages.filter((m) => m.role === "user" && m.id !== userMsg.id).length > 0;
            if (!hasPriorUserTurn && currentFolderPath) {
              try {
                const { fetchContextBundle, formatContextBundle } = await import("../services/agentKnowledge");
                const bundScope = currentFolderPath.split(/[\\/]/).pop() || "vault";
                const bundle = await fetchContextBundle({
                  vaultRoot: currentFolderPath,
                  scope: bundScope,
                  queryText: text,
                  limit: settings.ragTopK ?? 5,
                });
                if (bundle) {
                  payloadText = [
                    "## Workspace context (Memory-RAG bootstrap)",
                    formatContextBundle(bundle),
                    "Use this context to ground your work in the user's existing notes.",
                    "",
                    "---",
                    "",
                    text,
                  ].join("\n\n");
                }
              } catch {
                /* offline or embed-server down — send the plain message */
              }
            }

            finalText = await streamOpencodeReply({
              sessionId: opencodeSessionId,
              port: opencodeServerPort ?? settings.opencodePort,
              password: opencodeServerPassword,
              model: resolveOpencodeModel(settings),
              text: payloadText,
              signal: controller.signal,
              onChunk: (accumulatedText) => {
                set((state) => ({
                  assistantMessages: state.assistantMessages.map((m) =>
                    m.id === assistantMsgId ? { ...m, content: accumulatedText } : m
                  ),
                }));
              },
              onStatusChange: (status) => set({ assistantStatusText: status }),
              onToolCall: (tool, status) => set({ assistantStatusText: `🔧 ${tool} · ${status}` }),
              onFileEdit: () => {
                if (currentFolderPath) reindexOpencodeVault(currentFolderPath);
              },
            });
          } catch (opencodeErr) {
            const wasCancelled = opencodeErr instanceof DOMException && opencodeErr.name === "AbortError";
            if (wasCancelled) throw opencodeErr;
            if (store.settings.opencodeFallbackToByok) {
              servedBy = "byok";
            } else {
              throw opencodeErr;
            }
          }
        }

        // ─── BYOK engine path (direct API or fallback from OpenCode) ───────────
        if (servedBy === "byok") {
          const { buildPromptWithContext } = await import("../services/agentKnowledge");
          const { streamAIResponse } = await import("../services/aiProvider");
          const historyPayload = await buildPromptWithContext({
            messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
            settings: store.settings,
            scope,
            vaultRoot: store.currentFolderPath || undefined,
            queryText: text,
            attachment: contextPrefix || undefined,
          });
          finalText = await streamAIResponse({
            messages: historyPayload,
            settings: store.settings,
            onChunk: (accumulatedText) => {
              set((state) => ({
                assistantMessages: state.assistantMessages.map((m) =>
                  m.id === assistantMsgId ? { ...m, content: accumulatedText } : m
                ),
              }));
            },
            onStatusChange: (status) => set({ assistantStatusText: status }),
            signal: controller.signal,
          });
        }

        // ─── Post-processing: empty check, fallback notice, memory save ────────
        if (!finalText.trim()) {
          set((state) => ({
            assistantMessages: state.assistantMessages.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content:
                      "⚠️ The AI provider returned an empty response. This can happen when a safety/content filter blocks the output, or the model produced nothing for this prompt. Try rephrasing your message.",
                  }
                : m
            ),
          }));
        } else {
          const displayText =
            servedBy !== store.settings.assistantEngine
              ? `${finalText.trim()}\n\n---\n_Routed via BYOK fallback (OpenCode unavailable)._`
              : finalText;
          set((state) => ({
            assistantMessages: state.assistantMessages.map((m) =>
              m.id === assistantMsgId ? { ...m, content: displayText } : m
            ),
          }));
          if (store.settings.memoryAutoSave !== false) {
            const { persistConversationTurn } = await import("../services/agentKnowledge");
            persistConversationTurn({ userText: text, assistantText: finalText, scope }, store.settings).catch(() => {});
          }
        }
      } catch (err) {
        const wasCancelled = err instanceof DOMException && err.name === "AbortError";
        const isOpenCodePath = servedBy === "opencode";
        const fallbackMessage = isOpenCodePath
          ? `⚠️ OpenCode Agent error: ${String(err)}.\n\nConfirm the OpenCode CLI is installed (\`winget install SST.opencode\`) and close other OpenCode servers hogging the port in **Settings -> OpenCode Agent**.`
          : `⚠️ Unable to connect to AI server at \`${store.settings.aiBaseUrl}\` (${String(err)}).\n\nCheck your endpoint configuration in **Settings -> AI & BYOK Model**.`;
        set((state) => ({
          assistantMessages: state.assistantMessages.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: wasCancelled
                    ? m.content || "_Cancelled._"
                    : m.content || fallbackMessage,
                }
              : m
          ),
        }));
      } finally {
        set({ isAssistantStreaming: false, assistantStatusText: "", assistantAbortController: null });

        // Persist the thread: mirror into active agent_session.context + localStorage.
        const sessionId = get().activeAgentSessionId;
        if (sessionId) {
          const thread = get().assistantMessages;
          get()
            .patchAgentSession(sessionId, { context: serializeThread(thread) })
            .catch(() => {});
          if (typeof localStorage !== "undefined") {
            const mirror = readThreadMirror();
            mirror[sessionId] = thread;
            localStorage.setItem("lsn_assistant_threads", JSON.stringify(mirror));
            localStorage.setItem("lsn_active_thread_id", sessionId);
          }
        }
      }
    },
    cancelAssistantMessage: () => {
      get().assistantAbortController?.abort();
    },
    clearAssistantMessages: () => { set({ assistantMessages: [] }); get().resetOpencodeSession(); },
    setAssistantWidth: (w) => set({ assistantWidth: w }),
    toggleAssistantPanel: () => set((s) => ({ showAssistantPanel: !s.showAssistantPanel })),
    setSelectedModel: (m) => set({ selectedModel: m }),
    setAssistantTopicTitle: (t) => set({ assistantTopicTitle: t }),
    setFilterQuery: (q) => set({ filterQuery: q }),

    fetchAndSetAvailableModels: async () => {
      const { settings } = get();
      const baseUrl = (settings.aiBaseUrl || "").replace(/\/+$/, "");
      if (!baseUrl) return;
      const models = await fetchAvailableModels(baseUrl, settings.aiApiKey || "");
      if (models.length > 0) {
        set({ availableModels: models });
      }
    },

    // ---------------------------------------------------------------------------
    // OpenCode Agent actions
    // ---------------------------------------------------------------------------

    checkOpencodeInstalled: async () => {
      try {
        const installed = await invoke<boolean>("check_opencode_installed");
        set({ opencodeInstalled: installed });
      } catch {
        set({ opencodeInstalled: false });
      }
    },

    resetOpencodeSession: () => set({ opencodeSessionId: null }),

    startOpencodeServer: async () => {
      const { settings, currentFolderPath, opencodeServerPid } = get();
      if (opencodeServerPid !== null) return; // already running
      set({ opencodeStatus: "starting", opencodeSessionId: null });

      const workspace = currentFolderPath || ".";
      // Generate a per-session random password (never persisted to disk).
      const password = Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Build BYOK credential env-var map with correct OpenCode variable names.
      // (spec §"Corrected: Secrets Handling" — note GOOGLE_GENERATIVE_AI_API_KEY,
      // NOT GEMINI_API_KEY, per OpenCode's own documented env var name for Gemini)
      const providerEnv: Record<string, string> = {};
      if (settings.aiApiKey?.trim()) {
        if (settings.aiProvider === "openai") {
          providerEnv["OPENAI_API_KEY"] = settings.aiApiKey.trim();
        } else if (settings.aiProvider === "anthropic") {
          providerEnv["ANTHROPIC_API_KEY"] = settings.aiApiKey.trim();
        } else if (settings.aiProvider === "gemini") {
          providerEnv["GOOGLE_GENERATIVE_AI_API_KEY"] = settings.aiApiKey.trim();
        } else if (settings.aiProvider === "openrouter") {
          providerEnv["OPENROUTER_API_KEY"] = settings.aiApiKey.trim();
        }
        // ollama_hermes / custom: no API key env var needed
      }

      try {
        const { config: mcpOverride, env: mcpEnv } = buildOpencodeMcpExport(
          get().settings.connectors ?? [],
        );
        const { pid, port } = await invoke<{ pid: number; port: number }>("spawn_opencode_server", {
          port: settings.opencodePort,
          workspacePath: workspace,
          serverPassword: password,
          providerEnv,
          mcpOverride,
          mcpEnv,
        });
        set({ opencodeServerPid: pid, opencodeServerPort: port, opencodeServerPassword: password });
      } catch (err) {
        console.error("[OpenCode] Failed to start server:", err);
      }
    },

    stopOpencodeServer: async () => {
      const { opencodeServerPid } = get();
      if (opencodeServerPid === null) return;
      try {
        await invoke("kill_opencode_server", { pid: opencodeServerPid });
      } catch (err) {
        console.error("[OpenCode] Failed to stop server:", err);
      } finally {
        set({ opencodeServerPid: null, opencodeServerPort: null, opencodeServerPassword: null, opencodeSessionId: null, opencodeStatus: "off" });
      }
    },

    ensureOpencodeReady: async () => {
      const { settings, opencodeInstalled, opencodeServerPid, opencodeSessionId, currentFolderPath } = get();
      if (!opencodeInstalled) {
        await get().checkOpencodeInstalled();
        if (!get().opencodeInstalled) {
          set({ opencodeStatus: "error" });
          throw new Error("OpenCode is not installed.");
        }
      }
      if (opencodeServerPid === null) {
        set({ opencodeStatus: "starting" });
        await get().startOpencodeServer();
        if (get().opencodeServerPid === null) {
          set({ opencodeStatus: "error" });
          throw new Error("Failed to start the OpenCode server.");
        }
      }
      if (opencodeSessionId) { set({ opencodeStatus: "ready" }); return; }
      const { opencodeServerPassword, opencodeServerPort } = get();
      const baseUrl = `http://localhost:${opencodeServerPort ?? settings.opencodePort}`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (opencodeServerPassword) headers["Authorization"] = `Basic ${btoa(`opencode:${opencodeServerPassword}`)}`;
      for (let i = 0; i < 20; i++) {
        try {
          const res = await fetch(`${baseUrl}/session`, {
            method: "POST",
            headers,
            body: JSON.stringify({ workspaceDir: currentFolderPath || "." }),
          });
          if (res.ok) {
            const data = await res.json();
            set({ opencodeSessionId: data.id ?? data.sessionID ?? null, opencodeStatus: "ready" });
            return;
          }
        } catch { /* retry */ }
        await new Promise((r) => setTimeout(r, 500));
      }
      set({ opencodeStatus: "error" });
      throw new Error("OpenCode server is not responding.");
    },

    // Google Drive backup (BACKUP-0)
    refreshGoogleAccount: async () => {
      try {
        const acct = await invoke<GoogleAccount | null>("google_account");
        set({ googleAccount: acct });
      } catch (err) {
        console.warn("Failed to check Google Drive account:", err);
      }
    },

    connectGoogle: async () => {
      set({ backupSigningIn: true });
      try {
        const acct = await invoke<GoogleAccount>("google_sign_in");
        set({ googleAccount: acct, backupSigningIn: false });
      } catch (err) {
        set({ backupSigningIn: false });
        throw err;
      }
    },

    signOutGoogle: async () => {
      try {
        await invoke("google_sign_out");
      } catch (err) {
        console.warn("Google sign-out failed:", err);
      } finally {
        set({ googleAccount: null });
      }
    },

    // Session Actions
    createSession: (title) => {
      const id = "sess-" + Date.now();
      const newTitle = title || `New session - ${new Date().toISOString().slice(0, 16)}`;
      const sessions = get().sessions.map((s) => ({ ...s, active: false }));
      sessions.push({ id, title: newTitle, active: true, openTabs: [] });
      set({ sessions, activeSessionId: id });
      localStorage.setItem("lsn_sessions", JSON.stringify(sessions));
    },
    closeSession: (id) => {
      const current = get().sessions;
      if (current.length <= 1) return;
      const filtered = current.filter((s) => s.id !== id);
      let activeId = get().activeSessionId;
      if (activeId === id) {
        activeId = filtered[filtered.length - 1].id;
      }
      const updated = filtered.map((s) => ({ ...s, active: s.id === activeId }));
      set({ sessions: updated, activeSessionId: activeId });
      localStorage.setItem("lsn_sessions", JSON.stringify(updated));
    },
    selectSession: (id) => {
      const updated = get().sessions.map((s) => ({ ...s, active: s.id === id }));
      set({ sessions: updated, activeSessionId: id });
      localStorage.setItem("lsn_sessions", JSON.stringify(updated));
    },
    setShowSearchModal: (show) => set({ showSearchModal: show }),
    setTopbarViewMode: (mode) => set({ topbarViewMode: mode }),

    // Launcher & Panel Arrangement Actions (Iteration 3)
    setShowLauncherModal: (show) => set({ showLauncherModal: show }),
    setShowPanelLayoutModal: (show) => set({ showPanelLayoutModal: show }),

    // Onboarding
    completeOnboarding: () => {
      set({ onboardingComplete: true });
      localStorage.setItem("lsn_onboarding_complete", "true");
    },

    applyPanelPreset: (preset) => {
      set({ panelPreset: preset });
      if (preset === "default") {
        set({ showAssistantPanel: true, showSourcesPanel: true, showArtifactsPanel: false, showAgentPanel: false, showWorkTreePanel: false, assistantWidth: 360, sourcePanelWidth: 200, splitActive: false });
      } else if (preset === "focus") {
        set({ showAssistantPanel: false, showSourcesPanel: false, showArtifactsPanel: false, showAgentPanel: false, showWorkTreePanel: false, splitActive: false });
      } else if (preset === "assistant") {
        set({ showAssistantPanel: true, showSourcesPanel: false, showArtifactsPanel: false, showAgentPanel: false, showWorkTreePanel: false, assistantWidth: 420, splitActive: false });
      } else if (preset === "explorer") {
        set({ showAssistantPanel: false, showSourcesPanel: true, showArtifactsPanel: false, showAgentPanel: false, showWorkTreePanel: false, sourcePanelWidth: 240, splitActive: false });
      }
    },

    saveCustomLayout: (name) => {
      const layout: CustomLayout = {
        id: "layout-" + Date.now(),
        name,
        panelOrder: get().panelOrder,
        showAssistantPanel: get().showAssistantPanel,
        showSourcesPanel: get().showSourcesPanel,
        showArtifactsPanel: get().showArtifactsPanel,
        showAgentPanel: get().showAgentPanel,
        assistantWidth: get().assistantWidth,
        sourcePanelWidth: get().sourcePanelWidth,
        artifactsWidth: get().artifactsWidth,
        agentWidth: get().agentWidth,
        splitActive: get().splitActive,
        showWorkTreePanel: get().showWorkTreePanel,
        workTreeWidth: get().workTreeWidth,
      };
      const customLayouts = [...get().customLayouts, layout];
      set({ customLayouts, panelPreset: "custom" });
      localStorage.setItem("lsn_custom_layouts", JSON.stringify(customLayouts));
    },

    applyCustomLayout: (id) => {
      const layout = get().customLayouts.find((l) => l.id === id);
      if (!layout) return;
      set({
        panelOrder: layout.panelOrder,
        showAssistantPanel: layout.showAssistantPanel,
        showSourcesPanel: layout.showSourcesPanel,
        showArtifactsPanel: layout.showArtifactsPanel,
        showAgentPanel: layout.showAgentPanel,
        assistantWidth: layout.assistantWidth,
        sourcePanelWidth: layout.sourcePanelWidth,
        artifactsWidth: layout.artifactsWidth,
        agentWidth: layout.agentWidth,
        splitActive: layout.splitActive,
        showWorkTreePanel: layout.showWorkTreePanel ?? false,
        workTreeWidth: layout.workTreeWidth ?? 320,
        panelPreset: "custom",
      });
      localStorage.setItem("lsn_panel_order", JSON.stringify(layout.panelOrder));
    },

    deleteCustomLayout: (id) => {
      const customLayouts = get().customLayouts.filter((l) => l.id !== id);
      set({ customLayouts });
      localStorage.setItem("lsn_custom_layouts", JSON.stringify(customLayouts));
    },

    scaffoldWorkspaceTemplate: async (folderPath: string, templateId?: string) => {
      try {
        await applyProjectTemplate(folderPath, templateId || "standard-study");
        await get().openFolder(folderPath);
        const welcomePath = `${folderPath}/Welcome.md`;
        await get().openFile(welcomePath);
      } catch (err) {
        console.error("Failed to scaffold workspace template:", err);
      }
    },
  };
});
