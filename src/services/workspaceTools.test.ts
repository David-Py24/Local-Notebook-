import { describe, it, expect } from "vitest";
import { resolveVaultPath } from "./workspaceTools";

// Windows-style vault root (backslashes), as returned by Tauri's folder-picker dialog.
const WIN_VAULT = "C:\\Users\\Ghing\\Downloads\\Ideaverse\\My Study Notebook";
// POSIX-style vault root, as it would appear on macOS/Linux.
const POSIX_VAULT = "/Users/ghing/vaults/My Study Notebook";

describe("resolveVaultPath", () => {
  it("resolves a nested path under a Windows (backslash) vault root", () => {
    // Regression test: resolveVaultPath used to normalize backslashes only for the
    // comparison variable, not for the path it actually built and returned, so this
    // always failed on Windows with "must stay inside the vault root" — even though
    // the path was completely valid. This was discovered via a live BYOK tool call
    // that a model correctly issued but which got silently rejected every time.
    expect(resolveVaultPath(WIN_VAULT, "Guides/Agentic Workflow Guide.md")).toBe(
      "C:/Users/Ghing/Downloads/Ideaverse/My Study Notebook/Guides/Agentic Workflow Guide.md"
    );
  });

  it("resolves a flat (no subfolder) path under a Windows vault root", () => {
    expect(resolveVaultPath(WIN_VAULT, "Agentic Workflow Guide.md")).toBe(
      "C:/Users/Ghing/Downloads/Ideaverse/My Study Notebook/Agentic Workflow Guide.md"
    );
  });

  it("resolves a nested path under a POSIX vault root", () => {
    expect(resolveVaultPath(POSIX_VAULT, "Guides/Physics.md")).toBe(
      "/Users/ghing/vaults/My Study Notebook/Guides/Physics.md"
    );
  });

  it("rejects a relative path that escapes the vault root via ..", () => {
    expect(resolveVaultPath(WIN_VAULT, "../../evil.md")).toBeNull();
  });

  it("rejects an absolute path", () => {
    expect(resolveVaultPath(WIN_VAULT, "C:/evil.md")).toBeNull();
    expect(resolveVaultPath(WIN_VAULT, "/evil.md")).toBeNull();
  });

  it("rejects an empty or whitespace-only path", () => {
    expect(resolveVaultPath(WIN_VAULT, "")).toBeNull();
    expect(resolveVaultPath(WIN_VAULT, "   ")).toBeNull();
  });

  it("rejects a path equal to the vault root itself", () => {
    expect(resolveVaultPath(WIN_VAULT, ".")).toBeNull();
  });

  it("rejects when vaultRoot is empty", () => {
    expect(resolveVaultPath("", "Guides/Test.md")).toBeNull();
  });

  it("is case-insensitive when checking the vault-root prefix", () => {
    // Windows paths are case-insensitive; a differently-cased root shouldn't matter.
    expect(resolveVaultPath("c:\\users\\ghing\\downloads\\ideaverse\\my study notebook", "Test.md")).toBe(
      "c:/users/ghing/downloads/ideaverse/my study notebook/Test.md"
    );
  });
});
