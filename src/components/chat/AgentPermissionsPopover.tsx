import { useEffect, useRef } from "react";
import { useStore } from "../../stores/useStore";

interface Props {
  onClose: () => void;
}

export function AgentPermissionsPopover({ onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);

  const engine = settings.assistantEngine;

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [onClose]);

  const togglePermission = (key: "aiEnableFileWrite" | "aiEnableWorkspaceTools" | "aiEnableWebFetch") => {
    const current = settings[key] ?? true;
    updateSettings({ [key]: !current });
  };

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-12 mb-2 z-50 flex w-72 flex-col rounded-2xl border border-border/80 bg-card p-3 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-150 text-text"
    >
      {/* Agent Card Header */}
      <div className="flex flex-col gap-1 pb-2 border-b border-border/40">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm text-white">Build</span>
          <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-accent">
            {engine === "opencode" ? "OpenCode Engine" : "BYOK Engine"}
          </span>
        </div>
        <p className="text-[11px] text-muted leading-snug">
          The default agent. Executes tools based on configured permissions.
        </p>
      </div>

      {/* Mode Section */}
      <div className="mt-2.5 flex flex-col gap-1">
        <span className="text-[10px] font-bold tracking-wider uppercase text-muted/70">Mode</span>
        <div className="flex items-center justify-between rounded-xl bg-bg/50 px-2.5 py-1.5 text-xs text-text border border-border/30">
          <span>Primary</span>
          <span className="h-2 w-2 rounded-full bg-chat-tool-ok" />
        </div>
      </div>

      {/* Permissions Section */}
      <div className="mt-3 flex flex-col gap-1.5">
        <span className="text-[10px] font-bold tracking-wider uppercase text-muted/70">Permissions</span>
        
        {/* Edit Permission */}
        <button
          onClick={() => togglePermission("aiEnableFileWrite")}
          className="flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs text-text hover:bg-bg/70 border border-transparent hover:border-border/40 cursor-pointer transition-colors"
        >
          <span className="font-medium">Edit</span>
          <div className="flex items-center gap-1.5 text-xs">
            {settings.aiEnableFileWrite ? (
              <>
                <svg className="h-4 w-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" fill="currentColor" className="opacity-20" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                <span className="text-text font-medium">Allow</span>
              </>
            ) : (
              <span className="text-muted opacity-70">Deny</span>
            )}
          </div>
        </button>

        {/* Bash / Tools Permission */}
        <button
          onClick={() => togglePermission("aiEnableWorkspaceTools")}
          className="flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs text-text hover:bg-bg/70 border border-transparent hover:border-border/40 cursor-pointer transition-colors"
        >
          <span className="font-medium">Bash / Tools</span>
          <div className="flex items-center gap-1.5 text-xs">
            {settings.aiEnableWorkspaceTools ? (
              <>
                <svg className="h-4 w-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" fill="currentColor" className="opacity-20" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                <span className="text-text font-medium">Allow</span>
              </>
            ) : (
              <span className="text-muted opacity-70">Deny</span>
            )}
          </div>
        </button>

        {/* WebFetch / Connectors Permission */}
        <button
          onClick={() => togglePermission("aiEnableWebFetch")}
          className="flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs text-text hover:bg-bg/70 border border-transparent hover:border-border/40 cursor-pointer transition-colors"
        >
          <span className="font-medium">WebFetch</span>
          <div className="flex items-center gap-1.5 text-xs">
            {(settings.aiEnableWebFetch ?? true) ? (
              <>
                <svg className="h-4 w-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" fill="currentColor" className="opacity-20" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                <span className="text-text font-medium">Allow</span>
              </>
            ) : (
              <span className="text-muted opacity-70">Deny</span>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}
