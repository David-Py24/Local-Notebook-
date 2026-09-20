import { describe, it, expect } from "vitest";
import { buildTurns } from "./TurnGroup";
import type { AssistantMessage } from "../../stores/useStore";

function msg(over: Partial<AssistantMessage>): AssistantMessage {
  return { id: "m", role: "assistant", content: "", timestamp: "2026-01-01T00:00:00Z", ...over };
}

describe("buildTurns", () => {
  it("returns empty for an empty thread", () => {
    expect(buildTurns([])).toEqual([]);
  });

  it("groups each leading user message into its own turn", () => {
    const thread = [
      msg({ id: "u1", role: "user", content: "hi" }),
      msg({ id: "a1", role: "assistant", content: "hello" }),
      msg({ id: "a2", role: "assistant", content: "more" }),
      msg({ id: "u2", role: "user", content: "again" }),
      msg({ id: "a3", role: "assistant", content: "ok" }),
    ];
    const turns = buildTurns(thread);
    expect(turns.map((t) => t.map((m) => m.id))).toEqual([
      ["u1", "a1", "a2"],
      ["u2", "a3"],
    ]);
  });

  it("keeps assistant arrivals in order and does not reorder", () => {
    const thread = [
      msg({ id: "u1", role: "user", content: "q" }),
      msg({ id: "a1", role: "assistant", content: "1" }),
      msg({ id: "a2", role: "assistant", content: "2" }),
    ];
    const first = buildTurns(thread)[0];
    expect(first![0].id).toBe("u1");
    expect(first!.map((m) => m.id)).toEqual(["u1", "a1", "a2"]);
  });

  it("shelters a leading assistant-only thread into one turn (backport fallback)", () => {
    const thread = [msg({ id: "a1", role: "assistant", content: "legacy" })];
    expect(buildTurns(thread)).toHaveLength(1);
    expect(buildTurns(thread)[0][0].id).toBe("a1");
  });
});