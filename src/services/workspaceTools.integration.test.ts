import { describe, it, expect, vi, beforeEach } from "vitest";

// Only the Tauri IPC boundary and the Zustand store are mocked — everything else
// (executeWorkspaceTool's dispatch, resolveVaultPath, path building) runs for real.
// This is the exact call shape a live model's create_note tool call goes through,
// minus the LLM and the Rust binary — so it proves the fix works for the real
// integration point, not just the isolated resolveVaultPath unit tests.

const invokeCalls: Array<{ cmd: string; args: unknown }> = [];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string, args: unknown) => {
    invokeCalls.push({ cmd, args });
    if (cmd === "create_local_file") return Promise.resolve("ok");
    if (cmd === "write_local_file") return Promise.resolve();
    if (cmd === "reindex_vault") return Promise.resolve();
    return Promise.resolve();
  }),
}));

const WIN_VAULT = "C:\\Users\\Ghing\\Downloads\\Ideaverse\\My Study Notebook";

vi.mock("../stores/useStore", () => ({
  useStore: {
    getState: () => ({
      currentFolderPath: WIN_VAULT,
      settings: { aiEnableFileWrite: true, aiEnabled: false, connectors: [] },
      activeLeftTabId: null,
      activeRightTabId: null,
      activePanel: "left",
      leftDraft: "",
      rightDraft: "",
      pendingToolApprovals: [],
    }),
  },
}));

import { executeWorkspaceTool } from "./workspaceTools";

describe("executeWorkspaceTool('create_note') — end-to-end path resolution", () => {
  beforeEach(() => {
    invokeCalls.length = 0;
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
