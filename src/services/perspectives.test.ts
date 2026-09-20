import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock store surface used by the Perspectives pipeline (create/fork sessions, run a
// goal on a session, add an artifact) + a tauri invoke that can answer read_local_file.
const sessionIds: string[] = [];
const forkParents: string[] = [];
const goalCalls: Array<{ sessionId: string; goal: string }> = [];
const artifactCalls: unknown[] = [];
let forkCounter = 0;
let readResult: string | null = "some content";
let goalOutput = "draft output\nsecond line";

const storeState: Record<string, any> = {
  currentFolderPath: "C:\\vault",
  settings: {
    assistantEngine: "byok",
    attachmentsFolder: "_attachments",
  },
  createAgentSession: async () => {
    const id = "base-1";
    sessionIds.push(id);
    return { id, title: null, engine: "byok" };
  },
  forkAgentSession: async (sessionId: string) => {
    forkParents.push(sessionId);
    forkCounter += 1;
    const id = `child-${forkCounter}`;
    sessionIds.push(id);
    return { id, title: null, engine: "byok" };
  },
  runGoalOnSession: async (sessionId: string, goal: string) => {
    goalCalls.push({ sessionId, goal });
    return { latestOutput: goalOutput, status: "done" };
  },
  addArtifact: (a: unknown) => {
    artifactCalls.push(a);
  },
};

vi.mock("../stores/useStore", () => ({
  useStore: { getState: () => storeState },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "read_local_file") return readResult;
    return undefined;
  }),
}));

// Import AFTER mocks.
import { runPerspectives, PERSPECTIVE_FRAMINGS } from "./perspectives";

function reset() {
  sessionIds.length = 0;
  forkParents.length = 0;
  goalCalls.length = 0;
  artifactCalls.length = 0;
  forkCounter = 0;
  readResult = "some content";
  goalOutput = "draft output\nsecond line";
}

const TOPIC = "# Newton's laws\n\nForces cause acceleration.";

describe("PERSPECTIVE_FRAMINGS inventory", () => {
  it("exposes exactly the five documented framings", () => {
    expect(PERSPECTIVE_FRAMINGS.map((f) => f.id)).toEqual([
      "technical",
      "exam",
      "debate",
      "beginner",
      "outlook",
    ]);
  });
});

describe("runPerspectives", () => {
  beforeEach(reset);

  it("creates a base session, forks one child per framing + fusion, and saves drafts", async () => {
    const result = await runPerspectives({ topic: TOPIC, topicTitle: "Newton" });

    expect(result.error).toBeUndefined();
    expect(result.baseSessionId).toBe("base-1");

    // 5 framings → 5 forked children + 1 fusion child = 6 forks off the base.
    expect(forkParents).toHaveLength(6);

    // One sequential goal run per framing + one fusion run = 6 runs total.
    expect(goalCalls).toHaveLength(6);
    // Each framing forks off the base and runs its goal on the child session.
    expect(forkParents.every((p) => p === "base-1")).toBe(true);
    expect(goalCalls[0].sessionId).toBe("child-1");
    // The framing goal embeds the topic text (as the source to analyze).
    expect(goalCalls[0].goal).toContain("Newton's laws");
    expect(goalCalls[0].goal).toContain("TOPIC TEXT");

    // 5 drafts → 5 artifacts.
    expect(artifactCalls).toHaveLength(5);
    expect(result.drafts).toHaveLength(5);

    // The fusion ran on the last child and pointed at the deterministic note path.
    expect(result.fusedNotePath).toBe("_attachments/orchestration/Newton-balanced-view.md");
    const fusionGoal = goalCalls[goalCalls.length - 1].goal;
    expect(fusionGoal).toContain("balanced markdown note");
    expect(fusionGoal).toContain("_attachments/orchestration/Newton-balanced-view.md");

    // No fallback artifact because the file was "read back" successfully.
    expect(result.fusionArtifactId).toBeNull();
  });

  it("respects a framingId subset", async () => {
    const result = await runPerspectives({ topic: TOPIC, topicTitle: "N", framingIds: ["technical", "debate"] });
    expect(result.drafts).toHaveLength(2);
    expect(result.drafts.map((d) => d.framingId)).toEqual(["technical", "debate"]);
    // 2 children + 1 fusion.
    expect(forkParents).toHaveLength(3);
    expect(artifactCalls).toHaveLength(2);
  });

  it("falls back to an artifact when the fused note never lands on disk", async () => {
    readResult = null; // read_local_file returns nothing → create_note "didn't happen"
    const result = await runPerspectives({ topic: TOPIC, topicTitle: "N", framingIds: ["exam"] });
    expect(result.fusedNotePath).toBeNull();
    expect(result.fusionArtifactId).toMatch(/^fusion-/);
    expect(result.error).toMatch(/file-write tool may be off/i);
  });

  it("returns a clear error when no framings are selected", async () => {
    const result = await runPerspectives({ topic: TOPIC, framingIds: [] });
    expect(result.error).toMatch(/no perspective framings/i);
    expect(result.drafts).toHaveLength(0);
    expect(sessionIds).toHaveLength(0); // no session was even created
  });

  it("still produces a fallback artifact when the fusion model outputs nothing", async () => {
    goalOutput = "";
    readResult = null;
    const result = await runPerspectives({ topic: TOPIC, topicTitle: "Quiet", framingIds: ["outlook"] });
    expect(result.fusionArtifactId).toMatch(/^fusion-/);
    const fallback = artifactCalls[artifactCalls.length - 1] as { content: string };
    expect(fallback.content).toContain("Quiet: A Balanced View");
  });
});