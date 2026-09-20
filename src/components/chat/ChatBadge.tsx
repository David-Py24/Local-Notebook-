import React from "react";

export type ChatBadgeTone = "neutral" | "accent" | "ok" | "warn" | "error";

const TONE_CLASSES: Record<ChatBadgeTone, string> = {
  neutral: "border border-border/50 bg-bg/60 text-muted",
  accent: "bg-accent/15 text-accent",
  ok: "bg-chat-tool-ok/15 text-chat-tool-ok",
  warn: "bg-chat-warn/15 text-chat-warn",
  error: "bg-chat-tool-error/15 text-chat-tool-error",
};

export function ChatBadge({
  tone = "neutral",
  icon,
  className = "",
  title,
  children,
}: {
  tone?: ChatBadgeTone;
  icon?: React.ReactNode;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[9.5px] font-medium leading-none ${TONE_CLASSES[tone]} ${className}`}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}