import { ChatPart } from "../../stores/useStore";
import { AssistantTextPart } from "./AssistantTextPart";
import { ReasoningPart } from "./ReasoningPart";
import { ToolPart } from "./ToolPart";
import { FilePart } from "./FilePart";

// Engine-agnostic part dispatcher: renders a single typed part. This is the seam
// that keeps the chatbox identical across OpenCode and BYOK — no engine branches here.
export function PartRenderer({ part }: { part: ChatPart }) {
  switch (part.kind) {
    case "text":
      return <AssistantTextPart text={part.text} />;
    case "reasoning":
      return <ReasoningPart part={part} />;
    case "tool":
      return <ToolPart part={part} />;
    case "file":
      return <FilePart part={part} />;
  }
}