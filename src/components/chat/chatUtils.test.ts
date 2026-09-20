import { describe, it, expect } from "vitest";
import { formatDuration, stripMarkdown, summarizeArgs } from "./chatUtils";

describe("formatDuration", () => {
  it("returns empty for missing/zero/negative", () => {
    expect(formatDuration()).toBe("");
    expect(formatDuration(0)).toBe("");
    expect(formatDuration(-5)).toBe("");
  });

  it("formats seconds", () => {
    expect(formatDuration(999)).toBe("0s");
    expect(formatDuration(1000)).toBe("1s");
    expect(formatDuration(59_000)).toBe("59s");
  });

  it("formats minutes and minutes+seconds", () => {
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(90_500)).toBe("1m 30s");
    expect(formatDuration(125_000)).toBe("2m 5s");
  });
});

describe("stripMarkdown", () => {
  it("strips inline code, links, emphasis, headings and normalizes whitespace", () => {
    expect(stripMarkdown("## Plan\n\n_Do_ **this** `x` and [link](https://x.y)")).toBe("Plan Do this x and link");
  });

  it("removes fenced code blocks", () => {
    expect(stripMarkdown("before\n```ts\nconst a = 1;\n```\nafter")).toBe("before after");
  });

  it("keeps image alt text", () => {
    expect(stripMarkdown("![diagram](/img/a.png) here")).toBe("diagram here");
  });

  it("truncates with an ellipsis past max and returns empty for empty input", () => {
    const long = "abcde".repeat(60);
    expect(stripMarkdown(long, 30)).toHaveLength(31);
    expect(stripMarkdown(long, 30).endsWith("…")).toBe(true);
    expect(stripMarkdown("   ")).toBe("");
  });
});

describe("summarizeArgs", () => {
  it("returns empty when no args", () => {
    expect(summarizeArgs()).toBe("");
    expect(summarizeArgs({})).toBe("");
  });

  it("shows at most the first two entries", () => {
    expect(summarizeArgs({ a: 1, b: 2, c: 3 })).toBe("a=1 b=2");
  });

  it("quotes string values and truncates long ones", () => {
    const long = "x".repeat(80);
    expect(summarizeArgs({ path: "a.md" })).toBe(`path="a.md"`);
    expect(summarizeArgs({ path: long })).toContain("…");
  });

  it("JSON-stringifies non-string values", () => {
    expect(summarizeArgs({ count: 42, ok: true })).toBe("count=42 ok=true");
  });
});