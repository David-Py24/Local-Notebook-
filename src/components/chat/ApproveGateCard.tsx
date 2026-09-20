import { useStore } from "../../stores/useStore";
import { ChatBadge } from "./ChatBadge";

// Pending file-write approval gate (OpenChamber "PermissionCard" analog). Shared by
// the assistant and micro-agent panels. Renders nothing when there are no pending
// approvals. Uses semantic warn tokens so it follows the active theme.
export function ApproveGateCard() {
  const pending = useStore((s) => s.pendingToolApprovals);
  const resolveToolApproval = useStore((s) => s.resolveToolApproval);
  const clearToolApproval = useStore((s) => s.clearToolApproval);

  const items = pending.filter((p) => p.status === "pending");
  if (items.length === 0) return null;

  return (
    <div className="shrink-0 space-y-2 px-3 pb-1">
      {items.map((p) => (
        <div
          key={p.id}
          className="flex items-center justify-between gap-2 rounded-xl border border-chat-warn/40 bg-chat-warn/[0.07] px-3 py-2 text-xs"
        >
          <div className="min-w-0 flex-1">
            <ChatBadge tone="warn" className="mb-0.5">
              ⚠️ AI wants to change your files
            </ChatBadge>
            <p className="mt-1 leading-relaxed text-text/80 break-words">{p.summary}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => {
                resolveToolApproval(p.id, "approved");
                window.setTimeout(() => clearToolApproval(p.id), 1200);
              }}
              className="rounded-full bg-chat-tool-ok px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90 cursor-pointer transition-opacity"
            >
              Approve
            </button>
            <button
              onClick={() => {
                resolveToolApproval(p.id, "rejected");
                clearToolApproval(p.id);
              }}
              className="rounded-full border border-border/60 bg-bg/60 px-2.5 py-1 text-[11px] font-medium text-chat-tool-error hover:bg-chat-tool-error/10 cursor-pointer transition-colors"
            >
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}