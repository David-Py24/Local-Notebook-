import { AssistantMessage } from "../../stores/useStore";
import { MessageMeta } from "./MessageMeta";

// User turn bubble — right-aligned card, OpenChamber "UserTextPart" analog.
// Kept as plain pre-wrapped text so attachment tokens (@[file]) render verbatim.
export function UserTextPart({ message }: { message: AssistantMessage }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <MessageMeta message={message} />
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm border border-chat-user-bubble/70 bg-chat-user-bubble/60 px-3.5 py-2 text-xs leading-relaxed text-text shadow-sm">
        {message.content}
      </div>
    </div>
  );
}