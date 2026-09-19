import { describe, it, expect, vi, beforeEach } from "vitest";

type PendingApproval = {
  id: string;
  tool: string;
  args: Record<string, any>;
  summary: string;
  status: "pending" | "approved" | "rejected";
};

interface StoreState {
  currentFolderPath: string;
  settings: { aiEnableFileWrite: boolean; aiEnabled: boolean; connectors: unknown[]; excludedFolders: string };
  activeLeftTabId: string | null;
  activeRightTabId: string | null;
  activePanel: "left" | "right";
  leftDraft: string;
  rightDraft: string;
  pendingToolApprovals: PendingApproval[];
  addPendingToolApproval: (approval: PendingApproval) => void;
  resolveToolApproval: (id: string, status: "approved" | "rejected") => void;
}

const invokeCalls: Array<{ cmd: string; args: unknown }> = [];
let existingFileContent = "";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string, args: unknown) => {
    invokeCalls.push({ cmd, args });
    if (cmd === "create_local_file") return Promise.resolve("ok");
    if (cmd === "write_local_file") return Promise.resolve();
    if (cmd === "reindex_vault") return Promise.resolve();
    if (cmd === "read_local_file") return Promise.resolve(existingFileContent);
    return Promise.resolve();
  }),
}));

const WIN_VAULT = "C:\\Users\\Ghing\\Downloads\\Ideaverse\\My Study Notebook";

const storeState: StoreState = {
  currentFolderPath: WIN_VAULT,
  settings: { aiEnableFileWrite: true, aiEnabled: false, connectors: [], excludedFolders: "" },
  activeLeftTabId: null,
  activeRightTabId: null,
  activePanel: "left",
  leftDraft: "",
  rightDraft: "",
  pendingToolApprovals: [],
  addPendingToolApproval(approval) {
    this.pendingToolApprovals.push(approval);
  },
  resolveToolApproval(id, status) {
    const item = this.pendingToolApprovals.find((p) => p.id === id);
    if (item) item.status = status;
  },
};

vi.mock("../stores/useStore", () => ({
  useStore: {
    getState: () => storeState,
  },
}));

import { executeWorkspaceTool } from "./workspaceTools";

describe("executeWorkspaceTool('create_note') — end-to-end path resolution", () => {
  beforeEach(() => {
    invokeCalls.length = 0;
    existingFileContent = "";
    storeState.pendingToolApprovals.length = 0;
  });

  it("resolves a nested path under a Windows vault root and calls Rust with forward-slash paths", async () => {
    // Regression test for tonight's bug: this exact call shape used to return
    // "Error: Refusing path ... must stay inside the vault root" for every call,
    // on every Windows vault, because of the backslash/forward-slash mismatch in
    // resolveVaultPath. It should now actually reach the Rust write commands.
    const result = await executeWorkspaceTool("create_note", {
      path: "Guides/Agentic Workflow Guide.md",
      content: "# Agentic Workflow Guide",
    });

    expect(result).not.toMatch(/Error/i);
    expect(invokeCalls.map((c) => c.cmd)).toEqual(["create_local_file", "write_local_file", "reindex_vault"]);

    const createArgs = invokeCalls[0].args as { dirPath: string; name: string; vaultRoot: string };
    expect(createArgs.name).toBe("Agentic Workflow Guide.md");
    expect(createArgs.dirPath).toBe("C:/Users/Ghing/Downloads/Ideaverse/My Study Notebook/Guides");

    const writeArgs = invokeCalls[1].args as { path: string; content: string };
    expect(writeArgs.path).toBe(
      "C:/Users/Ghing/Downloads/Ideaverse/My Study Notebook/Guides/Agentic Workflow Guide.md"
    );
    expect(writeArgs.content).toBe("# Agentic Workflow Guide");
  });

  it("resolves a flat (no subfolder) path under a Windows vault root", async () => {
    const result = await executeWorkspaceTool("create_note", {
      path: "Test.md",
      content: "hello",
    });

    expect(result).not.toMatch(/Error/i);
    const createArgs = invokeCalls[0].args as { dirPath: string; name: string };
    expect(createArgs.dirPath).toBe("C:/Users/Ghing/Downloads/Ideaverse/My Study Notebook");
    expect(createArgs.name).toBe("Test.md");
  });

  it("still refuses a path that escapes the vault root, without calling Rust", async () => {
    const result = await executeWorkspaceTool("create_note", {
      path: "../../evil.md",
      content: "malicious",
    });

    expect(result).toMatch(/Refusing path/);
    expect(invokeCalls).toHaveLength(0);
  });
});

describe("executeWorkspaceTool('append_file') — approval gate resolution (regression for the micro-agent hang)", () => {
  beforeEach(() => {
    invokeCalls.length = 0;
    existingFileContent = "";
    storeState.pendingToolApprovals.length = 0;
  });

  it("blocks on a pending approval and only writes after the user approves", async () => {
    existingFileContent = "existing body";

    const promise = executeWorkspaceTool("append_file", { path: "Notes/A.md", content: "more" });

    await vi.waitFor(() => {
      expect(storeState.pendingToolApprovals.length).toBe(1);
      expect(storeState.pendingToolApprovals[0].status).toBe("pending");
    });
    expect(invokeCalls.some((c) => c.cmd === "write_local_file")).toBe(false);

    storeState.resolveToolApproval(storeState.pendingToolApprovals[0].id, "approved");

    const result = await promise;
    expect(result).not.toMatch(/Error/i);
    expect(invokeCalls.some((c) => c.cmd === "write_local_file")).toBe(true);
  });

  it("no-ops the write and returns a decline message when the user denies", async () => {
    existingFileContent = "existing body";

    const promise = executeWorkspaceTool("append_file", { path: "Notes/A.md", content: "more" });

    await vi.waitFor(() => {
      expect(storeState.pendingToolApprovals.length).toBe(1);
    });

    storeState.resolveToolApproval(storeState.pendingToolApprovals[0].id, "rejected");

    const result = await promise;
    expect(result).toMatch(/declined/i);
    expect(invokeCalls.some((c) => c.cmd === "write_local_file")).toBe(false);
  });
});
