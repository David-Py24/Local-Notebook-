import { useState, useRef, useEffect } from "react";
import { useStore } from "../stores/useStore";
import { getPlatformInstallCmd } from "../services/opencodeClient";
import SessionContextMenu from "./SessionContextMenu";
import { ChatContainer } from "./chat/ChatContainer";
import { Composer } from "./chat/Composer";
import { ApproveGateCard } from "./chat/ApproveGateCard";
import { FluxMark } from "./chat/FluxMark";

// Layout shell for the fused assistant (OpenChamber-style redesign). Header + sessions
// menu + options menu + goal bar + perspectives stay here; the message list, approval
// gate and composer live in src/components/chat/*. Every engine renders through the same
// parts pipeline (ChatContainer/Composer) — only the header dot/placeholder differ.
export default function AssistantPanel() {
  const clearAssistantMessages = useStore((s) => s.clearAssistantMessages);
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
  const agentSessions = useStore((s) => s.agentSessions);
  const activeAgentSessionId = useStore((s) => s.activeAgentSessionId);
  const loadAgentSessions = useStore((s) => s.loadAgentSessions);
  const createAgentSession = useStore((s) => s.createAgentSession);
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

  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showSessionsMenu, setShowSessionsMenu] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(assistantTopicTitle);
  const [perspectiveRunning, setPerspectiveRunning] = useState(false);
  const [perspStatus, setPerspStatus] = useState<string | null>(null);
  const [openContextMenuSessionId, setOpenContextMenuSessionId] = useState<string | null>(null);
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);

  const optionsMenuRef = useRef<HTMLDivElement | null>(null);
  const sessionsMenuRef = useRef<HTMLDivElement | null>(null);

  // Outside click handlers for the header dropdowns.
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(e.target as Node)) {
        setShowOptionsMenu(false);
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

  // Phase 4 "Perspectives + Fusion": run N sequential framing goal-loops on the active
  // note, save each draft as an artifact, then fuse into one balanced vault note.
  const handleRunPerspectives = async () => {
    if (perspectiveRunning) return;
    const st = useStore.getState();
    const isLeft = st.activePanel === "left";
    const content = (isLeft ? st.leftDraft : st.rightDraft) ?? "";
    if (!content.trim()) {
      setPerspStatus("Open a note first — Perspectives analyzes the active note.");
      return;
    }
    const rawTitle = (isLeft ? st.activeLeftTabId : st.activeRightTabId)?.split(/[\\/]/).pop() ?? "Topic";
    const title = rawTitle.replace(/\.md$/i, "");
    setPerspectiveRunning(true);
    setPerspStatus("🧭 Analyzing the note from multiple angles… (sequential runs)");
    try {
      const { runPerspectives } = await import("../services/perspectives");
      const result = await runPerspectives({ topic: content, topicTitle: title });
      let msg = `Perspectives done: ${result.drafts.length} draft${result.drafts.length === 1 ? "" : "s"} in Artifacts.`;
      if (result.fusedNotePath) {
        msg += ` Balanced note: ${result.fusedNotePath}`;
        st.openFile(result.fusedNotePath).catch(() => {});
        st.refreshExplorer().catch(() => {});
      } else if (result.fusionArtifactId) {
        msg += " Balanced view saved as an artifact.";
      }
      if (result.error) msg += ` ${result.error}`;
      setPerspStatus(msg);
    } catch (err) {
      setPerspStatus(`Perspectives failed: ${String(err)}`);
    } finally {
      setPerspectiveRunning(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden panel-rounded border border-border/60 bg-card">
      {/* Top Header */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <FluxMark className="h-4 w-4 shrink-0 text-accent" />
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
            <div className="relative flex min-w-0 items-center gap-1">
              <h2
                onDoubleClick={() => {
                  setTitleDraft(assistantTopicTitle);
                  setIsEditingTitle(true);
                }}
                title="Double click to rename topic"
                className="truncate text-[11px] font-medium tracking-wide text-muted cursor-pointer select-none hover:text-text"
              >
                {assistantTopicTitle}
              </h2>
              {activeAgentSessionId && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenContextMenuSessionId(
                        openContextMenuSessionId === activeAgentSessionId ? null : activeAgentSessionId
                      );
                    }}
                    className="shrink-0 rounded p-0.5 text-muted hover:text-text cursor-pointer transition-colors"
                    title="Active Session Options"
                  >
                    <svg className="h-3 w-3 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                      <circle cx="12" cy="12" r="1" />
                      <circle cx="12" cy="5" r="1" />
                      <circle cx="12" cy="19" r="1" />
                    </svg>
                  </button>
                  <SessionContextMenu
                    sessionId={activeAgentSessionId}
                    isOpen={openContextMenuSessionId === activeAgentSessionId}
                    onClose={() => setOpenContextMenuSessionId(null)}
                    onTriggerRename={() => {
                      setTitleDraft(assistantTopicTitle);
                      setIsEditingTitle(true);
                    }}
                    align="left"
                  />
                </>
              )}
            </div>
          )}
        </div>

        {/* Header Right Actions */}
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="flex items-center gap-1 pl-0.5">
            {/* Engine status dot */}
            {engine === "opencode" && (
              <div
                className={`h-1.5 w-1.5 rounded-full ${
                  opencodeStatus === "ready"
                    ? "bg-chat-tool-ok"
                    : opencodeStatus === "error"
                      ? "bg-chat-tool-error"
                      : opencodeStatus === "starting"
                        ? "bg-chat-warn animate-pulse"
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
              className={`h-1.5 w-1.5 rounded-full ${settings.aiEnabled ? "bg-chat-tool-running" : "bg-border"}`}
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
              <svg className="h-3.5 w-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <rect x="3" y="4" width="18" height="14" rx="2" />
                <path d="M8 21h8M9 8.5l2 2 4-4" />
              </svg>
            </button>

            {showSessionsMenu && (
              <div className="absolute right-0 top-7 z-30 flex w-64 flex-col rounded-xl border border-border/60 bg-card p-1 text-xs text-text shadow-xl">
                <div className="flex items-center justify-between px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase text-muted">
                  <span>Agent Sessions</span>
                  <span className="normal-case font-normal text-muted/70">{agentSessions.length}</span>
                </div>
                <button
                  onClick={handleNewSession}
                  className="mx-2 mb-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-center text-[11px] font-medium text-white hover:opacity-90 cursor-pointer transition-opacity"
                >
                  + New Session
                </button>
                <div className="my-0.5 h-px bg-border/50" />
                <div className="max-h-56 overflow-y-auto scrollbar-thin">
                  {agentSessions.length === 0 ? (
                    <div className="px-2.5 py-2 text-[10px] text-muted">No saved sessions yet.</div>
                  ) : (
                    agentSessions.map((sess) => (
                      <div
                        key={sess.id}
                        onMouseEnter={() => setHoveredSessionId(sess.id)}
                        onMouseLeave={() => setHoveredSessionId(null)}
                        className={`group relative flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors ${
                          sess.id === activeAgentSessionId ? "bg-bg/60" : "hover:bg-bg/40"
                        }`}
                        onClick={() => handleResumeSession(sess.id)}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[11px] text-text">
                            {sess.parentId && <span className="mr-1 text-muted">↳</span>}
                            {sess.title || "Untitled session"}
                          </div>
                          <div className="truncate text-[9px] text-muted">
                            {sess.engine || "opencode"} · {sess.agent || sess.model || "build"} · {sess.status}
                          </div>
                        </div>

                        {/* Hover Peek Preview Card ("sneak conversation") */}
                        {hoveredSessionId === sess.id && openContextMenuSessionId !== sess.id && (
                          <div
                            className="pointer-events-auto absolute right-full top-0 z-50 mr-2 w-64 space-y-2 rounded-xl border border-border/70 bg-card p-3 text-xs shadow-2xl select-none"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-start justify-between gap-1 border-b border-border/50 pb-1.5">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[11px] font-semibold text-text">{sess.title || "Untitled session"}</p>
                                <p className="mt-0.5 truncate text-[9.5px] text-muted">
                                  {sess.engine || "opencode"} · {sess.model || "build"} · {sess.status}
                                </p>
                              </div>
                              <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-medium text-accent">
                                Peek 👁️
                              </span>
                            </div>

                            {/* Message Sneak Preview */}
                            <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg bg-bg/50 p-2 text-[10.5px] text-text/80">
                              {sess.summary ? (
                                <p className="line-clamp-4 leading-relaxed text-muted/90">{sess.summary}</p>
                              ) : sess.context ? (
                                <div className="space-y-1">
                                  <p className="text-[9px] font-semibold uppercase tracking-wide text-accent/80">Context Snapshot</p>
                                  <p className="line-clamp-4 font-mono text-[10px] leading-relaxed text-muted/90">
                                    {sess.context.length > 200 ? sess.context.slice(0, 200) + "…" : sess.context}
                                  </p>
                                </div>
                              ) : (
                                <p className="text-[10px] italic text-muted/60">No conversation transcript cached for preview.</p>
                              )}
                            </div>

                            {/* Footer Quick Actions */}
                            <div className="flex items-center justify-between border-t border-border/40 pt-1 text-[9.5px] text-muted">
                              <span>{sess.tokens ? `${Math.round(sess.tokens / 1000)}k tokens` : "0 tokens"}</span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleForkSession(sess.id);
                                  }}
                                  className="rounded border border-border/60 bg-bg/40 px-1.5 py-0.5 text-text hover:bg-bg cursor-pointer transition-colors"
                                >
                                  Fork
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleResumeSession(sess.id);
                                  }}
                                  className="rounded bg-accent px-1.5 py-0.5 font-medium text-white hover:opacity-90 cursor-pointer transition-opacity"
                                >
                                  Open
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Session options button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenContextMenuSessionId(openContextMenuSessionId === sess.id ? null : sess.id);
                          }}
                          className="shrink-0 rounded p-0.5 text-muted opacity-0 transition-all group-hover:opacity-100 hover:text-text cursor-pointer"
                          title="Session Options"
                        >
                          <svg className="h-3 w-3 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                            <circle cx="12" cy="12" r="1" />
                            <circle cx="12" cy="5" r="1" />
                            <circle cx="12" cy="19" r="1" />
                          </svg>
                        </button>

                        <SessionContextMenu
                          sessionId={sess.id}
                          isOpen={openContextMenuSessionId === sess.id}
                          onClose={() => setOpenContextMenuSessionId(null)}
                          onTriggerRename={() => {
                            if (sess.id === activeAgentSessionId) {
                              setTitleDraft(sess.title || assistantTopicTitle);
                              setIsEditingTitle(true);
                            }
                          }}
                          align="right"
                        />
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
              <svg className="h-3.5 w-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </button>

            {showOptionsMenu && (
              <div className="absolute right-0 top-7 z-30 flex w-48 flex-col rounded-xl border border-border/60 bg-card p-1 text-xs text-text shadow-xl">
                <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase text-muted">Engine</div>
                <div className="mx-2 mb-1.5 flex items-center rounded-full border border-border/50 bg-bg/30 p-0.5">
                  <button
                    onClick={() => handleEngineSelect("opencode")}
                    title="OpenCode engine (primary) — agentic; falls back to BYOK if unavailable"
                    className={`flex-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
                      engine === "opencode" ? "bg-accent text-white" : "text-muted hover:text-text"
                    }`}
                  >
                    OpenCode
                  </button>
                  <button
                    onClick={() => handleEngineSelect("byok")}
                    title="BYOK engine — direct API (Ollama / OpenAI / Anthropic / Gemini)"
                    className={`flex-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
                      engine === "byok" ? "bg-accent text-white" : "text-muted hover:text-text"
                    }`}
                  >
                    BYOK
                  </button>
                </div>
                <div className="my-0.5 h-px bg-border/50" />
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
                  className="rounded-lg px-2.5 py-1.5 text-left text-chat-tool-error hover:bg-chat-tool-error/10 cursor-pointer transition-colors"
                >
                  Clear Chat
                </button>
                <div className="my-0.5 h-px bg-border/50" />
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
        <div className="mx-3 mb-2 flex shrink-0 items-center justify-between gap-2 rounded-xl border border-chat-warn/25 bg-chat-warn/[0.06] px-3.5 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-chat-warn">OpenCode not found</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
              Install it to power the assistant — your BYOK keys will be used as fallback automatically.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <code className="rounded-md border border-chat-warn/30 bg-bg/60 px-1.5 py-0.5 font-mono text-[10px] text-accent select-all">
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

      {/* Messages stream (engine-agnostic OpenChamber-style chat) */}
      <ChatContainer />

      {/* Pending file-tool approval gate (shared PermissionCard analog) */}
      <ApproveGateCard />

      {/* Goal mode bar (AGENTIC_ORCHESTRATION_PLAN.md Phase 2) */}
      <div className="shrink-0 px-3 pb-1">
        {goalRunning && agentRun ? (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-chat-tool-running/30 bg-chat-tool-running/[0.06] px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-chat-tool-running">
                {goalPaused ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-chat-warn" />
                    Paused
                  </>
                ) : (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-chat-tool-running animate-pulse" />
                    Goal running
                  </>
                )}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-text">{agentRun.goal}</p>
              <p className="mt-0.5 text-[9px] text-muted">
                iter {agentRun.iterations} · strikes {agentRun.stuckStrikes}/3 ·{" "}
                {Math.round(agentRun.tokenEstimate / 1000)}k est tokens
                {agentRun.lastVerdict && <span className="ml-1 text-muted/80">· {agentRun.lastVerdict.verdict}</span>}
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
                className="rounded-full bg-chat-tool-error px-2.5 py-1 text-[10px] font-medium text-white hover:opacity-90 cursor-pointer transition-opacity"
              >
                Stop
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-1 rounded-xl border border-border/50 bg-bg/40 px-2 py-1">
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <svg className="h-3 w-3 text-muted shrink-0" viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor">
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
                placeholder="Arm a study goal..."
                className="min-w-0 flex-1 bg-transparent text-[10.5px] text-text outline-none placeholder:text-muted/50"
              />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => {
                  startGoalRun(goalInput);
                  setGoalInput("");
                }}
                disabled={!goalInput.trim()}
                className="shrink-0 rounded-full border border-border/50 bg-bg/60 px-2 py-0.5 text-[9.5px] font-medium text-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer transition-colors"
              >
                Run
              </button>
              <button
                onClick={() => handleRunPerspectives()}
                disabled={perspectiveRunning}
                title="Analyze the active note from five angles, then fuse into one balanced note"
                className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[9.5px] font-medium text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer transition-colors"
              >
                {perspectiveRunning ? "Perspectives…" : "🧭 Perspectives"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Perspectives status line (Phase 4) */}
      {perspStatus && (
        <div className="shrink-0 px-3 pb-1">
          <p className="rounded-xl border border-accent/20 bg-accent/[0.05] px-3 py-1.5 text-[10.5px] leading-relaxed text-text/80">
            {perspStatus}
          </p>
        </div>
      )}

      {/* Composer (engine-agnostic) */}
      <Composer />
    </div>
  );
}