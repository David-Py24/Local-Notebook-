import { AssistantMessage } from "../../stores/useStore";
import { AgentStepTimeline } from "../AgentStepTimeline";
import { UserTextPart } from "./UserTextPart";
import { PartRenderer } from "./PartRenderer";
import { MessageActionHoverToolbar } from "./MessageActionHoverToolbar";

// Root renderer for one message (OpenChamber "ChatMessage"/"MessageBody" analog).
// - user   → right-aligned bubble
// - assistant with parts → typed part list (live, ordered) with bottom action hover toolbar
// - assistant without parts → AgentStepTimeline with bottom action hover toolbar
export function ChatMessage({ message }: { message: AssistantMessage }) {
  if (message.role === "user") {
    return <UserTextPart message={message} />;
  }

  if (message.parts && message.parts.length > 0) {
    return (
      <div className="group/msg relative flex w-full flex-col items-start pb-1">
        <div className="w-full space-y-1.5">
          {message.parts.map((p) => (
            <PartRenderer key={p.id} part={p} />
          ))}
        </div>
        <MessageActionHoverToolbar message={message} />
      </div>
    );
  }

  return (
    <div className="group/msg relative flex w-full flex-col items-start pb-1">
      <div className="w-full">
        <AgentStepTimeline message={message} />
      </div>
      <MessageActionHoverToolbar message={message} />
    </div>
  );
}