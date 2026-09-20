import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore, CONNECTOR_PRESETS } from "../stores/useStore";
import type { McpConnector, ConnectorKind } from "../types";
import { THEMES } from "../themes";
import { check as checkForUpdate, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { testAIConnection } from "../services/aiProvider";
import { getProviderPreset } from "../services/providerPresets";
import {
  addStudyTool,
  deleteStudyTool,
  getStudyTools,
  setStudyToolEnabled,
} from "../services/studyTools";
import type { StudyTool } from "../services/studyTools";

type SettingSection = "general" | "appearance" | "editor" | "files" | "project" | "backup" | "ai_byok" | "agent_models" | "connectors" | "tasks" | "study_tools" | "about";
type UpdateStatus = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "error";

/** Shows the local debug log's file path once "Verbose AI tool logging" is enabled. */
function VerboseLogPathHint() {
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    invoke<string>("get_ai_debug_log_path").then(setPath).catch(() => setPath(null));
  }, []);
  if (!path) return null;
  return (
    <p className="text-[10px] text-muted py-1 select-text break-all">
      Log file: <span className="text-white/80">{path}</span>
    </p>
  );
}

export default function SettingsModal() {
  const showSettings = useStore((s) => s.showSettings);
  const setShowSettings = useStore((s) => s.setShowSettings);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const availableModels = useStore((s) => s.availableModels);
  const fetchAndSetAvailableModels = useStore((s) => s.fetchAndSetAvailableModels);

  const [activeSection, setActiveSection] = useState<SettingSection>("general");
  const [showApiKey, setShowApiKey] = useState(false);
  const [testConnectionStatus, setTestConnectionStatus] = useState<string | null>(null);
  const [fetchModelsStatus, setFetchModelsStatus] = useState<"idle" | "fetching" | "done" | "empty">("idle");
  const [reindexStatus, setReindexStatus] = useState<string | null>(null);
  const currentFolderPath = useStore((s) => s.currentFolderPath);
  const opencodeInstalled = useStore((s) => s.opencodeInstalled);
  const opencodeBinaryVersion = useStore((s) => s.opencodeBinaryVersion);
  const opencodeStatus = useStore((s) => s.opencodeStatus);
  const opencodeServerPort = useStore((s) => s.opencodeServerPort);
  const opencodeServerPid = useStore((s) => s.opencodeServerPid);
  const startOpencodeServerAct = useStore((s) => s.startOpencodeServer);
  const restartOpencodeServer = useStore((s) => s.restartOpencodeServer);
  const [opencodeRestartMsg, setOpencodeRestartMsg] = useState<string | null>(null);

  // ── Scheduled Tasks (Phase 3) ──────────────────────────────────────
  const scheduledTasks = useStore((s) => s.scheduledTasks);
  const createScheduledTask = useStore((s) => s.createScheduledTask);
  const patchScheduledTask = useStore((s) => s.patchScheduledTask);
  const deleteScheduledTask = useStore((s) => s.deleteScheduledTask);
  const scheduledTaskRunning = useStore((s) => s.scheduledTaskRunning);
  const [taskName, setTaskName] = useState("");
  const [taskPrompt, setTaskPrompt] = useState("");
  const [taskSchedule, setTaskSchedule] = useState<"once" | "daily" | "weekly" | "cron">("daily");
  const [taskTime, setTaskTime] = useState("09:00");
  const [taskWeekday, setTaskWeekday] = useState("0");
  const [taskCron, setTaskCron] = useState("");
  const [taskFormError, setTaskFormError] = useState<string | null>(null);

  const [studyTools, setStudyTools] = useState<StudyTool[]>(() => getStudyTools());
  const [newToolName, setNewToolName] = useState("");
  const [newToolDesc, setNewToolDesc] = useState("");
  const [studyToolError, setStudyToolError] = useState<string | null>(null);

  useEffect(() => {
    if (showSettings) {
      useStore.getState().loadScheduledTasks();
      setStudyTools(getStudyTools());
    }
  }, [showSettings]);

  const handleCreateTask = async () => {
    if (!taskName.trim() || !taskPrompt.trim()) {
      setTaskFormError("Name and prompt are required.");
      return;
    }
    setTaskFormError(null);
    await createScheduledTask({
      name: taskName.trim(),
      prompt: taskPrompt.trim(),
      scheduleSel: taskSchedule,
      time: taskTime,
      weekday: taskSchedule === "weekly" ? taskWeekday : undefined,
      cron: taskSchedule === "cron" ? taskCron : undefined,
    });
    setTaskName("");
    setTaskPrompt("");
  };

  const scheduleLabel = (t: { scheduleSel: string; time: string; weekday: string | null; cron: string | null }) => {
    switch (t.scheduleSel) {
      case "once":
        return `Once at ${t.time}`;
      case "daily":
        return `Daily at ${t.time}`;
      case "weekly":
        return `Weekly ${(t.weekday || "0").split(",").map(dayName).filter(Boolean).join(",")} at ${t.time}`;
      case "cron":
        return `Cron: ${t.cron || "(none)"}`;
      default:
        return t.scheduleSel;
    }
  };

  const dayName = (d: string) => {
    const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const n = parseInt(d, 10);
    return Number.isNaN(n) ? "" : names[((n % 7) + 7) % 7];
  };

  const formatRunTime = (ms: number | null) => {
    if (ms == null) return "never";
    return new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };


  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const googleAccount = useStore((s) => s.googleAccount);
  const backupSigningIn = useStore((s) => s.backupSigningIn);
  const connectGoogle = useStore((s) => s.connectGoogle);
  const signOutGoogle = useStore((s) => s.signOutGoogle);
  const [backupError, setBackupError] = useState<string | null>(null);

  // ── MCP Connectors ────────────────────────────────────────────
  const connectors = useStore((s) => s.settings.connectors);
  const addConnector = useStore((s) => s.addConnector);
  const updateConnector = useStore((s) => s.updateConnector);
  const removeConnector = useStore((s) => s.removeConnector);

  const [online, setOnline] = useState(() => typeof navigator !== "undefined" && navigator.onLine);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<McpConnector | null>(null);
  const [testStatus, setTestStatus] = useState<Record<string, string>>({});
  const [addMode, setAddMode] = useState<"closed" | "menu" | "custom">("closed");
  const [headersText, setHeadersText] = useState("");

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const connectorConfig = (c: McpConnector) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    command: c.command,
    args: c.args,
    cwd: c.cwd,
    url: c.url,
    headers: c.headers,
    env: c.env,
    tools: c.tools,
  });

  const handleTestConnector = async (c: McpConnector) => {
    setTestStatus((s) => ({ ...s, [c.id]: "Testing…" }));
    try {
      const health = await invoke<{ ok: boolean; tool_count: number; error: string | null }>(
        "test_connector",
        { config: connectorConfig(c) }
      );
      setTestStatus((s) => ({
        ...s,
        [c.id]: health.ok ? `✓ ${health.tool_count} tools available` : `✗ ${health.error ?? "failed"}`,
      }));
    } catch (err) {
      setTestStatus((s) => ({ ...s, [c.id]: `✗ ${String(err)}` }));
    }
  };

  const startEditor = (c: McpConnector) => {
    setDraft({ ...c });
    setHeadersText(Object.entries(c.headers ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n"));
    setExpandedId(c.id);
  };

  const startCustomAdd = () => {
    setDraft({
      id: "",
      name: "",
      kind: "stdio",
      command: "",
      args: [],
      cwd: "",
      url: "",
      headers: {},
      env: {},
      enabled: false,
      tools: [],
    });
    setHeadersText("");
    setExpandedId("__new__");
    setAddMode("closed");
  };

  const closeEditor = () => {
    setExpandedId(null);
    setDraft(null);
  };

  const saveDraft = () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return;
    if (draft.kind === "stdio" && !draft.command?.trim()) return;
    if (draft.kind === "http" && !draft.url?.trim()) return;

    let parsedHeaders: Record<string, string> = {};
    for (const line of headersText.split("\n")) {
      const idx = line.indexOf(":");
      if (idx > 0) parsedHeaders[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }

    const cleanedFields = {
      name,
      kind: draft.kind,
      command: draft.kind === "stdio" ? draft.command?.trim() : undefined,
      args: draft.kind === "stdio" ? draft.args?.filter((a) => a.trim()) ?? [] : undefined,
      cwd: draft.kind === "stdio" ? draft.cwd?.trim() || undefined : undefined,
      url: draft.kind === "http" ? draft.url?.trim() : undefined,
      headers: parsedHeaders,
      env: draft.env ?? {},
    };

    if (expandedId === "__new__") {
      addConnector(cleanedFields);
    } else if (expandedId) {
      updateConnector(expandedId, cleanedFields);
    }
    closeEditor();
  };

  const availablePresets = CONNECTOR_PRESETS.filter(
    (p) => !connectors.some((c) => c.name === p.name)
  );

  const handleCheckForUpdates = async () => {
    setUpdateStatus("checking");
    setUpdateError(null);
    try {
      const update = await checkForUpdate();
      if (update?.available) {
        setPendingUpdate(update);
        setUpdateStatus("available");
      } else {
        setPendingUpdate(null);
        setUpdateStatus("up-to-date");
      }
    } catch (err) {
      setUpdateError(String(err));
      setUpdateStatus("error");
    }
  };

  const handleTestConnection = async () => {
    setTestConnectionStatus("testing");
    const result = await testAIConnection(
      settings.aiBaseUrl || "http://localhost:11434/v1",
      settings.aiApiKey,
      settings.aiModelName
    );
    if (result.ok) {
      setTestConnectionStatus("success");
      // Auto-fetch models on a successful connection for Gemini / OpenRouter
      if (settings.aiProvider === "gemini" || settings.aiProvider === "openrouter" || settings.aiProvider === "opencode_zen") {
        await fetchAndSetAvailableModels();
      }
    } else {
      setTestConnectionStatus(result.message);
    }
  };

  const handleFetchModels = async () => {
    setFetchModelsStatus("fetching");
    await fetchAndSetAvailableModels();
    const models = useStore.getState().availableModels;
    setFetchModelsStatus(models.length > 0 ? "done" : "empty");
  };


  const handleInstallUpdate = async () => {
    if (!pendingUpdate) return;
    setUpdateStatus("downloading");
    setUpdateError(null);
    try {
      await pendingUpdate.downloadAndInstall();
      await relaunch();
    } catch (err) {
      setUpdateError(String(err));
      setUpdateStatus("error");
    }
  };

  const handleConnectGoogle = async () => {
    setBackupError(null);
    try {
      await connectGoogle();
    } catch (err) {
      setBackupError(String(err));
    }
  };

  if (!showSettings) return null;

  const sections: { id: SettingSection; label: string }[] = [
    { id: "general", label: "General" },
    { id: "appearance", label: "Appearance" },
    { id: "editor", label: "Editor" },
    { id: "files", label: "Files & Links" },
    { id: "project", label: "Project" },
    { id: "backup", label: "Backup & Drive" },
    { id: "ai_byok", label: "AI & BYOK Model" },
    { id: "agent_models", label: "Agent Models & Display" },
    { id: "connectors", label: "Connectors & Research" },
    { id: "tasks", label: "Scheduled Tasks" },
    { id: "study_tools", label: "Study Tools" },
    { id: "about", label: "About" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      {/* Modal Container: exactly 800x600 */}
      <div className="relative flex w-[820px] h-[620px] overflow-hidden rounded-md border border-border bg-card text-text shadow-2xl animate-in fade-in zoom-in duration-200">

        {/* Close Button */}
        <button
          onClick={() => setShowSettings(false)}
          className="absolute top-4 right-4 z-10 rounded p-1 text-muted hover:bg-bg hover:text-text cursor-pointer transition-colors"
          title="Close Settings"
        >
          <svg className="w-5 h-5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Sidebar Nav */}
        <div className="w-48 shrink-0 border-r border-border bg-bg/50 p-4 pt-12 flex flex-col gap-1">
          <h2 className="px-3 mb-4 text-xs font-semibold uppercase tracking-wider text-muted">Settings</h2>
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-2 rounded px-3 py-2 text-left text-xs font-medium cursor-pointer transition-colors ${
                activeSection === s.id ? "bg-accent text-white" : "text-muted hover:bg-card hover:text-text"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Contents Area */}
        <div className="flex-1 overflow-y-auto p-8 pt-12">
          {activeSection === "general" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">General Settings</h3>
                <p className="text-xs text-muted">Core workspace behavior preferences.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Default Startup Folder Path</label>
                <input
                  type="text"
                  value={settings.startupFolder}
                  onChange={(e) => updateSettings({ startupFolder: e.target.value })}
                  placeholder="e.g. C:/Users/Documents/Vault"
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent"
                />
                <span className="text-[10px] text-muted">Folder path to automatically load upon application initialization.</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Confirm before deleting files</label>
                <div className="flex items-center justify-between py-1">
                  <span className="text-[10px] text-muted">Ask for confirmation before permanently deleting an entry.</span>
                  <input
                    type="checkbox"
                    checked={settings.confirmBeforeDelete}
                    onChange={(e) => updateSettings({ confirmBeforeDelete: e.target.checked })}
                    className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {activeSection === "appearance" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">Appearance Settings</h3>
                <p className="text-xs text-muted">Configure themes and visual preferences. Applied live.</p>
              </div>

              {/* Dark theme preset grid */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Color Theme (Presets)</label>
                <div className="grid grid-cols-2 gap-2">
                  {THEMES.map((t) => {
                    const active = settings.theme === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => updateSettings({ theme: t.id })}
                        className={`flex items-center gap-2 rounded border p-2 text-left transition-colors cursor-pointer ${
                          active ? "border-accent bg-accent/10" : "border-border hover:border-accent/50"
                        }`}
                      >
                        {/* Mini swatch */}
                        <span className="flex h-8 w-8 shrink-0 flex-col overflow-hidden rounded border border-border"
                          style={{ background: t.colors.bg }}>
                          <span className="h-2" style={{ background: t.colors.accent }} />
                          <span className="flex-1" style={{ background: t.colors.card }} />
                          <span className="h-1.5" style={{ background: t.colors.text }} />
                        </span>
                        <span className="min-w-0">
                          <span className={`block text-xs font-medium ${active ? "text-accent" : "text-text"}`}>{t.name}</span>
                          <span className="block truncate text-[10px] text-muted">{t.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Accent color */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Accent Color (Optional Override)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.accentColor || "#3b82f6"}
                    onChange={(e) => updateSettings({ accentColor: e.target.value })}
                    className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
                  />
                  <button
                    onClick={() => updateSettings({ accentColor: "" })}
                    className="rounded border border-border px-2 py-1 text-[10px] text-muted hover:bg-bg hover:text-white cursor-pointer"
                  >
                    Reset to theme
                  </button>
                </div>
              </div>

              {/* Font Size */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Editor Font Size: {settings.fontSize}px</label>
                <input
                  type="range"
                  min="12"
                  max="24"
                  step="1"
                  value={settings.fontSize}
                  onChange={(e) => updateSettings({ fontSize: parseInt(e.target.value) })}
                  className="w-full h-1 bg-border rounded-lg appearance-none cursor-pointer accent-accent"
                />
              </div>

              {/* Corner Roundness */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Panel Corner Roundness</label>
                <select
                  value={settings.cornerRoundness}
                  onChange={(e) => updateSettings({ cornerRoundness: e.target.value as any })}
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent cursor-pointer"
                >
                  <option value="none">Sharp Corners (Obsidian-Style)</option>
                  <option value="sm">Small (2px)</option>
                  <option value="md">Medium (6px)</option>
                  <option value="lg">Large (12px)</option>
                </select>
              </div>

              {/* Reduce motion */}
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium">Reduce Motion</label>
                  <span className="text-[10px] text-muted">Minimize animations throughout the interface.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.reduceMotion}
                  onChange={(e) => updateSettings({ reduceMotion: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                />
              </div>
            </div>
          )}

          {activeSection === "editor" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">Editor Settings</h3>
                <p className="text-xs text-muted">Customize the markdown editing environment.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Font Family</label>
                <select
                  value={settings.fontFamily}
                  onChange={(e) => updateSettings({ fontFamily: e.target.value })}
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent cursor-pointer"
                >
                  <option value="system">System UI</option>
                  <option value="mono">Monospace</option>
                  <option value="serif">Serif</option>
                </select>
              </div>

              {/* Line Wrap */}
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium">Editor Line Wrapping</label>
                  <span className="text-[10px] text-muted">Wrap long lines to fit page bounds.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.lineWrap}
                  onChange={(e) => updateSettings({ lineWrap: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                />
              </div>

              {/* Tab Size */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Indent Tab Size</label>
                <select
                  value={settings.tabSize}
                  onChange={(e) => updateSettings({ tabSize: parseInt(e.target.value) })}
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent cursor-pointer"
                >
                  <option value="2">2 Spaces</option>
                  <option value="4">4 Spaces</option>
                  <option value="8">8 Spaces</option>
                </select>
              </div>

              {/* Show line numbers */}
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium">Show Line Numbers</label>
                  <span className="text-[10px] text-muted">Display gutter line numbers in the editor.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showLineNumbers}
                  onChange={(e) => updateSettings({ showLineNumbers: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                />
              </div>

              {/* Auto-pair brackets */}
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium">Auto-pair Brackets</label>
                  <span className="text-[10px] text-muted">Automatically close (), [], and {} while typing.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoPairBrackets}
                  onChange={(e) => updateSettings({ autoPairBrackets: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                />
              </div>

              {/* Word count */}
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium">Show Word Count</label>
                  <span className="text-[10px] text-muted">Display character/word count in the status bar.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showWordCount}
                  onChange={(e) => updateSettings({ showWordCount: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                />
              </div>

              {/* Live Preview Timeout */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Live Preview Idle Delay: {settings.livePreviewTimeout}ms</label>
                <input
                  type="range"
                  min="500"
                  max="3000"
                  step="100"
                  value={settings.livePreviewTimeout}
                  onChange={(e) => updateSettings({ livePreviewTimeout: parseInt(e.target.value) })}
                  className="w-full h-1 bg-border rounded-lg appearance-none cursor-pointer accent-accent"
                />
                <span className="text-[10px] text-muted">Time idle in edit mode before automatically formatting preview content.</span>
              </div>
            </div>
          )}

          {activeSection === "files" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">Files & Links Settings</h3>
                <p className="text-xs text-muted">Control default file configurations and filter views.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Default Location for New Notes</label>
                <input
                  type="text"
                  value={settings.newNoteLocation}
                  onChange={(e) => updateSettings({ newNoteLocation: e.target.value })}
                  placeholder="e.g. /notes"
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent"
                />
                <span className="text-[10px] text-muted">Sub-folder inside opened workspace where new notes are created.</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Attachments Folder</label>
                <input
                  type="text"
                  value={settings.attachmentsFolder}
                  onChange={(e) => updateSettings({ attachmentsFolder: e.target.value })}
                  placeholder="e.g. _attachments"
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent"
                />
                <span className="text-[10px] text-muted">Default folder for pasted/dropped attachments.</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Exclude Folders (comma-separated)</label>
                <input
                  type="text"
                  value={settings.excludedFolders}
                  onChange={(e) => updateSettings({ excludedFolders: e.target.value })}
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent"
                />
                <span className="text-[10px] text-muted">Directories that should be hidden from explorer lists (e.g. node_modules).</span>
              </div>
            </div>
          )}

          {activeSection === "project" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">Project Management</h3>
                <p className="text-xs text-muted">Control how projects and vaults behave.</p>
              </div>

              <div className="rounded-md border border-border bg-bg/40 p-4">
                <h4 className="text-xs font-semibold text-text mb-2">Quick Actions</h4>
                <p className="text-[10px] text-muted mb-3">
                  Use the folders icon in the left navigation bar to open the Projects dialog. There you can add a
                  folder as a project, rename, pin, or delete projects. Switching projects opens the vault instantly.
                </p>
                <p className="text-[10px] text-muted">
                  Project data (name, path, last opened) is stored locally on this device.
                </p>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium">Reopen last project on launch</label>
                  <span className="text-[10px] text-muted">Remember and reopen the most recent vault automatically.</span>
                </div>
                <input
                  type="checkbox"
                  checked={!!settings.startupFolder}
                  onChange={(e) => updateSettings({})}
                  disabled
                  className="w-4 h-4 rounded border-border bg-bg/50 cursor-not-allowed"
                />
              </div>
            </div>
          )}

          {activeSection === "backup" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">Google Drive Backup</h3>
                <p className="text-xs text-muted">
                  Connect a Google account to back up your vault notes to your own Google Drive.
                </p>
              </div>

              {!googleAccount ? (
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={handleConnectGoogle}
                    disabled={backupSigningIn}
                    className="flex items-center gap-2.5 rounded border border-border bg-bg/60 px-3 py-2.5 text-xs font-medium text-white hover:bg-card cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-wait"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
                      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 35.5 44 38 44 24c0-1.3-.1-2.6-.4-3.9z"/>
                    </svg>
                    {backupSigningIn ? "Waiting for Google sign-in in your browser…" : "Connect Google Drive"}
                  </button>
                  <span className="text-[10px] text-muted">
                    {backupSigningIn
                      ? "A browser window has opened. Complete the consent screen there and return here."
                      : "Sign in with Google to choose which folders to back up to your Drive."}
                  </span>
                  {backupError && <span className="text-[11px] text-red-400">Sign-in failed: {backupError}</span>}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div className="rounded-md border border-border bg-bg/40 p-3 flex items-center gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-accent text-sm font-semibold text-white uppercase"
                    >
                      {googleAccount.email.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-white">{googleAccount.name}</p>
                      <p className="truncate text-[11px] text-muted">{googleAccount.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => signOutGoogle()}
                      className="ml-auto shrink-0 rounded border border-border bg-bg/60 px-2.5 py-1 text-[11px] font-medium text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                  <span className="text-[10px] text-muted">
                    Connected. Vault selection and the "Backup now" button arrive in the next milestone.
                  </span>
                </div>
              )}
            </div>
          )}

          {activeSection === "ai_byok" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">AI & BYOK Model Server</h3>
                <p className="text-xs text-muted">
                  BYOK powers the assistant directly or acts as the automatic fallback when the OpenCode engine is unavailable.
                </p>
              </div>

              {/* Architecture Plan Banner */}
              <div className="rounded-md border border-accent/40 bg-accent/10 p-3.5 flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-accent">BYOK & Hermes Architecture Plan</span>
                    <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[9px] font-bold text-accent uppercase">Architected</span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    Local plan document saved to <code className="text-text font-mono bg-bg/60 px-1 py-0.5 rounded">BYOK_HERMES_PLAN.md</code>. Integrates Hermes 3 function calling, local SQLite knowledge graph RAG, and multi-provider keys.
                  </p>
                </div>
              </div>

              {/* Enable AI Assistant Toggle */}
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium text-white">Enable AI Study Assistant</label>
                  <span className="text-[10px] text-muted">Toggle AI chat, note context attachments, and workspace reasoning.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.aiEnabled}
                  onChange={(e) => updateSettings({ aiEnabled: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                />
              </div>

              {/* Primary Engine Selection */}
              <div className="flex flex-col gap-2 border-b border-border/40 pb-4">
                <label className="text-xs font-medium text-text">Primary Assistant Engine</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateSettings({ assistantEngine: "opencode" })}
                    className={`flex-1 rounded border px-3 py-2 text-xs font-medium cursor-pointer transition-colors ${
                      settings.assistantEngine === "opencode"
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-border bg-bg/50 text-text hover:border-accent/50"
                    }`}
                  >
                    🤖 OpenCode
                    <span className="block text-[10px] font-normal text-muted mt-0.5">Agentic engine — default</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ assistantEngine: "byok" })}
                    className={`flex-1 rounded border px-3 py-2 text-xs font-medium cursor-pointer transition-colors ${
                      settings.assistantEngine === "byok"
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-border bg-bg/50 text-text hover:border-accent/50"
                    }`}
                  >
                    🔑 BYOK
                    <span className="block text-[10px] font-normal text-muted mt-0.5">Direct API — local / cloud keys</span>
                  </button>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-white">Fall back to BYOK automatically</label>
                    <span className="text-[10px] text-muted">
                      When OpenCode is unavailable or errors, the assistant routes to the BYOK provider below.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.assistantEngine === "opencode" ? settings.opencodeFallbackToByok : true}
                    disabled={settings.assistantEngine !== "opencode"}
                    onChange={(e) => updateSettings({ opencodeFallbackToByok: e.target.checked })}
                    className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                  />
                </div>
              </div>

              {/* Provider Selection */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text">Fallback Provider (BYOK)</label>
                <select
                  value={settings.aiProvider}
                  onChange={(e) => {
                    const provider = e.target.value;
                    const preset = getProviderPreset(provider);
                    const defaultUrl = preset?.defaultBaseUrl ?? settings.aiBaseUrl;
                    const defaultModel = preset?.defaultModel ?? settings.aiModelName;

                    updateSettings({
                      aiProvider: provider,
                      aiBaseUrl: defaultUrl,
                      aiModelName: defaultModel,
                    });
                  }}
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent cursor-pointer"
                >
                  <option value="opencode_zen">OpenCode Zen (API Gateway: https://opencode.ai/zen/v1)</option>
                  <option value="ollama_hermes">Local Nous Hermes / Ollama (Offline / Local Proxy)</option>
                  <option value="openrouter">OpenRouter (Online Hermes 3 / Llama 3.3 / Free Models)</option>
                  <option value="openai">OpenAI (GPT-4o / GPT-4o-mini)</option>
                  <option value="anthropic">Anthropic (Claude 3.5 Sonnet / Haiku)</option>
                  <option value="gemini">Google Gemini (2.0 Flash / 1.5 Pro / Latest)</option>
                  <option value="custom">Custom OpenAI-Compatible Server (vLLM / LM Studio)</option>
                </select>
              </div>

              {/* Base URL */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text">Server Base URL</label>
                <input
                  type="text"
                  value={settings.aiBaseUrl}
                  onChange={(e) => updateSettings({ aiBaseUrl: e.target.value })}
                  placeholder="e.g. http://localhost:11434/v1 or https://openrouter.ai/api/v1"
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent font-mono"
                />
                <span className="text-[10px] text-muted">API endpoint base URL.</span>
              </div>

              {/* Model Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text">Model Identifier</label>
                <input
                  type="text"
                  value={settings.aiModelName}
                  onChange={(e) => updateSettings({ aiModelName: e.target.value })}
                  placeholder="e.g. nousresearch/hermes-3-llama-3.1-405b or hermes3:8b"
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent font-mono"
                />
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[10px] text-muted">Presets:</span>
                  <button
                    type="button"
                    onClick={() => updateSettings({ aiModelName: "big-pickle" })}
                    className="rounded border border-border/60 bg-bg/40 px-1.5 py-0.5 text-[10px] text-purple-400 hover:border-purple-400 font-mono cursor-pointer"
                  >
                    big-pickle (OpenCode Zen)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ aiModelName: "nousresearch/hermes-3-llama-3.1-405b" })}
                    className="rounded border border-border/60 bg-bg/40 px-1.5 py-0.5 text-[10px] text-accent hover:border-accent font-mono cursor-pointer"
                  >
                    hermes-3-405b (OpenRouter)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ aiModelName: "google/gemini-2.0-flash-exp:free" })}
                    className="rounded border border-border/60 bg-bg/40 px-1.5 py-0.5 text-[10px] text-emerald-400 hover:border-emerald-400 font-mono cursor-pointer"
                  >
                    gemini-2.0-flash:free
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ aiModelName: "gemini-2.0-flash" })}
                    className="rounded border border-border/60 bg-bg/40 px-1.5 py-0.5 text-[10px] text-sky-400 hover:border-sky-400 font-mono cursor-pointer"
                  >
                    gemini-2.0-flash (Direct)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ aiModelName: "gemini-1.5-pro" })}
                    className="rounded border border-border/60 bg-bg/40 px-1.5 py-0.5 text-[10px] text-sky-400 hover:border-sky-400 font-mono cursor-pointer"
                  >
                    gemini-1.5-pro (Direct)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ aiModelName: "hermes3:8b" })}
                    className="rounded border border-border/60 bg-bg/40 px-1.5 py-0.5 text-[10px] text-muted hover:text-white font-mono cursor-pointer"
                  >
                    hermes3:8b (Local Ollama)
                  </button>
                </div>
                {/* Dynamic model pills — populated after "Fetch Models" or Test Connection */}
                {availableModels.length > 0 && (
                  <div className="flex flex-col gap-1 pt-1">
                    <span className="text-[10px] text-muted">Live models from your API key:</span>
                    <div className="flex flex-wrap gap-1">
                      {availableModels.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => updateSettings({ aiModelName: m })}
                          className={`rounded border px-1.5 py-0.5 text-[10px] font-mono cursor-pointer transition-colors ${
                            settings.aiModelName === m
                              ? "border-accent bg-accent/20 text-white"
                              : "border-border/60 bg-bg/40 text-muted hover:border-accent hover:text-white"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {availableModels.length > 0 &&
                  !!settings.aiModelName &&
                  !availableModels.includes(settings.aiModelName) && (
                    <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300">
                      ⚠️ "{settings.aiModelName}" was not found in the live model list for this API key. It may have
                      been deprecated or renamed. Pick one from the list above, or click "Fetch Available Models"
                      again.
                    </div>
                  )}

              </div>

              {/* API Key */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text">API Key (BYOK)</label>
                <div className="relative flex items-center">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={settings.aiApiKey}
                    onChange={(e) => updateSettings({ aiApiKey: e.target.value })}
                    placeholder={settings.aiProvider === "ollama_hermes" ? "Not required for local Ollama" : "sk-..."}
                    className="w-full rounded border border-border bg-bg/50 px-3 py-2 pr-16 text-xs text-text outline-none focus:border-accent font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 text-[10px] text-muted hover:text-white px-1.5 py-0.5 rounded bg-bg/80 cursor-pointer"
                  >
                    {showApiKey ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {/* Test Connection + Fetch Models Buttons */}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  className="rounded border border-border bg-bg/60 px-3 py-1.5 text-xs font-medium text-text hover:bg-card hover:text-white cursor-pointer transition-colors"
                >
                  Test Connection
                </button>
                {(settings.aiProvider === "gemini" || settings.aiProvider === "openrouter" || settings.aiProvider === "opencode_zen") && (
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={fetchModelsStatus === "fetching"}
                    className="rounded border border-border bg-bg/60 px-3 py-1.5 text-xs font-medium text-sky-400 hover:bg-card hover:text-sky-300 cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {fetchModelsStatus === "fetching" ? "Fetching..." : "↻ Fetch Available Models"}
                  </button>
                )}
                {fetchModelsStatus === "done" && (
                  <span className="text-xs text-sky-400">{availableModels.length} models loaded ✓</span>
                )}
                {fetchModelsStatus === "empty" && (
                  <span className="text-xs text-amber-400">No models returned. Check your API key and Base URL.</span>
                )}
                {testConnectionStatus && (
                  <span className={`text-xs ${testConnectionStatus === "success" ? "text-emerald-400" : "text-accent"}`}>
                    {testConnectionStatus === "testing" ? "Testing connection..." : testConnectionStatus === "success" ? "Connection Successful!" : testConnectionStatus}
                  </span>
                )}
              </div>

              {/* Enable Hermes Tool Calling & RAG Toggle */}
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium text-white">Workspace Tool Calling & RAG</label>
                  <span className="text-[10px] text-muted">Allow Hermes to query vault index (FTS5 search, backlinks graph) via function tools.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.aiEnableWorkspaceTools}
                  onChange={(e) => updateSettings({ aiEnableWorkspaceTools: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                />
              </div>

              {/* System Prompt Override */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text">System Instructions</label>
                <textarea
                  rows={3}
                  value={settings.aiSystemPrompt}
                  onChange={(e) => updateSettings({ aiSystemPrompt: e.target.value })}
                  className="w-full rounded border border-border bg-bg/50 p-2.5 text-xs text-text outline-none focus:border-accent resize-none leading-relaxed"
                />
              </div>

              {/* ─── Goal Mode & Auditor ─────────────────── */}
              <div className="pt-4 border-t border-border/40 space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-white">🎯 Goal Mode &amp; Auditor</h4>
                  <p className="text-[10px] text-muted mt-0.5">
                    Autonomous study goals run a capped loop with a cheap auditor judging done / stuck / keep-going. Leave the model blank to use the main BYOK model.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-text">Auditor Model</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={settings.smallModel}
                        onChange={(e) => updateSettings({ smallModel: e.target.value })}
                        placeholder={settings.aiModelName || "hermes3:8b"}
                        className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 pr-14 text-xs text-text outline-none focus:border-accent font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => updateSettings({ smallModel: "" })}
                        title="Use the main BYOK model"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded bg-bg/60 px-1.5 py-0.5 text-[9px] text-muted hover:text-text cursor-pointer"
                      >
                        auto
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-text">Auditor Base URL</label>
                    <input
                      type="text"
                      value={settings.smallModelBaseUrl}
                      onChange={(e) => updateSettings({ smallModelBaseUrl: e.target.value })}
                      placeholder={settings.aiBaseUrl || "http://localhost:11434/v1"}
                      className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-text">Token Budget</label>
                    <input
                      type="number"
                      min={1000}
                      step={1000}
                      value={settings.goalTokenBudget}
                      onChange={(e) => updateSettings({ goalTokenBudget: parseInt(e.target.value) || 80000 })}
                      className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-text">Max Iterations</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={settings.goalMaxIterations}
                      onChange={(e) => updateSettings({ goalMaxIterations: parseInt(e.target.value) || 12 })}
                      className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between py-1">
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-white">Agent Control Tools</label>
                    <span className="text-[10px] text-muted">Expose create/fork session &amp; set-goal meta tools to the agent.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.aiEnableAgentControls}
                    onChange={(e) => updateSettings({ aiEnableAgentControls: e.target.checked })}
                    className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                  />
                </div>
              </div>

              {/* ─── Memory-RAG (Agent Knowledge) ─────────────────── */}
              <div className="pt-4 border-t border-border/40 space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-white">🧠 Memory-RAG (Agent Knowledge)</h4>
                  <p className="text-[10px] text-muted mt-0.5">
                    Semantic memory + retrieval over your vault. Embeddings run against a local Ollama server; when it is offline, tools fall back to keyword search.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-text">Embedding Base URL</label>
                    <input
                      type="text"
                      value={settings.embedBaseUrl}
                      onChange={(e) => updateSettings({ embedBaseUrl: e.target.value })}
                      placeholder="http://localhost:11434"
                      className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-text">Embedding Model</label>
                    <input
                      type="text"
                      value={settings.embedModel}
                      onChange={(e) => updateSettings({ embedModel: e.target.value })}
                      placeholder="nomic-embed-text"
                      className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-text">RAG Top-K</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={settings.ragTopK}
                      onChange={(e) => updateSettings({ ragTopK: parseInt(e.target.value) || 5 })}
                      className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent"
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!currentFolderPath) {
                          setReindexStatus("Open a vault first.");
                          return;
                        }
                        setReindexStatus("Embedding chunks...");
                        try {
                          const { rebuildEmbeddings } = await import("../services/agentKnowledge");
                          const n = await rebuildEmbeddings(currentFolderPath, settings);
                          setReindexStatus(n === 0 ? "Embeddings up to date" : `Embedded ${n} chunks`);
                        } catch (err) {
                          setReindexStatus(`Failed: ${String(err)}`);
                        }
                      }}
                      className="rounded border border-border bg-bg/60 px-3 py-1.5 text-xs font-medium text-sky-400 hover:bg-card hover:text-sky-300 cursor-pointer transition-colors"
                    >
                      ↻ Re-index Embeddings
                    </button>
                    {reindexStatus && (
                      <span className="text-[10px] text-muted">{reindexStatus}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-border/40">
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-white">Auto-save conversation memory</label>
                    <span className="text-[10px] text-muted">Persist Q&A turns so future sessions recall them.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.memoryAutoSave !== false}
                    onChange={(e) => updateSettings({ memoryAutoSave: e.target.checked })}
                    className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                  />
                </div>

                {/* File-write tools gate */}
                <div className="flex items-center justify-between py-2 border-b border-border/40">
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-white">Allow AI file writes</label>
                    <span className="text-[10px] text-muted">
                      Lets the AI create, edit, rename and delete notes (destructive actions still need your approval). Off by default.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.aiEnableFileWrite === true}
                    onChange={(e) => updateSettings({ aiEnableFileWrite: e.target.checked })}
                    className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                  />
                </div>

                {/* Verbose AI tool-call logging (diagnostics) */}
                <div className="flex items-center justify-between py-2 border-b border-border/40">
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-white">Verbose AI tool logging</label>
                    <span className="text-[10px] text-muted">
                      Logs which tools were offered, called, and their results to a local debug file — for
                      diagnosing tool-calling issues. Off by default.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.aiVerboseLogging === true}
                    onChange={(e) => updateSettings({ aiVerboseLogging: e.target.checked })}
                    className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                  />
                </div>
                {settings.aiVerboseLogging && <VerboseLogPathHint />}
              </div>

              {/* ─── OpenCode Agent ──────────────────────────────── */}
              <div className="pt-4 border-t border-border/40 space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-white">🤖 OpenCode Agent</h4>
                  <p className="text-[10px] text-muted mt-0.5">
                    OpenCode is the primary engine for the assistant panel. BYOK (fallback) keys are injected from above at launch — no separate key configuration needed.
                  </p>
                </div>

                {/* Install status */}
                <div className="flex items-center justify-between py-1">
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-text">OpenCode Status</label>
                    <span className="text-[10px] text-muted">
                    {opencodeInstalled
                      ? opencodeBinaryVersion
                        ? `Installed: ${opencodeBinaryVersion}`
                        : "Installed on PATH"
                      : (() => {
                          // Detect platform for the correct install command (only shown when the CLI is missing)
                          const isWin = navigator.userAgent.toLowerCase().includes("windows");
                          return isWin ? "Not installed — winget install SST.opencode" : "Not installed — curl -fsSL https://opencode.ai/install | bash";
                        })()}
                  </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-medium ${settings.opencodePort > 0 ? "text-muted" : "text-red-400"}`}>
                      port {settings.opencodePort}
                    </span>
                  </div>
                </div>

                {/* Server port */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-text">Server Port</label>
                  <input
                    type="number"
                    min={1024}
                    max={65535}
                    value={settings.opencodePort}
                    onChange={(e) => updateSettings({ opencodePort: parseInt(e.target.value) || 4096 })}
                    className="w-full rounded border border-border bg-bg/50 p-2 text-xs text-text outline-none focus:border-accent"
                  />
                  <span className="text-[10px] text-muted">
                    OpenCode's default is 4096. Change only if that port conflicts with another service.
                  </span>
                </div>

                {/* Runtime status + one-click recovery (OPENCODE_HTTP500_DIAGNOSIS_PLAN.md workstream C/D) */}
                <div className="flex items-start justify-between gap-2 rounded-md border border-border/40 bg-bg/40 p-2.5">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <label className="text-xs font-medium text-white">Server Status</label>
                    <span className="text-[10px] text-muted break-words">
                      {opencodeStatus === "ready"
                        ? `running on port ${opencodeServerPort ?? settings.opencodePort}${opencodeBinaryVersion ? ` · v${opencodeBinaryVersion}` : ""}`
                        : opencodeStatus === "starting"
                          ? "starting…"
                          : opencodeStatus === "error"
                            ? "error"
                            : "stopped"}
                      {opencodeServerPid === null ? " — no sidecar running" : ""}
                    </span>
                  </div>
                  <button
                    onClick={async () => {
                      setOpencodeRestartMsg(null);
                      try {
                        if (opencodeServerPid === null) {
                          await startOpencodeServerAct();
                          setOpencodeRestartMsg("Server started.");
                        } else {
                          await restartOpencodeServer();
                          setOpencodeRestartMsg("Server restarted — a fresh session starts on the next message.");
                        }
                      } catch (err) {
                        setOpencodeRestartMsg(`Restart failed: ${String(err)}`);
                      }
                    }}
                    className="rounded-md border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-accent hover:border-accent/60 whitespace-nowrap"
                  >
                    Restart server
                  </button>
                </div>
                {opencodeRestartMsg && <p className="text-[10px] text-accent/90">{opencodeRestartMsg}</p>}

                {/* Auto-start toggle */}
                <div className="flex items-center justify-between py-1">
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-white">Auto-start OpenCode Engine</label>
                    <span className="text-[10px] text-muted">Automatically start opencode serve when the OpenCode engine is the active assistant engine.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.opencodeAutoStart}
                    onChange={(e) => updateSettings({ opencodeAutoStart: e.target.checked })}
                    className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                  />
                </div>

                {/* Auto-retry on a fresh session */}
                <div className="flex items-center justify-between py-1">
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-white">Auto-retry on fresh session</label>
                    <span className="text-[10px] text-muted">When the agent fails with a server error (HTTP 5xx), retry the message once on a fresh session before falling back.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.opencodeAutoRetry !== false}
                    onChange={(e) => updateSettings({ opencodeAutoRetry: e.target.checked })}
                    className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {activeSection === "agent_models" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">Agent Models & Display Settings</h3>
                <p className="text-xs text-muted">
                  Customize how AI models are displayed, filter OpenCode Zen vs. BYOK providers, and configure custom model aliases.
                </p>
              </div>

              {/* Section 1: Model Badge Display Mode */}
              <div className="space-y-3 rounded-md border border-border bg-card p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-accent">Composer Model Badge Display Style</h4>
                <p className="text-[11px] text-muted">
                  Choose how model labels appear in the bottom composer bar.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  {[
                    { id: "auto_collapse", label: "Auto-Collapse", desc: "Icon pill when space is tight, expands on click/hover" },
                    { id: "compact_pill", label: "Always Compact Pill", desc: "Icon badge only to save max toolbar space" },
                    { id: "full_badge", label: "Always Full Badge", desc: "Full model name label always expanded" },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => {
                        const cur = settings.agentModelSettings || {
                          modelDisplayMode: "auto_collapse",
                          showZenModels: true,
                          showByokModels: true,
                          enabledProviders: {},
                          modelAliases: {},
                        };
                        updateSettings({
                          agentModelSettings: { ...cur, modelDisplayMode: mode.id as any },
                        });
                      }}
                      className={`flex flex-col items-start p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                        (settings.agentModelSettings?.modelDisplayMode || "auto_collapse") === mode.id
                          ? "border-accent bg-accent/15 text-white shadow-sm"
                          : "border-border/60 bg-bg/40 text-muted hover:text-text hover:border-border"
                      }`}
                    >
                      <span className="text-xs font-medium">{mode.label}</span>
                      <span className="text-[10px] text-muted/80 mt-1 leading-tight">{mode.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Section 2: OpenCode Zen vs BYOK Category Filters */}
              <div className="space-y-3 rounded-md border border-border bg-card p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-accent">Model Category & Provider Visibility</h4>
                <p className="text-[11px] text-muted">
                  Toggle model categories and specific providers in the model selector dropdown.
                </p>

                <div className="flex flex-wrap gap-4 pt-1 border-b border-border/40 pb-3">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-white">
                    <input
                      type="checkbox"
                      checked={settings.agentModelSettings?.showZenModels ?? true}
                      onChange={(e) => {
                        const cur = settings.agentModelSettings || {
                          modelDisplayMode: "auto_collapse",
                          showZenModels: true,
                          showByokModels: true,
                          enabledProviders: {},
                          modelAliases: {},
                        };
                        updateSettings({
                          agentModelSettings: { ...cur, showZenModels: e.target.checked },
                        });
                      }}
                      className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent"
                    />
                    <span className="flex items-center gap-1">
                      <span>Enable OpenCode Zen Models</span>
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.2 text-[9px] font-bold text-amber-300">⚡ Zen</span>
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-white">
                    <input
                      type="checkbox"
                      checked={settings.agentModelSettings?.showByokModels ?? true}
                      onChange={(e) => {
                        const cur = settings.agentModelSettings || {
                          modelDisplayMode: "auto_collapse",
                          showZenModels: true,
                          showByokModels: true,
                          enabledProviders: {},
                          modelAliases: {},
                        };
                        updateSettings({
                          agentModelSettings: { ...cur, showByokModels: e.target.checked },
                        });
                      }}
                      className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent"
                    />
                    <span className="flex items-center gap-1">
                      <span>Enable BYOK Models</span>
                      <span className="rounded bg-blue-500/15 px-1.5 py-0.2 text-[9px] font-medium text-blue-300">BYOK</span>
                    </span>
                  </label>
                </div>

                {/* Individual Provider Toggles */}
                <div className="space-y-2 pt-1">
                  <span className="text-[11px] font-medium text-muted uppercase tracking-wider">Active Providers Checklist</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { id: "opencode_zen", label: "OpenCode Zen (API Gateway)", icon: "☯️", cat: "BYOK" },
                      { id: "opencode_big_pickle", label: "Big Pickle (OpenCode Zen)", icon: "🥒", cat: "Zen" },
                      { id: "opencode_zen_smart", label: "OpenCode Zen Smart", icon: "⚡", cat: "Zen" },
                      { id: "opencode_zen_fast", label: "OpenCode Zen Fast", icon: "🚀", cat: "Zen" },
                      { id: "opencode_zen_deepseek", label: "DeepSeek R1 (OpenCode Zen)", icon: "🧠", cat: "Zen" },
                      { id: "ollama_hermes", label: "Nous Hermes 3 (Local)", icon: "🦙", cat: "BYOK" },
                      { id: "openrouter", label: "Nous Hermes 3 (OpenRouter)", icon: "🌐", cat: "BYOK" },
                      { id: "openai", label: "OpenAI GPT-4o Mini", icon: "⚡", cat: "BYOK" },
                      { id: "anthropic", label: "Claude Sonnet 5", icon: "✨", cat: "BYOK" },
                      { id: "gemini", label: "Google Gemini", icon: "💎", cat: "BYOK" },
                    ].map((prov) => {
                      const enabledProviders = settings.agentModelSettings?.enabledProviders || {};
                      const isChecked = enabledProviders[prov.id] !== false;

                      return (
                        <label
                          key={prov.id}
                          className="flex items-center justify-between rounded-lg border border-border/50 bg-bg/40 px-3 py-2 text-xs text-text cursor-pointer hover:bg-bg/80 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span>{prov.icon}</span>
                            <span className="font-medium">{prov.label}</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const cur = settings.agentModelSettings || {
                                modelDisplayMode: "auto_collapse",
                                showZenModels: true,
                                showByokModels: true,
                                enabledProviders: {},
                                modelAliases: {},
                              };
                              updateSettings({
                                agentModelSettings: {
                                  ...cur,
                                  enabledProviders: {
                                    ...(cur.enabledProviders || {}),
                                    [prov.id]: e.target.checked,
                                  },
                                },
                              });
                            }}
                            className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Section 3: Custom Model Display Aliases */}
              <div className="space-y-3 rounded-md border border-border bg-card p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-accent">Custom Model Display Aliases</h4>
                <p className="text-[11px] text-muted">
                  Map raw AI model tags to clean, friendly display names in the UI.
                </p>

                <div className="space-y-2">
                  {Object.entries(settings.agentModelSettings?.modelAliases || {}).map(([raw, alias]) => (
                    <div key={raw} className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-bg/50 px-3 py-1.5 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[10.5px] text-muted truncate max-w-[140px]">{raw}</span>
                        <span className="text-muted/40">→</span>
                        <span className="font-medium text-text truncate">{alias}</span>
                      </div>
                      <button
                        onClick={() => {
                          const cur = settings.agentModelSettings || {
                            modelDisplayMode: "auto_collapse",
                            showZenModels: true,
                            showByokModels: true,
                            enabledProviders: {},
                            modelAliases: {},
                          };
                          const nextAliases = { ...(cur.modelAliases || {}) };
                          delete nextAliases[raw];
                          updateSettings({
                            agentModelSettings: { ...cur, modelAliases: nextAliases },
                          });
                        }}
                        className="text-muted hover:text-red-400 cursor-pointer p-0.5 rounded transition-colors text-[10px]"
                        title="Remove alias"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeSection === "connectors" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-white">Connectors & Research</h3>
                <p className="text-xs text-muted">
                  MCP servers expose tools to the AI assistant. Offline-first: every connector is opt-in and stays off until you enable it.
                </p>
              </div>

              {/* Online state */}
              <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${online ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
                <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-400" : "bg-amber-400"}`} />
                {online ? "Online — web connectors (🔌) are available." : "Offline — web connectors will be skipped until you reconnect."}
              </div>

              {/* Add Connector */}
              <div className="relative">
                <button
                  onClick={() => setAddMode(addMode === "menu" ? "closed" : "menu")}
                  className="rounded border border-border bg-bg/60 px-3 py-1.5 text-xs font-medium text-text hover:bg-card hover:text-white cursor-pointer transition-colors"
                >
                  {addMode === "menu" ? "Close" : "+ Add Connector"}
                </button>

                {addMode === "menu" && (
                  <div className="absolute left-0 top-9 z-30 w-64 rounded-md border border-border bg-card p-1 text-xs text-text shadow-xl">
                    {availablePresets.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted">From preset</div>
                        {availablePresets.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              addConnector({
                                name: p.name,
                                kind: p.kind,
                                command: p.command,
                                args: p.args,
                                cwd: p.cwd,
                                url: p.url,
                                headers: p.headers,
                                env: p.env,
                              });
                              setAddMode("closed");
                            }}
                            className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                          >
                            <span>{p.name}</span>
                            <span className={`rounded px-1.5 py-px text-[9px] font-semibold uppercase ${p.kind === "http" ? "bg-sky-500/15 text-sky-400" : "bg-violet-500/15 text-violet-400"}`}>
                              {p.kind}
                            </span>
                          </button>
                        ))}
                      </>
                    )}
                    <div className="h-px bg-border/60 my-0.5" />
                    <button
                      onClick={startCustomAdd}
                      className="w-full rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                    >
                      Custom connector…
                    </button>
                  </div>
                )}
              </div>

              {/* Registry list */}
              <div className="space-y-2">
                {connectors.length === 0 && (
                  <div className="rounded-md border border-dashed border-border bg-bg/30 px-4 py-6 text-center text-[11px] text-muted">
                    No connectors registered. Add one above, or rerun to restore the built-in presets.
                  </div>
                )}

                {connectors.map((c) => {
                  const isExpanded = expandedId === c.id;
                  const status = testStatus[c.id];
                  return (
                    <div key={c.id} className="rounded-md border border-border bg-bg/40 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.enabled ? "bg-emerald-400" : "bg-border"}`} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-xs font-medium text-text">{c.name}</span>
                              <span className={`rounded px-1.5 py-px text-[9px] font-semibold uppercase ${c.kind === "http" ? "bg-sky-500/15 text-sky-400" : "bg-violet-500/15 text-violet-400"}`}>{c.kind}</span>
                              {c.kind === "http" && <span className="rounded px-1.5 py-px text-[9px] uppercase text-muted bg-border/40">🔌 web</span>}
                            </div>
                            <div className="truncate text-[10px] text-muted">
                              {c.kind === "stdio" ? `${c.command ?? ""} ${(c.args ?? []).join(" ")}`.trim() : c.url}
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={c.enabled}
                            onChange={(e) => updateConnector(c.id, { enabled: e.target.checked })}
                            className="h-3.5 w-3.5 cursor-pointer rounded border-border bg-bg/50 text-accent focus:ring-accent"
                            title={c.enabled ? "Disable connector" : "Enable connector"}
                          />
                          <button
                            onClick={() => handleTestConnector(c)}
                            className="cursor-pointer rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted hover:text-white transition-colors"
                          >
                            Test
                          </button>
                          <button
                            onClick={() => (isExpanded ? closeEditor() : startEditor(c))}
                            className="cursor-pointer rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted hover:text-white transition-colors"
                          >
                            {isExpanded ? "Close" : "Configure"}
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Remove connector "${c.name}"?`)) removeConnector(c.id);
                            }}
                            className="cursor-pointer rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-red-400 hover:text-red-300 transition-colors"
                            title="Remove connector"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {status && (
                        <p className={`mt-1.5 text-[10px] ${status.startsWith("✓") ? "text-emerald-400" : status.startsWith("✗") ? "text-red-400" : "text-muted"}`}>
                          {status}
                        </p>
                      )}

                      {isExpanded && draft && (
                        <div className="mt-3 space-y-2 border-t border-border/40 pt-3">
                          <input
                            type="text"
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                            placeholder="Connector name"
                            className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent"
                          />
                          <select
                            value={draft.kind}
                            onChange={(e) => setDraft({ ...draft, kind: e.target.value as ConnectorKind })}
                            className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent cursor-pointer"
                          >
                            <option value="stdio">stdio (local binary)</option>
                            <option value="http">http (remote streamable-http)</option>
                          </select>

                          {draft.kind === "stdio" ? (
                            <>
                              <input
                                type="text"
                                value={draft.command ?? ""}
                                onChange={(e) => setDraft({ ...draft, command: e.target.value })}
                                placeholder="e.g. npx, python -m, or a binary path"
                                className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                              />
                              <input
                                type="text"
                                value={draft.args?.join(", ") ?? ""}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    args: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                                  })
                                }
                                placeholder="Arguments, comma-separated — e.g. -y, @modelcontextprotocol/server-filesystem, /vault"
                                className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                              />
                              <input
                                type="text"
                                value={draft.cwd ?? ""}
                                onChange={(e) => setDraft({ ...draft, cwd: e.target.value })}
                                placeholder="Working directory (optional)"
                                className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                              />
                            </>
                          ) : (
                            <>
                              <input
                                type="text"
                                value={draft.url ?? ""}
                                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                                placeholder="https://mcp.example.com/sse"
                                className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                              />
                              <textarea
                                rows={3}
                                value={headersText}
                                onChange={(e) => setHeadersText(e.target.value)}
                                placeholder={'Headers (one per line), e.g.\nauthorization: Bearer sk-...'}
                                className="w-full resize-none rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono leading-relaxed"
                              />
                            </>
                          )}

                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={closeEditor}
                              className="cursor-pointer rounded border border-border/60 px-2.5 py-1 text-[10px] text-muted hover:text-white transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={saveDraft}
                              className="cursor-pointer rounded bg-accent px-2.5 py-1 text-[10px] font-medium text-white hover:bg-accent-hover transition-colors"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Editor for a brand-new custom connector (no row yet) */}
              {expandedId === "__new__" && draft && (
                <div className="space-y-2 border-t border-border/40 pt-3">
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Connector name"
                    className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent"
                  />
                  <select
                    value={draft.kind}
                    onChange={(e) => setDraft({ ...draft, kind: e.target.value as ConnectorKind })}
                    className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="stdio">stdio (local binary)</option>
                    <option value="http">http (remote streamable-http)</option>
                  </select>

                  {draft.kind === "stdio" ? (
                    <>
                      <input
                        type="text"
                        value={draft.command ?? ""}
                        onChange={(e) => setDraft({ ...draft, command: e.target.value })}
                        placeholder="e.g. npx, python -m, or a binary path"
                        className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                      />
                      <input
                        type="text"
                        value={draft.args?.join(", ") ?? ""}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            args: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                          })
                        }
                        placeholder="Arguments, comma-separated — e.g. -y, @modelcontextprotocol/server-filesystem"
                        className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                      />
                      <input
                        type="text"
                        value={draft.cwd ?? ""}
                        onChange={(e) => setDraft({ ...draft, cwd: e.target.value })}
                        placeholder="Working directory (optional)"
                        className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                      />
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={draft.url ?? ""}
                        onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                        placeholder="https://mcp.example.com/sse"
                        className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                      />
                      <textarea
                        rows={3}
                        value={headersText}
                        onChange={(e) => setHeadersText(e.target.value)}
                        placeholder={"Headers (one per line), e.g.\nauthorization: Bearer sk-..."}
                        className="w-full resize-none rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono leading-relaxed"
                      />
                    </>
                  )}

                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={closeEditor}
                      className="cursor-pointer rounded border border-border/60 px-2.5 py-1 text-[10px] text-muted hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveDraft}
                      className="cursor-pointer rounded bg-accent px-2.5 py-1 text-[10px] font-medium text-white hover:bg-accent-hover transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSection === "tasks" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-white">Scheduled Tasks</h3>
                <p className="text-xs text-muted">
                  Recurring study tasks fire while the app is open. Each run creates an agent session and
                  executes in goal mode with the built-in auditor. Runs never overlap the Study Assistant.
                </p>
              </div>

              {taskFormError && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {taskFormError}
                </div>
              )}

              {/* Create form */}
              <div className="rounded-md border border-border bg-bg/30 p-4 space-y-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium">Task Name</label>
                  <input
                    value={taskName}
                    onChange={(e) => setTaskName(e.target.value)}
                    placeholder="Morning review"
                    className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium">Prompt / Goal</label>
                  <textarea
                    value={taskPrompt}
                    onChange={(e) => setTaskPrompt(e.target.value)}
                    placeholder="Summarize yesterday's notes into a new note."
                    rows={3}
                    className="w-full resize-y rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium">Schedule</label>
                    <select
                      value={taskSchedule}
                      onChange={(e) => setTaskSchedule(e.target.value as typeof taskSchedule)}
                      className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent cursor-pointer"
                    >
                      <option value="once">Once</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="cron">Cron</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium">Time (HH:mm)</label>
                    <input
                      value={taskTime}
                      onChange={(e) => setTaskTime(e.target.value)}
                      placeholder="09:00"
                      className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent"
                    />
                  </div>
                </div>
                {taskSchedule === "weekly" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium">Weekday (0=Mon … 6=Sun, comma-separated)</label>
                    <input
                      value={taskWeekday}
                      onChange={(e) => setTaskWeekday(e.target.value)}
                      placeholder="0,2,4"
                      className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent"
                    />
                  </div>
                )}
                {taskSchedule === "cron" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium">Cron Expression (naive daily in engine)</label>
                    <input
                      value={taskCron}
                      onChange={(e) => setTaskCron(e.target.value)}
                      placeholder="0 9 * * *"
                      className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent"
                    />
                  </div>
                )}
                <button
                  onClick={handleCreateTask}
                  className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover cursor-pointer transition-colors"
                >
                  Create Task
                </button>
              </div>

              {/* Registry list */}
              <div className="space-y-2">
                {scheduledTasks.length === 0 && (
                  <div className="rounded-md border border-dashed border-border bg-bg/30 px-4 py-6 text-center text-[11px] text-muted">
                    No scheduled tasks yet. Add one above.
                  </div>
                )}

                {scheduledTasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-md border border-border bg-bg/30 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`truncate text-xs font-medium text-text ${t.disabled ? "opacity-50" : ""}`}>{t.name}</span>
                        <span className={`shrink-0 rounded px-1.5 py-px text-[9px] font-semibold uppercase ${t.disabled ? "bg-bg/60 text-muted" : "bg-emerald-500/15 text-emerald-400"}`}>
                          {t.disabled ? "off" : "on"}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-muted">{scheduleLabel(t)} · next run {formatRunTime(t.nextRun)}</p>
                    </div>
                    <div className="ml-3 flex shrink-0 items-center gap-2">
                      {t.lastRunAt != null && (
                        <span className="text-[9px] text-muted" title={`Last run ${new Date(t.lastRunAt).toLocaleString()}`}>
                          ↻ {new Date(t.lastRunAt).toLocaleDateString()}
                        </span>
                      )}
                      <button
                        onClick={() => patchScheduledTask(t.id, { disabled: !t.disabled })}
                        className="rounded border border-border bg-bg/60 px-2 py-1 text-[10px] font-medium text-text hover:bg-card hover:text-white cursor-pointer transition-colors"
                        title={t.disabled ? "Enable" : "Disable"}
                      >
                        {t.disabled ? "Enable" : "Disable"}
                      </button>
                      <button
                        onClick={() => deleteScheduledTask(t.id)}
                        className="rounded border border-border bg-bg/60 px-2 py-1 text-[10px] font-medium text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors"
                        title="Delete task"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {scheduledTaskRunning && (
                <div className="flex items-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                  A scheduled task is running — new runs wait for it to finish.
                </div>
              )}
            </div>
          )}

          {activeSection === "study_tools" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-white">Study Tools</h3>
                <p className="text-xs text-muted">
                  Reusable study aids the AI assistant can use — research lookups, paper search, vault
                  grounding, and custom templates (flashcards, citations, ...). Presets ship disabled;
                  you never lose your custom entries.
                </p>
              </div>

              {studyToolError && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {studyToolError}
                </div>
              )}

              {/* Add custom tool */}
              <div className="rounded-md border border-border bg-bg/30 p-4 space-y-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium">New custom tool</label>
                  <input
                    value={newToolName}
                    onChange={(e) => setNewToolName(e.target.value)}
                    placeholder="Flashcard gen"
                    className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <textarea
                    value={newToolDesc}
                    onChange={(e) => setNewToolDesc(e.target.value)}
                    placeholder="Turn a note into 10 flashcards with answers."
                    rows={2}
                    className="w-full resize-y rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent"
                  />
                </div>
                <button
                  onClick={() => {
                    if (!newToolName.trim()) {
                      setStudyToolError("A name is required.");
                      return;
                    }
                    setStudyToolError(null);
                    setStudyTools(
                      addStudyTool({
                        id: `tool-custom-${Date.now()}`,
                        name: newToolName.trim(),
                        description: newToolDesc.trim() || "Custom study tool.",
                        enabled: false,
                      }),
                    );
                    setNewToolName("");
                    setNewToolDesc("");
                  }}
                  className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover cursor-pointer transition-colors"
                >
                  Add Tool
                </button>
              </div>

              {/* Registry list */}
              <div className="space-y-2">
                {studyTools.length === 0 && (
                  <div className="rounded-md border border-dashed border-border bg-bg/30 px-4 py-6 text-center text-[11px] text-muted">
                    No study tools yet. Add one above.
                  </div>
                )}

                {studyTools.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-bg/30 px-3 py-2.5 transition-colors hover:border-border/80"
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.enabled ? "bg-emerald-400" : "bg-border"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium text-text">{t.name}</span>
                        {t.id.startsWith("tool-custom") && (
                          <span className="rounded px-1.5 py-px text-[9px] font-semibold uppercase bg-amber-500/15 text-amber-400">
                            custom
                          </span>
                        )}
                      </div>
                      <div className="truncate text-[10px] text-muted">{t.description}</div>
                      {t.defaultPrompt && (
                        <div className="truncate text-[10px] italic text-muted/70 select-text">“{t.defaultPrompt}”</div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={t.enabled}
                        onChange={(e) => setStudyTools(setStudyToolEnabled(t.id, e.target.checked))}
                        className="h-3.5 w-3.5 cursor-pointer rounded border-border bg-bg/50 text-accent focus:ring-accent"
                        title={t.enabled ? "Disable tool" : "Enable tool"}
                      />
                      {t.id.startsWith("tool-custom") && (
                        <button
                          onClick={() => {
                            if (window.confirm(`Remove tool "${t.name}"?`)) setStudyTools(deleteStudyTool(t.id));
                          }}
                          className="cursor-pointer rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-red-400 hover:text-red-300 transition-colors"
                          title="Remove tool"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-muted">
                {studyTools.length} tool{studyTools.length === 1 ? "" : "s"} in the registry. Changes persist locally.
              </p>
            </div>
          )}

          {activeSection === "about" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">About</h3>
                <p className="text-xs text-muted">Local Study Notebook.</p>
              </div>

              <div className="rounded-md border border-border bg-bg/40 p-4 space-y-1.5 text-xs">
                <p><span className="text-muted">Name:</span> <span className="text-text">Local Study Notebook</span></p>
                <p><span className="text-muted">Version:</span> <span className="text-text">1.5.0</span></p>
                <p><span className="text-muted">Framework:</span> <span className="text-text">Tauri v2 · React · TypeScript</span></p>
                <p><span className="text-muted">Data:</span> <span className="text-text">Stored locally in the app data directory.</span></p>
              </div>

              <div className="rounded-md border border-border bg-bg/40 p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text">Software Updates</span>
                  {updateStatus !== "available" && (
                    <button
                      onClick={handleCheckForUpdates}
                      disabled={updateStatus === "checking"}
                      className="rounded bg-accent px-2.5 py-1 text-[11px] font-medium text-white hover:bg-accent-hover disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors"
                    >
                      {updateStatus === "checking" ? "Checking…" : "Check for Updates"}
                    </button>
                  )}
                </div>

                {updateStatus === "up-to-date" && (
                  <p className="text-muted">You're on the latest version.</p>
                )}

                {updateStatus === "available" && pendingUpdate && (
                  <div className="space-y-2">
                    <p className="text-text">
                      Version <span className="font-semibold text-accent">{pendingUpdate.version}</span> is available.
                    </p>
                    {pendingUpdate.body && (
                      <p className="text-muted whitespace-pre-line max-h-20 overflow-y-auto">{pendingUpdate.body}</p>
                    )}
                    <button
                      onClick={handleInstallUpdate}
                      disabled={updateStatus !== "available"}
                      className="rounded bg-accent px-2.5 py-1 text-[11px] font-medium text-white hover:bg-accent-hover cursor-pointer transition-colors"
                    >
                      Download &amp; Restart to Install
                    </button>
                  </div>
                )}

                {updateStatus === "downloading" && (
                  <p className="text-muted">Downloading update, the app will restart automatically…</p>
                )}

                {updateStatus === "error" && (
                  <p className="text-red-400">Update check failed: {updateError}</p>
                )}
              </div>

              <p className="text-[10px] text-muted">
                An Obsidian-style local-first study notebook with sources, notes, and project vaults.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
