import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock store minimal surface for the Phase 6a control tools. Uses the same pattern as
// workspaceTools.integration.test.ts (mock useStore.getState + tauri invoke).
const createdSessions: Array<{ title?: string; engine: string }> = [];
const sessions: Array<{ id: string; title: string | null; engine: string; status: string; parentId: string | null }> = [];
const tasks: Array<{ id: string; name: string; scheduleSel: string; time: string; weekday: string | null; nextRun: number | null; disabled: boolean }> = [];
const calls: string[] = [];
let goalRunning = false;

const storeState: Record<string, any> = {
  currentFolderPath: "C:\\vault",
  settings: {
    aiEnableFileWrite: false,
    aiEnabled: false,
    aiEnableAgentControls: true,
    connectors: [],
    excludedFolders: "",
    assistantEngine: "opencode",
  },
  agentSessions: sessions,
  scheduledTasks: tasks,
  goalRunning,
  pendingToolApprovals: [],
  addPendingToolApproval: () => {},
  resolveToolApproval: () => {},
  setActiveAgentSession: (id: string) => {
    calls.push(`setActiveAgentSession:${id}`);
  },
  loadAgentSessions: async () => {
    calls.push("loadAgentSessions");
  },
  loadScheduledTasks: async () => {
    calls.push("loadScheduledTasks");
  },
  createAgentSession: async (opts?: { title?: string; engine?: string }) => {
    createdSessions.push({ title: opts?.title, engine: opts?.engine ?? "opencode" });
    return { id: "sess-test-1", title: opts?.title ?? null, engine: opts?.engine ?? "opencode", status: "idle" };
  },
  forkAgentSession: async (sessionId: string) => {
    calls.push(`fork:${sessionId}`);
    return { id: "sess-fork-1", title: "Fork", engine: "opencode", status: "idle" };
  },
  startGoalRun: async (goal: string) => {
    calls.push(`setGoal:${goal}`);
  },
  stopGoalRun: () => {
    calls.push("stopGoal");
  },
  createScheduledTask: async (opts: { name: string; prompt: string; scheduleSel: string; cron: string | null; weekday: string | null; time: string }) => {
    calls.push(`schedule:${opts.name}:${opts.scheduleSel}`);
    return { id: "task-test-1", name: opts.name, scheduleSel: opts.scheduleSel, time: opts.time, weekday: opts.weekday, nextRun: null, disabled: false };
  },
};

vi.mock("../stores/useStore", () => ({
  useStore: { getState: () => storeState },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

// Import AFTER mocks so the mocked module graph is used.
import { buildEffectiveTools, executeWorkspaceTool, isControlTool, CONTROL_TOOLS } from "./workspaceTools";

// Reset runtime state between tests.
function reset() {
  calls.length = 0;
  createdSessions.length = 0;
  sessions.length = 0;
  tasks.length = 0;
  goalRunning = false;
  storeState.goalRunning = false;
}

describe("CONTROL_TOOLS inventory", () => {
  it("exposes exactly the seven documented meta tools", () => {
    expect(CONTROL_TOOLS.map((t) => t.function.name)).toEqual([
      "create_session",
      "list_sessions",
      "fork_session",
      "set_goal",
      "stop_goal",
      "create_scheduled_task",
      "list_scheduled_tasks",
    ]);
  });

  it("isControlTool matches only control tool names", () => {
    expect(isControlTool("set_goal")).toBe(true);
    expect(isControlTool("stop_goal")).toBe(true);
    expect(isControlTool("create_note")).toBe(false);
    expect(isControlTool("search_vault")).toBe(false);
  });
});

describe("buildEffectiveTools — aiEnableAgentControls gate", () => {
  beforeEach(reset);

  it("omits control tools when the gate is off", async () => {
    storeState.settings.aiEnableAgentControls = false;
    const tools = await buildEffectiveTools();
    expect(tools.map((t) => t.function.name)).not.toContain("set_goal");
    expect(tools.map((t) => t.function.name)).not.toContain("create_session");
  });

  it("includes control tools when the gate is on (default)", async () => {
    storeState.settings.aiEnableAgentControls = true;
    const tools = await buildEffectiveTools();
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("set_goal");
    expect(names).toContain("create_session");
    expect(names).toContain("list_scheduled_tasks");
  });
});

describe("executeWorkspaceTool — control tool dispatch", () => {
  beforeEach(reset);

  it("create_session routes to the store and returns the session id", async () => {
    const result = await executeWorkspaceTool("create_session", { title: "Research lab" });
    expect(createdSessions).toHaveLength(1);
    expect(createdSessions[0].title).toBe("Research lab");
    expect(result).toContain("sess-test-1");
  });

  it("list_sessions loads and enumerates stored sessions", async () => {
    sessions.push({ id: "sess-a", title: "Notes", engine: "opencode", status: "idle", parentId: null });
    const result = await executeWorkspaceTool("list_sessions", {});
    expect(calls).toContain("loadAgentSessions");
    expect(result).toContain("sess-a");
    expect(result).toContain("Notes");
  });

  it("fork_session routes to the store with the parent id", async () => {
    const result = await executeWorkspaceTool("fork_session", { session_id: "sess-a" });
    expect(calls).toContain("fork:sess-a");
    expect(result).toContain("sess-fork-1");
  });

  it("fork_session requires a session_id", async () => {
    const result = await executeWorkspaceTool("fork_session", {});
    expect(result).toMatch(/requires a session_id/);
  });

  it("set_goal arms the goal loop on the requested session and tracks the active session", async () => {
    const result = await executeWorkspaceTool("set_goal", { goal: "Research X", session_id: "sess-b" });
    expect(calls).toContain("setActiveAgentSession:sess-b");
    expect(calls).toContain("setGoal:Research X");
    expect(result).toContain("Goal armed");
  });

  it("set_goal refuses while a goal is already running", async () => {
    storeState.goalRunning = true;
    const result = await executeWorkspaceTool("set_goal", { goal: "Many" });
    expect(result).toMatch(/already active/);
  });

  it("stop_goal routes to the store", async () => {
    const result = await executeWorkspaceTool("stop_goal", {});
    expect(calls).toContain("stopGoal");
    expect(result).toMatch(/stopped/i);
  });

  it("create_scheduled_task routes to the store and returns the task id", async () => {
    const result = await executeWorkspaceTool("create_scheduled_task", {
      name: "Review",
      prompt: "Review today's notes",
      schedule_sel: "daily",
      time: "20:00",
    });
    expect(calls).toContain("schedule:Review:daily");
    expect(result).toContain("task-test-1");
    expect(createdSessions).toHaveLength(0);
  });

  it("create_scheduled_task validates required fields", async () => {
    expect((await executeWorkspaceTool("create_scheduled_task", { prompt: "x" }))).toMatch(/requires a name/);
    expect((await executeWorkspaceTool("create_scheduled_task", { name: "x" }))).toMatch(/requires a prompt/);
  });

  it("list_scheduled_tasks enumerates tasks", async () => {
    tasks.push({ id: "task-a", name: "Weekly", scheduleSel: "weekly", time: "09:00", weekday: "1", nextRun: null, disabled: false });
    const result = await executeWorkspaceTool("list_scheduled_tasks", {});
    expect(calls).toContain("loadScheduledTasks");
    expect(result).toContain("task-a");
    expect(result).toContain("Weekly");
  });

  it("unknown non-control tool still errors normally", async () => {
    const result = await executeWorkspaceTool("definitely_not_a_tool", {});
    expect(result).toMatch(/Unknown tool/);
  });
});