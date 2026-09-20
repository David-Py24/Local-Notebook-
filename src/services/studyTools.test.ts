import { describe, it, expect, beforeEach } from "vitest";
import {
  STUDY_TOOL_PRESETS,
  addStudyTool,
  deleteStudyTool,
  getStudyTools,
  saveStudyTools,
  setStudyToolEnabled,
  studyToolsStorageKey,
} from "./studyTools";

describe("getStudyTools — seed-once semantics", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("seeds the four presets (all disabled) when the key is absent", () => {
    expect(window.localStorage.getItem(studyToolsStorageKey)).toBeNull();
    const tools = getStudyTools();
    expect(tools).toHaveLength(4);
    expect(tools.map((t) => t.id)).toEqual([
      "tool-wikipedia",
      "tool-arxiv",
      "tool-filesystem",
      "tool-fetch",
    ]);
    expect(tools.every((t) => t.enabled === false)).toBe(true);
    // The seed persists so later reads don't re-seed.
    expect(window.localStorage.getItem(studyToolsStorageKey)).not.toBeNull();
  });

  it("does not clobber user edits on re-read", () => {
    getStudyTools();
    setStudyToolEnabled("tool-wikipedia", true);
    const again = getStudyTools();
    expect(again).toHaveLength(4);
    expect(again.find((t) => t.id === "tool-wikipedia")?.enabled).toBe(true);
  });

  it("returns stored custom tools verbatim on later reads", () => {
    getStudyTools();
    addStudyTool({ id: "tool-custom", name: "Flashcards", description: "Generate flashcards", enabled: true });
    const again = getStudyTools();
    expect(again).toHaveLength(5);
    expect(again.find((t) => t.id === "tool-custom")?.name).toBe("Flashcards");
  });

  it("preserves the seed defaults intact for callers (fresh array per call)", () => {
    const a = getStudyTools();
    a[0].name = "mutated";
    const b = getStudyTools();
    expect(b[0].name).toBe("Wikipedia Research");
  });
});

describe("registry mutations", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("setStudyToolEnabled toggles one tool and persists it", () => {
    getStudyTools();
    const updated = setStudyToolEnabled("tool-arxiv", true);
    expect(updated.find((t) => t.id === "tool-arxiv")?.enabled).toBe(true);
    expect(updated.find((t) => t.id === "tool-wikipedia")?.enabled).toBe(false);
  });

  it("saveStudyTools caps the registry at STUDY_TOOL_MAX", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `t${i}`,
      name: `Tool ${i}`,
      description: "",
      enabled: false,
    }));
    saveStudyTools(many);
    expect(getStudyTools()).toHaveLength(50);
  });

  it("deleteStudyTool removes by id", () => {
    getStudyTools();
    const updated = deleteStudyTool("tool-fetch");
    expect(updated.find((t) => t.id === "tool-fetch")).toBeUndefined();
    expect(updated).toHaveLength(3);
  });
});

describe("STUDY_TOOL_PRESETS", () => {
  it("mirrors the four research connector presets as disabled stubs", () => {
    expect(STUDY_TOOL_PRESETS.map((p) => p.id)).toEqual([
      "tool-wikipedia",
      "tool-arxiv",
      "tool-filesystem",
      "tool-fetch",
    ]);
    expect(STUDY_TOOL_PRESETS.every((p) => p.enabled === false)).toBe(true);
  });
});