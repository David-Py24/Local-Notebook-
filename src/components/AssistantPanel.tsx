import { useState, useRef, useEffect } from "react";
import { useStore } from "../stores/useStore";
import ReactMarkdown from "react-markdown";
import { PROVIDER_PRESETS, getProviderPreset } from "../services/providerPresets";
import { getPlatformInstallCmd } from "../services/opencodeClient";

export default function AssistantPanel() {
  const assistantMessages = useStore((s) => s.assistantMessages);
  const sendAssistantMessage = useStore((s) => s.sendAssistantMessage);
  const cancelAssistantMessage = useStore((s) => s.cancelAssistantMessage);
  const clearAssistantMessages = useStore((s) => s.clearAssistantMessages);
  const isAssistantStreaming = useStore((s) => s.isAssistantStreaming);
  const assistantStatusText = useStore((s) => s.assistantStatusText);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const assistantTopicTitle = useStore((s) => s.assistantTopicTitle);
  const setAssistantTopicTitle = useStore((s) => s.setAssistantTopicTitle);
  const toggleAssistantPanel = useStore((s) => s.toggleAssistantPanel);
  const checkOpencodeInstalled = useStore((s) => s.checkOpencodeInstalled);
  const stopOpencodeServer = useStore((s) => s.stopOpencodeServer);
  const opencodeInstalled = useStore((s) => s.opencodeInstalled);
  const opencodeServerPid = useStore((s) => s.opencodeServerPid);
  const opencodeStatus = useStore((s) => s.opencodeStatus);
  const pendingToolApprovals = useStore((s) => s.pendingToolApprovals);
  const resolveToolApproval = useStore((s) => s.resolveToolApproval);
  const clearToolApproval = useStore((s) => s.clearToolApproval);
  const agentSessions = useStore((s) => s.agentSessions);
  const activeAgentSessionId = useStore((s) => s.activeAgentSessionId);
  const loadAgentSessions = useStore((s) => s.loadAgentSessions);
  const createAgentSession = useStore((s) => s.createAgentSession);
  const archiveAgentSession = useStore((s) => s.archiveAgentSession);
  const forkAgentSession = useStore((s) => s.forkAgentSession);
  const patchAgentSession = useStore((s) => s.patchAgentSession);
  const setActiveAgentSession = useStore((s) => s.setActiveAgentSession);
  const agentRun = useStore((s) => s.agentRun);
  const goalRunning = useStore((s) => s.goalRunning);
  const goalPaused = useStore((s) => s.goalPaused);
  const startGoalRun = useStore((s) => s.startGoalRun);
  const stopGoalRun = useStore((s) => s.stopGoalRun);
  const pauseGoalRun = useStore((s) => s.pauseGoalRun);
  const resumeGoalRun = useStore((s) => s.resumeGoalRun);

  const engine = settings.assistantEngine;

  const [inputVal, setInputVal] = useState("");
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showSessionsMenu, setShowSessionsMenu] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(assistantTopicTitle);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const modelDropdownRef = useRef<HTMLDivElement | null>(null);
  const optionsMenuRef = useRef<HTMLDivElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const sessionsMenuRef = useRef<HTMLDivElement | null>(null);

  const modelsList = [
    ...PROVIDER_PRESETS.map((p) => ({ id: p.id, model: p.defaultModel, name: p.name, icon: p.icon, desc: p.desc })),
    { id: "custom", model: settings.aiModelName || "custom-model", name: "Custom Endpoint", icon: "⚙️", desc: "vLLM / LM Studio / Local Proxy" },
  ];

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [assistantMessages]);

  // Outside click handlers
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(e.target as Node)) {
        setShowOptionsMenu(false);
      }
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
      if (sessionsMenuRef.current && !sessionsMenuRef.current.contains(e.target as Node)) {
        setShowSessionsMenu(false);
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Keep the fused panel's engine consistent: start/stop the opencode server
  // based on the selected engine, and refresh install status for the OpenCode path.
  useEffect(() => {
    if (engine === "opencode") {
      checkOpencodeInstalled();
      if (settings.opencodeAutoStart && opencodeInstalled && opencodeServerPid === null) {
        useStore.getState().ensureOpencodeReady().catch(() => {});
      }
    } else if (opencodeServerPid !== null) {
      stopOpencodeServer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, opencodeInstalled]);

  // Load persisted agent sessions once on mount.
  useEffect(() => {
    loadAgentSessions().catch(() => {});
  }, [loadAgentSessions]);

  // Stop the opencode server when the panel unmounts (same lifecycle as the old Agent view).
  useEffect(() => {
    return () => {
      const pid = useStore.getState().opencodeServerPid;
      if (pid !== null) useStore.getState().stopOpencodeServer();
    };
  }, []);

  const handleEngineSelect = (next: "opencode" | "byok") => {
    if (next === engine) return;
    updateSettings({ assistantEngine: next });
    if (next === "opencode") {
      checkOpencodeInstalled();
    } else if (opencodeServerPid !== null) {
      stopOpencodeServer();
    }
  };

  const handleSend = () => {
    if (!inputVal.trim()) return;
    sendAssistantMessage(inputVal);
    setInputVal("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTitleSubmit = () => {
    if (titleDraft.trim()) {
      setAssistantTopicTitle(titleDraft.trim());
      if (activeAgentSessionId) {
        patchAgentSession(activeAgentSessionId, { title: titleDraft.trim() });
      }
    }
    setIsEditingTitle(false);
  };

  const handleNewSession = () => {
    createAgentSession({
      title: `Session ${agentSessions.length + 1}`,
      engine,
      agent: engine === "opencode" ? "build" : null,
    }).then((s) => {
      if (s) setAssistantTopicTitle(s.title ?? "Untitled session");
    });
    setShowSessionsMenu(false);
  };

  const handleResumeSession = (id: string) => {
    const s = agentSessions.find((x) => x.id === id);
    if (s) {
      setActiveAgentSession(id);
      if (s.title) setAssistantTopicTitle(s.title);
    }
    setShowSessionsMenu(false);
  };

  const handleForkSession = (id: string) => {
    forkAgentSession(id).then((child) => {
      if (child) {
        setActiveAgentSession(child.id);
        setAssistantTopicTitle(child.title ?? "Untitled fork");
      }
    });
    setShowSessionsMenu(false);
  };

  const handleAttachContext = (contextType: string) => {
    if (contextType === "active_file") {
      const activeFile = useStore.getState().activeLeftTabId || useStore.getState().activeRightTabId;
      if (activeFile) {
        const name = activeFile.split(/[\\/]/).pop();
        setInputVal((prev) => prev + ` @[${name}] `);
      }
    } else if (contextType === "folder") {
      const folder = useStore.getState().currentFolderPath;
      if (folder) {
        const name = folder.split(/[\\/]/).pop();
        setInputVal((prev) => prev + ` @folder/${name} `);
      }
    }
    setShowAttachMenu(false);
    textareaRef.current?.focus();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden panel-rounded border border-border/60 bg-card">
      {/* Top Header */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FluxMark className="h-4 w-4 text-accent shrink-0" />
          {isEditingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTitleSubmit()}
              onBlur={handleTitleSubmit}
              className="min-w-0 flex-1 rounded border border-border bg-bg/80 px-2 py-0.5 text-xs text-white outline-none"
            />
          ) : (
            <h2
              onDoubleClick={() => {
                setTitleDraft(assistantTopicTitle);
                setIsEditingTitle(true);
              }}
              title="Double click to rename topic"
              className="truncate text-[11px] font-medium tracking-wide text-muted select-none cursor-pointer hover:text-text"
            >
              {assistantTopicTitle}
            </h2>
          )}
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1 pl-0.5">
            {/* Engine status dot */}
            {engine === "opencode" && (
              <div
                className={`h-1.5 w-1.5 rounded-full ${
                  opencodeStatus === "ready"
                    ? "bg-emerald-500"
                    : opencodeStatus === "error"
                      ? "bg-red-500"
                      : opencodeStatus === "starting"
                        ? "bg-amber-400 animate-pulse"
                        : "bg-border"
                }`}
                title={
                  opencodeStatus === "ready"
                    ? "OpenCode ready"
                    : opencodeStatus === "error"
                      ? "OpenCode error"
                      : opencodeStatus === "starting"
                        ? "Starting OpenCode..."
                        : "OpenCode idle"
                }
              />
            )}
            {/* Memory-RAG status dot (M6 UX) */}
            <div
              className={`h-1.5 w-1.5 rounded-full ${
                settings.aiEnabled ? "bg-sky-500" : "bg-border"
              }`}
              title={
                settings.aiEnabled
                  ? `Memory-RAG on · ${settings.embedModel || "nomic-embed-text"} @ ${settings.embedBaseUrl || "localhost:11434"}`
                  : "AI disabled — Memory-RAG off"
              }
            />
          </div>

          {/* Sessions Menu (Persistent Agent Sessions) */}
          <div className="relative" ref={sessionsMenuRef}>
            <button
              onClick={() => setShowSessionsMenu(!showSessionsMenu)}
              className="rounded-full p-1 text-muted hover:bg-bg/60 hover:text-text cursor-pointer transition-colors"
              title="Agent Sessions"
            >
              <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <rect x="3" y="4" width="18" height="14" rx="2" />
                <path d="M8 21h8M9 8.5l2 2 4-4" />
              </svg>
            </button>

            {showSessionsMenu && (
              <div className="absolute right-0 top-7 z-30 flex w-64 flex-col rounded-xl border border-border/60 bg-card p-1 text-xs text-text shadow-xl">
                <div className="px-2.5 pt-1 pb-1.5 text-[10px] font-semibold uppercase text-muted flex items-center justify-between">
                  <span>Agent Sessions</span>
                  <span className="text-muted/70 normal-case font-normal">{agentSessions.length}</span>
                </div>
                <button
                  onClick={handleNewSession}
                  className="mx-2 mb-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-center text-[11px] font-medium text-white hover:opacity-90 cursor-pointer transition-opacity"
                >
                  + New Session
                </button>
                <div className="h-px bg-border/50 my-0.5" />
                <div className="max-h-56 overflow-y-auto scrollbar-thin">
                  {agentSessions.length === 0 ? (
                    <div className="px-2.5 py-2 text-[10px] text-muted">No saved sessions yet.</div>
                  ) : (
                    agentSessions.map((sess) => (
                      <div
                        key={sess.id}
                        className={`group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 cursor-pointer transition-colors ${
                          sess.id === activeAgentSessionId ? "bg-bg/60" : "hover:bg-bg/40"
                        }`}
                        onClick={() => handleResumeSession(sess.id)}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[11px] text-text">
                            {sess.parentId && <span className="text-muted mr-1">↳</span>}
                            {sess.title || "Untitled session"}
                          </div>
                          <div className="truncate text-[9px] text-muted">
                            {sess.engine || "opencode"} · {sess.agent || sess.model || "build"} ·{" "}
                            {sess.status}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleForkSession(sess.id);
                          }}
                          className="shrink-0 rounded p-0.5 text-muted opacity-0 group-hover:opacity-100 hover:text-accent cursor-pointer transition-all"
                          title="Fork session (child inherits context, keeps lineage)"
                        >
                          <svg className="w-3 h-3 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                            <path d="M4 7h10M14 7v10M18 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM14 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            archiveAgentSession(sess.id);
                          }}
                          className="shrink-0 rounded p-0.5 text-muted opacity-0 group-hover:opacity-100 hover:text-red-400 cursor-pointer transition-all"
                          title="Archive session"
                        >
                          <svg className="w-3 h-3 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                            <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                          </svg>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Options Menu (Three Dots) */}
          <div className="relative" ref={optionsMenuRef}>
            <button
              onClick={() => setShowOptionsMenu(!showOptionsMenu)}
              className="rounded-full p-1 text-muted hover:bg-bg/60 hover:text-text cursor-pointer transition-colors"
              title="Assistant Options"
            >
              <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </button>

            {showOptionsMenu && (
              <div className="absolute right-0 top-7 z-30 flex w-48 flex-col rounded-xl border border-border/60 bg-card p-1 text-xs text-text shadow-xl">
                <div className="px-2.5 pt-1 pb-1.5 text-[10px] font-semibold uppercase text-muted">Engine</div>
                <div className="flex items-center rounded-full border border-border/50 bg-bg/30 p-0.5 mx-2 mb-1.5">
                  <button
                    onClick={() => handleEngineSelect("opencode")}
                    title="OpenCode engine (primary) — agentic; falls back to BYOK if unavailable"
                    className={`flex-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
                      engine === "opencode"
                        ? "bg-accent text-white"
                        : "text-muted hover:text-text"
                    }`}
                  >
                    OpenCode
                  </button>
                  <button
                    onClick={() => handleEngineSelect("byok")}
                    title="BYOK engine — direct API (Ollama / OpenAI / Anthropic / Gemini)"
                    className={`flex-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
                      engine === "byok"
                        ? "bg-accent text-white"
                        : "text-muted hover:text-text"
                    }`}
                  >
                    BYOK
                  </button>
                </div>
                <div className="h-px bg-border/50 my-0.5" />
                <button
                  onClick={() => {
                    setTitleDraft(assistantTopicTitle);
                    setIsEditingTitle(true);
                    setShowOptionsMenu(false);
                  }}
                  className="rounded-lg px-2.5 py-1.5 text-left hover:bg-bg/70 cursor-pointer transition-colors"
                >
                  Rename Topic
                </button>
                <button
                  onClick={() => {
                    clearAssistantMessages();
                    setShowOptionsMenu(false);
                  }}
                  className="rounded-lg px-2.5 py-1.5 text-left text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors"
                >
                  Clear Chat
                </button>
                <div className="h-px bg-border/50 my-0.5" />
                <button
                  onClick={() => {
                    toggleAssistantPanel();
                    setShowOptionsMenu(false);
                  }}
                  className="rounded-lg px-2.5 py-1.5 text-left text-muted hover:bg-bg/70 cursor-pointer transition-colors"
                >
                  Hide Panel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* OpenCode not installed banner */}
      {engine === "opencode" && !opencodeInstalled && (
        <div className="shrink-0 mx-3 mb-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-amber-300">OpenCode not found</p>
            <p className="text-[10px] text-muted mt-0.5 leading-relaxed">
              Install it to power the assistant — your BYOK keys will be used as fallback automatically.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <code className="rounded-md border border-amber-500/30 bg-bg/60 px-1.5 py-0.5 font-mono text-[10px] text-accent select-all">
              {getPlatformInstallCmd()}
            </code>
            <button
              onClick={() => checkOpencodeInstalled()}
              className="rounded-md border border-border/50 bg-bg/40 px-2 py-1 text-[10px] text-text hover:text-white cursor-pointer transition-colors"
            >
              Recheck
            </button>
          </div>
        </div>
      )}

      {/* Messages Stream (fused: both engines render here) */}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 scrollbar-thin">
        {assistantMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center px-6 select-none">
            <FluxMark className="h-11 w-11 text-accent/80 mb-3" />
            <p className="text-sm font-semibold text-text tracking-tight">
              {engine === "opencode" ? "OpenCode Agent" : "Study Assistant"}
            </p>
            <p className="text-[11px] text-muted mt-1.5 max-w-[230px] leading-relaxed">
              {engine === "opencode"
                ? "Ask it to write, edit, or refactor notes in your workspace."
                : "Ask questions about your notes, summarize sources, or plan your study."}
            </p>
          </div>
        ) : (
          assistantMessages.map((msg) =>
            msg.role === "user" ? (
              <div key={msg.id} className="flex flex-col items-start">
                <span className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted/70">User</span>
                <div className="max-w-[88%] border-l-2 border-accent/40 pl-3 text-xs text-text leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div key={msg.id} className="flex flex-col items-end">
                <span className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted/70">Agent</span>
                <div className="max-w-[88%] border-r-2 border-border pr-3 text-right text-xs text-text/85 leading-relaxed markdown-preview">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            )
          )
        )}
        {assistantStatusText && (
          <div className="flex items-center gap-2 text-[11px] text-muted font-medium w-fit">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            <span>{assistantStatusText}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending file-tool approval gate (Phase 2b) */}
      {pendingToolApprovals.length > 0 && (
        <div className="space-y-2 px-3 pb-1">
          {pendingToolApprovals
            .filter((p) => p.status === "pending")
            .map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-3 py-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-medium text-amber-300">
                    <span className="uppercase tracking-wide text-[10px]">AI wants to change your files</span>
                  </div>
                  <p className="mt-0.5 text-text/80 leading-relaxed break-words">{p.summary}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => {
                      resolveToolApproval(p.id, "approved");
                      setTimeout(() => clearToolApproval(p.id), 1200);
                    }}
                    className="rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-400 cursor-pointer transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      resolveToolApproval(p.id, "rejected");
                      clearToolApproval(p.id);
                    }}
                    className="rounded-full border border-border/60 bg-bg/60 px-2.5 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors"
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Goal mode bar (AGENTIC_ORCHESTRATION_PLAN.md Phase 2) */}
      <div className="shrink-0 px-3 pb-1">
        {goalRunning && agentRun ? (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-accent/30 bg-accent/[0.06] px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                {goalPaused ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    Paused
                  </>
                ) : (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                    Goal running
                  </>
                )}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-text">{agentRun.goal}</p>
              <p className="mt-0.5 text-[9px] text-muted">
                iter {agentRun.iterations} · strikes {agentRun.stuckStrikes}/3 ·{" "}
                {Math.round(agentRun.tokenEstimate / 1000)}k est tokens
                {agentRun.lastVerdict && (
                  <span className="ml-1 text-muted/80">· {agentRun.lastVerdict.verdict}</span>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {goalPaused ? (
                <button
                  onClick={resumeGoalRun}
                  className="rounded-full bg-accent px-2.5 py-1 text-[10px] font-medium text-white hover:opacity-90 cursor-pointer transition-opacity"
                >
                  Resume
                </button>
              ) : (
                <button
                  onClick={pauseGoalRun}
                  className="rounded-full border border-border/60 bg-bg/60 px-2.5 py-1 text-[10px] font-medium text-text hover:text-white cursor-pointer transition-colors"
                >
                  Pause
                </button>
              )}
              <button
                onClick={stopGoalRun}
                className="rounded-full bg-red-500 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-red-400 cursor-pointer transition-colors"
              >
                Stop
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1 flex-wrap">
            <svg className="w-3 h-3 text-muted" viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <input
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  startGoalRun(goalInput);
                  setGoalInput("");
                }
              }}
              placeholder="Arm a study goal — the agent runs until an auditor calls it done (or budget/strikes block it)"
              className="min-w-0 flex-1 bg-transparent text-[11px] text-text placeholder:text-muted/50 outline-none"
            />
            <button
              onClick={() => {
                startGoalRun(goalInput);
                setGoalInput("");
              }}
              disabled={!goalInput.trim()}
              className="shrink-0 rounded-full border border-border/50 bg-bg/40 px-2.5 py-0.5 text-[10px] font-medium text-accent hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              Run
            </button>
          </div>
        )}
      </div>

      {/* Bottom Input Area (shared) */}
      <div className="px-3 pb-3 pt-1">
        <div className="flex flex-col rounded-3xl border border-border/50 bg-bg/50 px-4 py-3 focus-within:border-accent/50 transition-colors">
          {/* Text Area */}
          <textarea
            ref={textareaRef}
            rows={2}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              engine === "opencode"
                ? "Ask the OpenCode agent to write, edit, or explain code..."
                : "Ask anything..."
            }
            className="w-full resize-none bg-transparent text-xs text-text placeholder:text-muted/50 outline-none leading-relaxed"
          />

          {/* Bottom Toolbar */}
          <div className="mt-1 flex items-center justify-between">
            {/* Left toolbar items */}
            <div className="flex items-center gap-1.5">
              {engine === "opencode" ? (
                <span className="text-[10px] font-medium text-muted">
                  OpenCode · file edit · LSP
                </span>
              ) : (
                <>
                  {/* Attach Context Button (+) */}
                  <div className="relative" ref={attachMenuRef}>
                    <button
                      onClick={() => setShowAttachMenu(!showAttachMenu)}
                      title="Add context attachment"
                      className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:text-text hover:bg-bg/60 cursor-pointer transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>

                    {showAttachMenu && (
                      <div className="absolute bottom-8 left-0 z-30 flex w-44 flex-col rounded-xl border border-border/60 bg-card p-1 text-xs text-text shadow-xl">
                        <button
                          onClick={() => handleAttachContext("active_file")}
                          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-bg/70 cursor-pointer transition-colors"
                        >
                          <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          </svg>
                          Active Note Context
                        </button>
                        <button
                          onClick={() => handleAttachContext("folder")}
                          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-bg/70 cursor-pointer transition-colors"
                        >
                          <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                          </svg>
                          Vault Workspace
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Model Dropdown Pill Badge */}
                  <div className="relative" ref={modelDropdownRef}>
                    <button
                      onClick={() => setShowModelDropdown(!showModelDropdown)}
                      className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-muted hover:text-text hover:bg-bg/60 cursor-pointer transition-colors"
                    >
                      <span className="text-[10px] text-accent font-bold">
                        {modelsList.find((m) => m.id === settings.aiProvider)?.icon || "🦙"}
                      </span>
                      <span className="truncate max-w-[100px]">{settings.aiModelName || "hermes3:8b"}</span>
                      <svg className="w-3 h-3 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>

                    {showModelDropdown && (
                      <div className="absolute bottom-8 left-0 z-30 flex w-56 flex-col rounded-xl border border-border/60 bg-card p-1 text-xs text-text shadow-xl">
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted">BYOK Fallback AI Engine & Model</div>
                        {modelsList.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => {
                              const defaultUrl = getProviderPreset(m.id)?.defaultBaseUrl ?? settings.aiBaseUrl;

                              updateSettings({
                                aiProvider: m.id,
                                aiModelName: m.model,
                                aiBaseUrl: defaultUrl,
                              });
                              setShowModelDropdown(false);
                            }}
                            className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left cursor-pointer transition-colors ${
                              settings.aiProvider === m.id ? "bg-accent text-white font-medium" : "hover:bg-bg/70 text-text/90"
                            }`}
                          >
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5 font-medium truncate">
                                <span>{m.icon}</span>
                                <span className="truncate">{m.name}</span>
                              </div>
                              <span className="text-[10px] text-muted leading-tight truncate">{m.desc}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Right: Send / Stop Button */}
            {isAssistantStreaming ? (
              <button
                onClick={cancelAssistantMessage}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/90 text-white hover:bg-red-500 cursor-pointer transition-all"
                title="Stop generating"
              >
                <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                  <rect x="5" y="5" width="14" height="14" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!inputVal.trim()}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-all ${
                  inputVal.trim()
                    ? "bg-accent text-white hover:bg-accent-hover cursor-pointer scale-100"
                    : "bg-border/40 text-muted cursor-not-allowed opacity-50"
                }`}
                title="Send message"
              >
                <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FluxMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 24h12a8 8 0 0 1 8 8v0a8 8 0 0 0 8 8h12" />
      <polyline points="44 32 52 40 44 48" />
      <path d="M52 40H40a8 8 0 0 1-8-8v0a8 8 0 0 0-8-8H12" />
      <polyline points="20 32 12 24 20 16" />
      <circle cx="12" cy="40" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}