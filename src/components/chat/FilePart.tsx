import { ChatPart } from "../../stores/useStore";
import { ChatBadge } from "./ChatBadge";

type FilePartType = Extract<ChatPart, { kind: "file" }>;

// File-changed chip (OpenChamber "MessageFilesDisplay" analog, minimal). Passively
// shows a path the agent touched; the full diff/edit stays in tool parts or DiffView.
export function FilePart({ part }: { part: FilePartType }) {
  const name = part.path.split(/[\\/]/).pop() || part.path;
  return (
    <div className="my-1 text-left">
      <ChatBadge tone="neutral" icon={<span>📄</span>} title={part.path}>
        {name}
      </ChatBadge>
    </div>
  );
}