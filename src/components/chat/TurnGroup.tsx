import { useMemo } from "react";
import { AssistantMessage } from "../../stores/useStore";
import { ChatMessage } from "./ChatMessage";

// Groups the flat thread into user→assistant turns (OpenChamber "TurnGroupingContext"
// + "ProgressiveGroup" analog). Each contiguous block starting at a user message forms
// one turn; assistant parts stay in arrival order and are never reordered.
export function buildTurns(messages: AssistantMessage[]): AssistantMessage[][] {
  const turns: AssistantMessage[][] = [];
  for (const m of messages) {
    if (m.role === "user") {
      turns.push([m]);
    } else {
      const last = turns[turns.length - 1];
      if (last) last.push(m);
      else turns.push([m]);
    }
  }
  return turns;
}

export function TurnGroup({ messages }: { messages: AssistantMessage[] }) {
  const turns = useMemo(() => buildTurns(messages), [messages]);
  return (
    <>
      {turns.map((turn, i) => (
        <div key={i} className="space-y-3">
          {turn.map((m) => (
            <ChatMessage key={m.id} message={m} />
          ))}
        </div>
      ))}
    </>
  );
}