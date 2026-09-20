/**
 * Phase 6b "Study Tools" registry (AGENTIC_ORCHESTRATION_PLAN.md). A user-managed
 * catalog of reusable study aids (research lookups, paper searches, flashcard
 * templates, ...) shown in Settings. The registry ships with the four research
 * connector presets as seed entries (Wikipedia, Arxiv, Filesystem, Fetch) that are
 * DISABLED until the user turns them on.
 *
 * Seeding rule (mirrors the MCP connector presets): the registry is only seeded when
 * `lsn_study_tools` is absent from localStorage — user edits are never clobbered.
 *
 * Persistence is localStorage (`lsn_study_tools`); there is no Rust table. The tools
 * are metadata for the UI and for future micro-agent/study-tool router expansion.
 */

export interface StudyTool {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  /** Optional ready-to-go micro-agent prompt a user can copy or execute. */
  defaultPrompt?: string;
  /** Free-form per-tool config (placeholders for flashcard/citation templates, etc.). */
  config?: Record<string, unknown>;
}

const STORAGE_KEY = "lsn_study_tools";
export const STUDY_TOOL_MAX = 50;

export const STUDY_TOOL_PRESETS: StudyTool[] = [
  {
    id: "tool-wikipedia",
    name: "Wikipedia Research",
    description: "Look up a topic across Wikipedia: summary, key facts, and links to related articles.",
    enabled: false,
    defaultPrompt:
      "Use the Wikipedia research connector to look up \"{topic}\" and give me a one-paragraph summary plus 5 key facts.",
  },
  {
    id: "tool-arxiv",
    name: "Arxiv Papers",
    description: "Search arXiv for academic papers on a subject and summarize the most relevant ones.",
    enabled: false,
    defaultPrompt:
      "Search arXiv for recent papers on \"{topic}\", list the 3 most relevant, and summarize each in 2-3 sentences.",
  },
  {
    id: "tool-filesystem",
    name: "Vault Files",
    description: "Search and read source files inside the vault to ground answers in your own notes.",
    enabled: false,
    defaultPrompt:
      "Find notes in my vault that mention \"{topic}\" and explain what my existing notes say about it.",
  },
  {
    id: "tool-fetch",
    name: "Fetch URL",
    description: "Fetch a web page by URL and summarize or extract the content into a note.",
    enabled: false,
    defaultPrompt:
      "Fetch {url}, summarize the main argument, and save the summary as a note.",
  },
];

/** Read the registry; seed it once from the presets when the key is absent. */
export function getStudyTools(): StudyTool[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as StudyTool[];
    }
  } catch {
    // Fall through to a fresh seed.
  }
  const seeded = STUDY_TOOL_PRESETS.map((p) => ({
    ...p,
    defaultPrompt: p.defaultPrompt,
    config: p.config,
  }));
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  } catch {
    // localStorage unavailable — still return the seeded list for this session.
  }
  return seeded;
}

/** Persist the whole registry (respecting the seed-once / never-clobber rule). */
export function saveStudyTools(tools: StudyTool[]): void {
  const capped = tools.slice(0, STUDY_TOOL_MAX);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // Best-effort.
  }
}

/** Flip one tool's enabled flag and persist. Returns the updated list. */
export function setStudyToolEnabled(id: string, enabled: boolean): StudyTool[] {
  const tools = getStudyTools().map((t) => (t.id === id ? { ...t, enabled } : t));
  saveStudyTools(tools);
  return tools;
}

/** Add a custom tool (user-created flashcard/citation template, etc.). */
export function addStudyTool(tool: StudyTool): StudyTool[] {
  const tools = [...getStudyTools(), tool];
  saveStudyTools(tools);
  return tools;
}

/** Remove a tool from the registry. */
export function deleteStudyTool(id: string): StudyTool[] {
  const tools = getStudyTools().filter((t) => t.id !== id);
  saveStudyTools(tools);
  return tools;
}

export const studyToolsStorageKey = STORAGE_KEY;