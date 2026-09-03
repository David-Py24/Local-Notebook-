import { useState, useRef, useEffect } from "react";
import { useStore } from "../stores/useStore";
import ReactMarkdown from "react-markdown";
import OpenCodeView from "./OpenCodeView";

export default function AssistantPanel() {
  const assistantMessages = useStore((s) => s.assistantMessages);
  const sendAssistantMessage = useStore((s) => s.sendAssistantMessage);
  const clearAssistantMessages = useStore((s) => s.clearAssistantMessages);
  const isAssistantStreaming = useStore((s) => s.isAssistantStreaming);
  const assistantStatusText = useStore((s) => s.assistantStatusText);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const assistantTopicTitle = useStore((s) => s.assistantTopicTitle);
  const setAssistantTopicTitle = useStore((s) => s.setAssistantTopicTitle);
  const toggleAssistantPanel = useStore((s) => s.toggleAssistantPanel);
  const assistantMode = useStore((s) => s.assistantMode);
  const setAssistantMode = useStore((s) => s.setAssistantMode);
  const checkOpencodeInstalled = useStore((s) => s.checkOpencodeInstalled);
  const startOpencodeServer = useStore((s) => s.startOpencodeServer);
  const stopOpencodeServer = useStore((s) => s.stopOpencodeServer);
  const opencodeServerPid = useStore((s) => s.opencodeServerPid);

  const [inputVal, setInputVal] = useState("");
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(assistantTopicTitle);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const modelDropdownRef = useRef<HTMLDivElement | null>(null);
  const optionsMenuRef = useRef<HTMLDivElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);

  const modelsList = [
    { id: "ollama_hermes", model: "hermes3:8b", name: "Nous Hermes 3 (Local)", icon: "🦙", desc: "Offline function tool calling agent" },
    { id: "openrouter", model: "nousresearch/hermes-3-llama-3.1-405b", name: "Nous Hermes 3 (OpenRouter)", icon: "🌐", desc: "Online 405B reasoning & synthesis" },
    { id: "openai", model: "gpt-4o-mini", name: "OpenAI GPT-4o Mini", icon: "⚡", desc: "Fast & lightweight cloud reasoning" },
    { id: "anthropic", model: "claude-sonnet-5", name: "Claude Sonnet 5", icon: "✨", desc: "Deep study & synthesis model" },
    { id: "gemini", model: "gemini-2.0-flash", name: "Google Gemini", icon: "💎", desc: "Multimodal study tutor — Hermes tools compatible" },
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
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, []);

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
    }
    setIsEditingTitle(false);
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
    <div className="flex h-full flex-col overflow-hidden panel-rounded border border-border bg-card">
      {/* Top Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-3.5 py-2.5 bg-bg/20">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Mode Toggle Tabs */}
          <div className="flex items-center rounded-md border border-border/60 bg-bg/40 p-0.5 shrink-0">
            <button
              onClick={() => {
                setAssistantMode("study");
                if (opencodeServerPid !== null) stopOpencodeServer();
              }}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
                assistantMode === "study"
                  ? "bg-accent text-white"
                  : "text-muted hover:text-white"
              }`}
            >
              💬 Study
            </button>
            <button
              onClick={() => {
                setAssistantMode("opencode");
                checkOpencodeInstalled();
                if (opencodeServerPid === null) startOpencodeServer();
              }}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
                assistantMode === "opencode"
                  ? "bg-accent text-white"
                  : "text-muted hover:text-white"
              }`}
            >
              🤖 Agent
            </button>
          </div>

          {assistantMode === "study" && (
            <>
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
                  className="truncate text-xs font-semibold text-text select-none cursor-pointer hover:text-white"
                >
                  {assistantTopicTitle}
                </h2>
              )}
            </>
          )}
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Online indicator circle */}
          <div className="h-2 w-2 rounded-full border border-emerald-400/30 bg-emerald-500/80 shadow-xs" title="Assistant Active" />

          {/* Options Menu (Three Dots) */}
          <div className="relative" ref={optionsMenuRef}>
            <button
              onClick={() => setShowOptionsMenu(!showOptionsMenu)}
              className="rounded p-1 text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
              title="Assistant Options"
            >
              <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </button>

            {showOptionsMenu && (
              <div className="absolute right-0 top-7 z-30 flex w-40 flex-col rounded-md border border-border bg-card p-1 text-xs text-text shadow-xl">
                <button
                  onClick={() => {
                    setTitleDraft(assistantTopicTitle);
                    setIsEditingTitle(true);
                    setShowOptionsMenu(false);
                  }}
                  className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                >
                  Rename Topic
                </button>
                <button
                  onClick={() => {
                    clearAssistantMessages();
                    setShowOptionsMenu(false);
                  }}
                  className="rounded px-2.5 py-1.5 text-left text-red-400 hover:bg-red-500 hover:text-white cursor-pointer transition-colors"
                >
                  Clear Chat
                </button>
                <div className="h-px bg-border/60 my-0.5" />
                <button
                  onClick={() => {
                    toggleAssistantPanel();
                    setShowOptionsMenu(false);
                  }}
                  className="rounded px-2.5 py-1.5 text-left text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
                >
                  Hide Panel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content: Study Assistant or OpenCode Agent */}
      {assistantMode === "opencode" ? (
        <div className="flex-1 overflow-hidden">
          <OpenCodeView />
        </div>
      ) : (
        <>
          {/* Messages Stream */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
        {assistantMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-6 text-muted select-none">
            <div className="h-10 w-10 rounded-full border border-border bg-bg/50 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 stroke-current text-accent" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-text">Study Assistant Ready</p>
            <p className="text-[11px] text-muted mt-1 max-w-[220px]">
              Ask questions about your study notes, summarize documents, or generate learning plans.
            </p>
          </div>
        ) : (
          assistantMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.role === "user" ? "items-end" : "items-start"
              }`}
            >
              {msg.role === "user" ? (
                <div className="max-w-[85%] rounded-lg bg-accent px-3 py-2 text-xs text-white shadow-sm leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </div>
              ) : (
                <div className="w-full text-xs text-text/90 leading-relaxed markdown-preview">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>
          ))
        )}
        {assistantStatusText && (
          <div className="flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] text-accent font-medium animate-pulse w-fit">
            <span className="text-[10px]">✨</span>
            <span>{assistantStatusText}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Input Area */}
      <div className="p-3 pt-0">
        <div className="flex flex-col rounded-xl border border-border/80 bg-bg/60 p-2.5 shadow-inner focus-within:border-accent/80 transition-colors">
          {/* Text Area */}
          <textarea
            ref={textareaRef}
            rows={2}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add \ or ask assistant..."
            className="w-full resize-none bg-transparent text-xs text-text placeholder:text-muted/60 outline-none leading-relaxed"
          />

          {/* Bottom Toolbar */}
          <div className="mt-2 flex items-center justify-between pt-1 border-t border-border/30">
            {/* Left toolbar items */}
            <div className="flex items-center gap-1.5">
              {/* Attach Context Button (+) */}
              <div className="relative" ref={attachMenuRef}>
                <button
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  title="Add context attachment"
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-border/60 text-muted hover:border-text hover:text-white cursor-pointer transition-colors"
                >
                  <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>

                {showAttachMenu && (
                  <div className="absolute bottom-8 left-0 z-30 flex w-44 flex-col rounded-md border border-border bg-card p-1 text-xs text-text shadow-xl">
                    <button
                      onClick={() => handleAttachContext("active_file")}
                      className="flex items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      </svg>
                      Active Note Context
                    </button>
                    <button
                      onClick={() => handleAttachContext("folder")}
                      className="flex items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
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
                  className="flex items-center gap-1 rounded-md border border-border/70 bg-card/80 px-2 py-1 text-[11px] font-medium text-text/90 hover:border-accent/60 hover:text-white cursor-pointer transition-colors"
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
                  <div className="absolute bottom-8 left-0 z-30 flex w-56 flex-col rounded-md border border-border bg-card p-1 text-xs text-text shadow-xl">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted">AI Engine & Model</div>
                    {modelsList.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          let defaultUrl = settings.aiBaseUrl;
                          if (m.id === "ollama_hermes") defaultUrl = "http://localhost:11434/v1";
                          else if (m.id === "openrouter") defaultUrl = "https://openrouter.ai/api/v1";
                          else if (m.id === "openai") defaultUrl = "https://api.openai.com/v1";
                          else if (m.id === "anthropic") defaultUrl = "https://api.anthropic.com/v1";
                          else if (m.id === "gemini") defaultUrl = "https://generativelanguage.googleapis.com/v1beta/openai";


                          updateSettings({
                            aiProvider: m.id,
                            aiModelName: m.model,
                            aiBaseUrl: defaultUrl,
                          });
                          setShowModelDropdown(false);
                        }}
                        className={`flex items-center justify-between rounded px-2.5 py-1.5 text-left cursor-pointer transition-colors ${
                          settings.aiProvider === m.id ? "bg-accent text-white font-medium" : "hover:bg-bg/80 text-text/90"
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
            </div>

            {/* Right: Send Submit Button (↑) */}
            <button
              onClick={handleSend}
              disabled={!inputVal.trim()}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-all ${
                inputVal.trim()
                  ? "bg-accent text-white shadow-sm hover:bg-accent-hover cursor-pointer scale-100"
                  : "bg-border/40 text-muted cursor-not-allowed opacity-50"
              }`}
              title="Send message"
            >
              <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}

