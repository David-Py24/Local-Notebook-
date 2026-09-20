import { describe, it, expect, vi, beforeEach } from "vitest";
import { fileLabelFromHeader, hashPatch, parseUnifiedDiff, readWalkthroughCache, writeWalkthroughCache } from "./walkthroughDiff";

const SAMPLE_DIFF = `diff --git a/Notes/Physics.md b/Notes/Physics.md
index 1234abc..5678def 100644
--- a/Notes/Physics.md
+++ b/Notes/Physics.md
@@ -12,5 +12,6 @@ scatter diagram
 context line
-removed line
+added line about diffraction
+another new line
@@ -40,3 +41,4 @@ //
-tightrope
+laser setup
`;

describe("parseUnifiedDiff", () => {
  it("splits metadata from hunks", () => {
    const parsed = parseUnifiedDiff(SAMPLE_DIFF);
    expect(parsed.headerLines).toContain("diff --git a/Notes/Physics.md b/Notes/Physics.md");
    expect(parsed.hunks).toHaveLength(2);
    expect(parsed.hunks[0].header).toMatch(/^@@ -12,5 \+12,6/);
    expect(parsed.hunks[1].header).toMatch(/^@@ -40,3 \+41,4/);
  });

  it("attaches the right lines to the right hunks", () => {
    const parsed = parseUnifiedDiff(SAMPLE_DIFF);
    expect(parsed.hunks[0].lines).toContain("-removed line");
    expect(parsed.hunks[0].lines).toContain("+added line about diffraction");
    expect(parsed.hunks[1].lines).toContain("+laser setup");
    expect(parsed.hunks[1].lines).not.toContain("-removed line");
  });

  it("returns empty hunks for a body with no @@ lines", () => {
    const parsed = parseUnifiedDiff("diff --git a/x b/x\n--- a/x\n+++ b/x\n nothing");
    expect(parsed.hunks).toHaveLength(0);
  });

  it("handles CRLF line endings", () => {
    const parsed = parseUnifiedDiff("--- a/x\r\n+++ b/x\r\n@@ -1,2 +1,2 @@\r\n-a\r\n+b\r\n");
    expect(parsed.hunks).toHaveLength(1);
    expect(parsed.hunks[0].lines).toEqual(["-a", "+b"]);
  });
});

describe("fileLabelFromHeader", () => {
  it("prefers the +++ b/ path", () => {
    expect(fileLabelFromHeader(["diff --git a/A.md b/A.md", "+++ b/A.md"])).toBe("A.md");
  });

  it("falls back to the diff --git rename target", () => {
    expect(fileLabelFromHeader(["diff --git a/old b/new", "similarity index 90%"])).toBe("new");
  });
});

describe("hashPatch", () => {
  it("produces a stable 64-char hex hash", async () => {
    const a = await hashPatch("hello");
    const b = await hashPatch("hello");
    const other = await hashPatch("help");
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
    expect(other).not.toBe(a);
  });
});

describe("walkthrough LRU cache", () => {
  const dummy = [{ header: "@@ -1 +1 @@", narration: "nope" }];

  beforeEach(() => {
    window.localStorage.clear();
    // The actual cache keys are opaque hashes; pin one for eviction tests.
    window.localStorage.setItem("anything_unrelated", "keep");
  });

  it("round-trips a narration set", () => {
    writeWalkthroughCache("h1", dummy);
    expect(readWalkthroughCache("h1")).toEqual(dummy);
  });

  it("returns null on a miss and on corrupt values", () => {
    expect(readWalkthroughCache("missing")).toBeNull();
    window.localStorage.setItem("lsn_walkthrough_corrupt", "{not json");
    expect(readWalkthroughCache("corrupt")).toBeNull();
  });

  it("evicts oldest entries beyond the 50-entry cap", () => {
    for (let i = 0; i < 55; i++) {
      writeWalkthroughCache(`hash${i}`, dummy);
    }
    // Oldest (hash0) must be gone; newest (hash54) retained.
    expect(readWalkthroughCache("hash0")).toBeNull();
    expect(readWalkthroughCache("hash54")).toEqual(dummy);
  });
});

describe("vi smoke guard", () => {
  // Referencing vi here keeps this suite's imports honest under strict unused-var runs.
  it("exposes vi", () => {
    expect(vi).toBeDefined();
  });
});