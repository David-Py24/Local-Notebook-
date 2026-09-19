import { describe, it, expect } from "vitest";
import { resolveOpencodeModel, OPENCODE_INSTALL_HINT, getPlatformInstallCmd } from "./opencodeClient";

describe("resolveOpencodeModel", () => {
  it("maps openrouter BYOK settings to an OpenCode model ref", () => {
    const ref = resolveOpencodeModel({
      aiProvider: "openrouter",
      aiModelName: "usresearch/hermes-3-llama-3.1-405b",
    });
    expect(ref).toEqual({
      providerID: "openrouter",
      modelID: "usresearch/hermes-3-llama-3.1-405b",
    });
  });

  it("maps ollama_hermes to the ollama provider id", () => {
    expect(
      resolveOpencodeModel({ aiProvider: "ollama_hermes", aiModelName: "hermes3:8b" }),
    ).toEqual({ providerID: "ollama", modelID: "hermes3:8b" });
  });

  it("returns null when no model name is set", () => {
    expect(resolveOpencodeModel({ aiProvider: "openrouter", aiModelName: "" })).toBeNull();
    expect(resolveOpencodeModel({ aiProvider: "openrouter", aiModelName: "  " })).toBeNull();
  });

  it("returns null for unmapped providers", () => {
    expect(
      resolveOpencodeModel({ aiProvider: "some_homegrown_provider", aiModelName: "x" }),
    ).toBeNull();
  });

  it("trims whitespace around the model id", () => {
    expect(
      resolveOpencodeModel({ aiProvider: "anthropic", aiModelName: "  claude-3-5-sonnet  " }),
    ).toEqual({ providerID: "anthropic", modelID: "claude-3-5-sonnet" });
  });
});

describe("install hints", () => {
  it("exposes a windows winget hint", () => {
    expect(OPENCODE_INSTALL_HINT).toContain("OpenCode");
    if (navigator.userAgent.toLowerCase().includes("windows")) {
      expect(getPlatformInstallCmd()).toBe("winget install SST.opencode");
    } else {
      expect(getPlatformInstallCmd()).toContain("curl -fsSL https://opencode.ai/install");
    }
  });
});