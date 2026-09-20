import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Streamed assistant text block (OpenChamber "AssistantTextPart" analog). Uses
// remarkGfm to match the rest of the app — the old step-timeline renderer omitted it.
export function AssistantTextPart({ text }: { text: string }) {
  if (!text || !text.trim()) return null;
  return (
    <div className="text-xs leading-relaxed text-text/90 markdown-preview">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}