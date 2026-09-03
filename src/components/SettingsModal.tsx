import { useState } from "react";
import { useStore } from "../stores/useStore";
import { THEMES } from "../themes";
import { check as checkForUpdate, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { testAIConnection } from "../services/aiProvider";

type SettingSection = "general" | "appearance" | "editor" | "files" | "project" | "ai_byok" | "about";
type UpdateStatus = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "error";

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


  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

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
      if (settings.aiProvider === "gemini" || settings.aiProvider === "openrouter") {
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

  if (!showSettings) return null;

  const sections: { id: SettingSection; label: string }[] = [
    { id: "general", label: "General" },
    { id: "appearance", label: "Appearance" },
    { id: "editor", label: "Editor" },
    { id: "files", label: "Files & Links" },
    { id: "project", label: "Project" },
    { id: "ai_byok", label: "AI & BYOK Model" },
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

          {activeSection === "ai_byok" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">AI & BYOK Model Server</h3>
                <p className="text-xs text-muted">
                  Bring Your Own Key (BYOK) or connect a local Hermes / Ollama server endpoint.
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

              {/* Provider Selection */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text">AI Model Provider</label>
                <select
                  value={settings.aiProvider}
                  onChange={(e) => {
                    const provider = e.target.value;
                    let defaultUrl = settings.aiBaseUrl;
                    let defaultModel = settings.aiModelName;

                    if (provider === "ollama_hermes") {
                      defaultUrl = "http://localhost:11434/v1";
                      defaultModel = "hermes3:8b";
                    } else if (provider === "openrouter") {
                      defaultUrl = "https://openrouter.ai/api/v1";
                      defaultModel = "nousresearch/hermes-3-llama-3.1-405b";
                    } else if (provider === "openai") {
                      defaultUrl = "https://api.openai.com/v1";
                      defaultModel = "gpt-4o-mini";
                    } else if (provider === "anthropic") {
                      // claude-3-5-sonnet-20241022 was retired 2025-10-28; see
                      // https://platform.claude.com/docs/en/about-claude/model-deprecations
                      defaultUrl = "https://api.anthropic.com/v1";
                      defaultModel = "claude-sonnet-5";
                    } else if (provider === "gemini") {
                      // Gemini's native REST API has no /chat/completions route — Google's
                      // OpenAI-compatibility layer lives under a separate /openai path.
                      // gemini-2.0-flash is the recommended stable production model as of 2026.
                      // Use fetchAvailableModels to discover all current models for your key.
                      defaultUrl = "https://generativelanguage.googleapis.com/v1beta/openai";
                      defaultModel = "gemini-2.0-flash";
                    }

                    updateSettings({
                      aiProvider: provider,
                      aiBaseUrl: defaultUrl,
                      aiModelName: defaultModel,
                    });
                  }}
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent cursor-pointer"
                >
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
                {(settings.aiProvider === "gemini" || settings.aiProvider === "openrouter") && (
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

              {/* ─── OpenCode Agent ──────────────────────────────── */}
              <div className="pt-4 border-t border-border/40 space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-white">🤖 OpenCode Agent</h4>
                  <p className="text-[10px] text-muted mt-0.5">
                    Settings for the OpenCode Agent tab. BYOK keys are injected from above at launch — no separate key configuration needed.
                  </p>
                </div>

                {/* Install status */}
                <div className="flex items-center justify-between py-1">
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-text">OpenCode Status</label>
                    <span className="text-[10px] text-muted">
                      {(() => {
                        // Detect platform for the correct install command
                        const isWin = navigator.userAgent.toLowerCase().includes("windows");
                        return isWin ? "Install: winget install OpenCode.OpenCode" : "Install: curl -fsSL https://opencode.ai/install | bash";
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

                {/* Auto-start toggle */}
                <div className="flex items-center justify-between py-1">
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-white">Auto-start on Agent Tab Switch</label>
                    <span className="text-[10px] text-muted">Automatically start opencode serve when you switch to the Agent tab.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.opencodeAutoStart}
                    onChange={(e) => updateSettings({ opencodeAutoStart: e.target.checked })}
                    className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                  />
                </div>
              </div>
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
                <p><span className="text-muted">Version:</span> <span className="text-text">1.2.5</span></p>
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
