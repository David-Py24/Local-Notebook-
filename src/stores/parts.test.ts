import { describe, it, expect } from "vitest";
import { partsToContent, describeChatPart } from "./useStore";
import type { AssistantMessage } from "./useStore";
import type { ChatPart } from "./useStore";

describe("partsToContent (CHAT_UI_REDESIGN_PLAN.md: content stays parts-derived)", () => {
  it("returns empty for undefined or empty parts", () => {
    expect(partsToContent()).toBe("");
    expect(partsToContent([])).toBe("");
  });

  it("concatenates only text parts, ignoring reasoning/tool/file parts", () => {
    const parts: ChatPart[] = [
      { kind: "reasoning", id: "r1", text: "hidden", state: "completed", durationMs: 5 },
      { kind: "text", id: "t1", text: "Hello " },
      { kind: "tool", id: "c1", name: "read_file", state: "completed", output: "x" },
      { kind: "text", id: "t2", text: "world" },
      { kind: "file", id: "f1", path: "a.md" },
    ];
    expect(partsToContent(parts)).toBe("Hello world");
  });

  it("mirrors pre-parts content semantics with timestamp ordering", () => {
    const msg: AssistantMessage = {
      id: "m1",
      role: "assistant",
      content: "Hello world",
      timestamp: "2026-01-01T00:00:00Z",
      parts: [
        { kind: "text", id: "p1", text: "Hello" },
        { kind: "text", id: "p2", text: " world" },
      ],
    };
    expect(partsToContent(msg.parts)).toBe(msg.content);
  });
});

describe("describeChatPart", () => {
  it("summarizes each part kind for legacy column/history text", () => {
    expect(describeChatPart({ kind: "text", id: "t1", text: "hi" })).toBe("Text");
    expect(describeChatPart({ kind: "reasoning", id: "r1", text: "think", state: "completed" })).toBe("Thinking");
    expect(
      describeChatPart({ kind: "tool", id: "c1", name: "write_file", state: "completed", args: { path: "a.md" } })
    ).toBe("Tool · write_file");
    expect(describeChatPart({ kind: "file", id: "f1", path: "notes/a.md" })).toBe("File · notes/a.md");
  });
});