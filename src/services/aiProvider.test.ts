import { describe, it, expect } from "vitest";
import { describeGeminiBlock } from "./aiProvider";

describe("describeGeminiBlock", () => {
  it("treats a normal STOP as no block", () => {
    expect(describeGeminiBlock("stop")).toBeNull();
  });

  it("treats MAX_TOKENS as no block", () => {
    expect(describeGeminiBlock("max_tokens")).toBeNull();
  });

  it("treats TOOL_CALLS as no block", () => {
    // Regression test: this used to fall through to the "stopped early" default case
    // and show a bogus "Gemini stopped early" warning on every provider's normal,
    // successful tool-calling finish reason — not just Gemini's.
    expect(describeGeminiBlock("tool_calls")).toBeNull();
    expect(describeGeminiBlock("TOOL_CALLS")).toBeNull();
  });

  it("treats FUNCTION_CALL as no block", () => {
    expect(describeGeminiBlock("function_call")).toBeNull();
  });

  it("still surfaces a SAFETY block", () => {
    expect(describeGeminiBlock("SAFETY")).toContain("Safety Filter");
  });

  it("still surfaces a RECITATION block", () => {
    expect(describeGeminiBlock("RECITATION")).toContain("Recitation");
  });

  it("still surfaces an unrecognized finish reason as a generic stop warning", () => {
    expect(describeGeminiBlock("SOME_NEW_REASON")).toContain("stopped early");
  });

  it("returns null when nothing is provided", () => {
    expect(describeGeminiBlock(undefined, undefined)).toBeNull();
  });
});
