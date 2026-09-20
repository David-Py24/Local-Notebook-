import { useEffect, useRef, useState } from "react";
import { useStore } from "../../stores/useStore";
import { ModelControls } from "./ModelControls";
import { ChatHelpersPopover, HelperItem } from "./ChatHelpersPopover";
import { AgentPermissionsPopover } from "./AgentPermissionsPopover";
import { ContextScopePopover, ContextScopeOption } from "./ContextScopePopover";
import { AgentPersonaPopover, AgentModeOption } from "./AgentPersonaPopover";

export function Composer() {
  const settings = useStore((s) => s.settings);
  const sendAssistantMessage = useStore((s) => s.sendAssistantMessage);
  const cancelAssistantMessage = useStore((s) => s.cancelAssistantMessage);
  const isAssistantStreaming = useStore((s) => s.isAssistantStreaming);

  const [inputVal, setInputVal] = useState("");
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const [showScopePopover, setShowScopePopover] = useState(false);
  const [showPersonaPopover, setShowPersonaPopover] = useState(false);
  const [currentScope, setCurrentScope] = useState<ContextScopeOption>("active_note");
  const [currentMode, setCurrentMode] = useState<AgentModeOption>("build");

  // Helper trigger popover state
  const [helperTrigger, setHelperTrigger] = useState<"@" | "/" | "!" | "#" | null>(null);
  const [helperFilter, setHelperFilter] = useState("");

  // Voice dictation state
  const [isRecording, setIsRecording] = useState(false);

  const [queue, setQueue] = useState<string[]>([]);
  const queueRef = useRef<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    window.addEventListener("mousedown", onOutside);
    return () => window.removeEventListener("mousedown", onOutside);
  }, []);

  const resetHeight = () => {
    const el = textareaRef.current;
    if (el) el.style.height = "auto";
  };

  const submit = (val: string) => {
    sendAssistantMessage(val);
    setInputVal("");
    setHelperTrigger(null);
    resetHeight();
  };

  // Flush the queue once streaming settles.
  useEffect(() => {
    if (isAssistantStreaming || queueRef.current.length === 0) return;
    const next = queueRef.current[0];
    queueRef.current = queueRef.current.slice(1);
    setQueue([...queueRef.current]);
    submit(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAssistantStreaming]);

  const handleSend = () => {
    const val = inputVal.trim();
    if (!val) return;
    if (isAssistantStreaming) {
      queueRef.current = [...queueRef.current, val];
      setQueue([...queueRef.current]);
      setInputVal("");
      resetHeight();
      return;
    }
    submit(val);
  };

  const removeQueued = (index: number) => {
    queueRef.current = queueRef.current.filter((_, i) => i !== index);
    setQueue([...queueRef.current]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputVal(val);
    autoResize();

    // Check for helper triggers (@ / ! #)
    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    const lastWordMatch = textBeforeCursor.match(/(?:^|\s)([@/!#])(\w*)$/);

    if (lastWordMatch) {
      const char = lastWordMatch[1] as "@" | "/" | "!" | "#";
      const filter = lastWordMatch[2];
      setHelperTrigger(char);
      setHelperFilter(filter);
    } else {
      setHelperTrigger(null);
    }
  };

  const handleHelperSelect = (item: HelperItem) => {
    if (!textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart;
    const textBeforeCursor = inputVal.slice(0, cursor);
    const textAfterCursor = inputVal.slice(cursor);
    const updatedBefore = textBeforeCursor.replace(/(?:^|\s)([@/!#])\w*$/, ` ${item.label} `);
    setInputVal(updatedBefore + textAfterCursor);
    setHelperTrigger(null);
    textareaRef.current.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      setHelperTrigger(null);
      setShowPermissions(false);
      setShowScopePopover(false);
      setShowPersonaPopover(false);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAttachContext = (contextType: string) => {
    const st = useStore.getState();
    if (contextType === "active_file") {
      const activeFile = st.activeLeftTabId || st.activeRightTabId;
      if (activeFile) {
        const name = activeFile.split(/[\\/]/).pop();
        setInputVal((prev) => prev + ` @[${name}] `);
      }
    } else if (contextType === "folder") {
      const folder = st.currentFolderPath;
      if (folder) {
        const name = folder.split(/[\\/]/).pop();
        setInputVal((prev) => prev + ` @folder/${name} `);
      }
    }
    setShowAttachMenu(false);
    textareaRef.current?.focus();
  };

  const toggleVoiceDictation = () => {
    setIsRecording((prev) => !prev);
  };

  const autoResize = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 180) + "px";
    }
  };

  return (
    <div className="px-3 pb-3 pt-1">
      {/* Queued message chips */}
      {queue.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {queue.map((q, i) => (
            <div
              key={i}
              className="group flex max-w-full items-center gap-1 rounded-full border border-border/60 bg-bg/60 pl-2 pr-1 text-[10px] text-muted shadow-sm"
            >
              <span className="truncate">{q}</span>
              <button
                onClick={() => removeQueued(i)}
                title="Remove queued message"
                className="rounded-full p-0.5 text-muted opacity-50 hover:text-chat-tool-error hover:opacity-100 cursor-pointer transition-all"
              >
                <svg className="h-2.5 w-2.5 fill-current" viewBox="0 0 24 24">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Composer Pill Box */}
      <div className="relative flex flex-col rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md px-3.5 py-2.5 transition-all focus-within:border-accent/60 focus-within:ring-1 focus-within:ring-accent/30 shadow-lg">
        {/* Dynamic Helper Autocomplete Popover */}
        {helperTrigger && (
          <ChatHelpersPopover
            triggerChar={helperTrigger}
            filterText={helperFilter}
            onSelect={handleHelperSelect}
            onClose={() => setHelperTrigger(null)}
          />
        )}

        {/* Text Area */}
        <textarea
          ref={textareaRef}
          rows={2}
          value={inputVal}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Use @ / ! # for helpers"
          className="w-full resize-none bg-transparent text-xs leading-relaxed text-text outline-none placeholder:text-muted/60 placeholder:font-normal"
        />

        {/* Action Bar Row */}
        <div className="mt-1.5 flex items-center justify-between pt-1 border-t border-border/30 min-w-0 gap-1 select-none">
          {/* Left Toolbar Icons */}
          <div className="relative flex items-center gap-0.5 shrink-0">
            {/* (+) Attachment Icon */}
            <div className="relative" ref={attachMenuRef}>
              <button
                onClick={() => setShowAttachMenu(!showAttachMenu)}
                title="Add context attachment (+)"
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted/80 hover:bg-bg/80 hover:text-text cursor-pointer transition-colors"
              >
                <svg className="h-3.5 w-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>

              {showAttachMenu && (
                <div className="absolute bottom-full mb-2 left-0 z-50 flex w-48 flex-col rounded-2xl border border-border/70 bg-card p-1.5 text-xs text-text shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150">
                  <button
                    onClick={() => handleAttachContext("active_file")}
                    className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-left hover:bg-bg/80 cursor-pointer transition-colors"
                  >
                    <span className="text-sm">📄</span>
                    <span>Active Note Context</span>
                  </button>
                  <button
                    onClick={() => handleAttachContext("folder")}
                    className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-left hover:bg-bg/80 cursor-pointer transition-colors"
                  >
                    <span className="text-sm">📁</span>
                    <span>Vault Workspace</span>
                  </button>
                </div>
              )}
            </div>

            {/* [ ] Context Scope Selector Icon */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowScopePopover(!showScopePopover);
                  setShowPermissions(false);
                  setShowPersonaPopover(false);
                }}
                title="Context Scope Picker ([ ])"
                className={`flex h-6 w-6 items-center justify-center rounded-md cursor-pointer transition-colors ${
                  showScopePopover ? "bg-accent/20 text-accent font-semibold" : "text-muted/80 hover:bg-bg/80 hover:text-text"
                }`}
              >
                <svg className="h-3.5 w-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                  <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h3M16 20h3a1 1 0 0 0 1-1v-3" />
                </svg>
              </button>

              {showScopePopover && (
                <ContextScopePopover
                  currentScope={currentScope}
                  onSelectScope={(sc) => setCurrentScope(sc)}
                  onClose={() => setShowScopePopover(false)}
                />
              )}
            </div>

            {/* 🛡️ Security & Permissions Shield Icon (Screenshot 2 Modal) */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowPermissions(!showPermissions);
                  setShowScopePopover(false);
                  setShowPersonaPopover(false);
                }}
                title="Agent Mode & Security Permissions"
                className={`flex h-6 w-6 items-center justify-center rounded-md cursor-pointer transition-colors ${
                  showPermissions ? "bg-accent/20 text-accent" : "text-muted/80 hover:bg-bg/80 hover:text-text"
                }`}
              >
                <svg className="h-3.5 w-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
                </svg>
              </button>

              {showPermissions && <AgentPermissionsPopover onClose={() => setShowPermissions(false)} />}
            </div>

            {/* 🎯 Target / Persona Icon */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowPersonaPopover(!showPersonaPopover);
                  setShowPermissions(false);
                  setShowScopePopover(false);
                }}
                title="Agent Persona & Workflow Switcher"
                className={`flex h-6 w-6 items-center justify-center rounded-md cursor-pointer transition-colors ${
                  showPersonaPopover ? "bg-accent/20 text-accent" : "text-muted/80 hover:bg-bg/80 hover:text-text"
                }`}
              >
                <svg className="h-3.5 w-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
              </button>

              {showPersonaPopover && (
                <AgentPersonaPopover
                  currentMode={currentMode}
                  onSelectMode={(m) => setCurrentMode(m)}
                  onClose={() => setShowPersonaPopover(false)}
                />
              )}
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Model Badge ("Z Big Pickle" style) */}
            <ModelControls />

            {/* Thinking / Reasoning Sparkle Status Icon */}
            <button
              title="Reasoning / Extended Thinking Active"
              className="flex h-6 w-6 items-center justify-center rounded-full text-chat-tool-ok hover:bg-bg/80 cursor-pointer transition-colors"
            >
              <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
              </svg>
            </button>

            {/* Voice Dictation Microphone Button */}
            <button
              onClick={toggleVoiceDictation}
              title={isRecording ? "Listening... click to stop" : "Voice Dictation"}
              className={`flex h-6 w-6 items-center justify-center rounded-md cursor-pointer transition-all ${
                isRecording ? "bg-chat-tool-error text-white animate-pulse" : "text-muted/80 hover:bg-bg/80 hover:text-text"
              }`}
            >
              <svg className="h-3.5 w-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>

            {/* Send / Stop Arrow Button */}
            {isAssistantStreaming ? (
              <button
                onClick={cancelAssistantMessage}
                className="flex h-6 w-6 items-center justify-center rounded-lg bg-chat-tool-error text-white hover:bg-chat-tool-error/90 cursor-pointer transition-all shadow-sm"
                title="Stop generating"
              >
                <svg className="h-2.5 w-2.5 fill-current" viewBox="0 0 24 24">
                  <rect x="5" y="5" width="14" height="14" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!inputVal.trim() && queue.length === 0}
                className={`flex h-6 w-6 items-center justify-center rounded-lg transition-all ${
                  inputVal.trim() || queue.length > 0
                    ? "bg-accent text-white hover:bg-accent-hover cursor-pointer shadow-md scale-100"
                    : "bg-border/30 text-muted/50 cursor-not-allowed opacity-50"
                }`}
                title="Send message"
              >
                <svg className="h-3.5 w-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}