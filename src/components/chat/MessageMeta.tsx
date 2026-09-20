import { AssistantMessage } from "../../stores/useStore";
import { ChatBadge } from "./ChatBadge";

export function MessageMeta({ message }: { message: AssistantMessage }) {
  if (message.role === "user") {
    return (
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold tracking-wider text-muted/70 uppercase">You</span>
        <span className="text-[9px] font-mono text-muted/60">{message.timestamp}</span>
      </div>
    );
  }

  const modelName = message.model || (message.engine === "opencode" ? "OpenCode Agent" : "BYOK Model");
  const modeTag = message.engine === "opencode" ? "build" : "primary";

  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-muted/80">
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent/20 text-[9px] font-bold text-accent">
        Z
      </span>
      <span className="font-medium text-text">{modelName}</span>
      <span className="text-muted/40">·</span>
      <ChatBadge tone="neutral" className="px-1.5 py-0 text-[10px]">
        {modeTag}
      </ChatBadge>
      <span className="text-muted/40">·</span>
      <span className="text-[10px] font-mono text-muted/70">{message.timestamp}</span>
    </div>
  );
}