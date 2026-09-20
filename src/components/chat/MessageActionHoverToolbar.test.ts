import { describe, it, expect, beforeEach } from "vitest";
import { useStore, AssistantMessage } from "../../stores/useStore";

describe("MessageActionHoverToolbar store integration", () => {
  beforeEach(() => {
    useStore.setState({
      assistantMessages: [
        {
          id: "msg-1",
          role: "assistant",
          content: "Here is the response content.",
          timestamp: "7:54 AM",
          isPinned: false,
        },
      ],
      artifacts: [],
      showArtifactsPanel: false,
    });
  });

  it("toggles message pinned status", () => {
    const store = useStore.getState();
    expect(store.assistantMessages[0].isPinned).toBe(false);

    store.togglePinMessage("msg-1");
    expect(useStore.getState().assistantMessages[0].isPinned).toBe(true);

    store.togglePinMessage("msg-1");
    expect(useStore.getState().assistantMessages[0].isPinned).toBe(false);
  });

  it("saves message as plan artifact and opens artifacts panel", () => {
    const store = useStore.getState();
    const msg: AssistantMessage = {
      id: "msg-1",
      role: "assistant",
      content: "Step 1: Scaffolding. Step 2: Build.",
      timestamp: "7:54 AM",
    };

    store.saveMessageAsPlan(msg);

    const state = useStore.getState();
    expect(state.artifacts.length).toBe(1);
    expect(state.artifacts[0].type).toBe("plan");
    expect(state.artifacts[0].content).toContain("Scaffolding");
    expect(state.showArtifactsPanel).toBe(true);
  });
});
