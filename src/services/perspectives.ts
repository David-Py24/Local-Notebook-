import { useStore } from "../stores/useStore";

/**
 * Phase 4 "Perspectives + Fusion" (AGENTIC_ORCHESTRATION_PLAN.md). One topic is
 * analysed from N fixed framings by forking the base agent session and running a
 * sequential goal loop per framing (the wait-for-idle invariant is respected — each
 * run fully finishes before the next forks). Each draft is saved to the Artifacts
 * panel. A final fusion run synthesizes the drafts into one balanced note and writes
 * it to the vault via the gated `create_note` tool at a deterministic path.
 */

export interface PerspectiveFraming {
  id: string;
  title: string;
  angle: (topic: string) => string;
}

export const PERSPECTIVE_FRAMINGS: PerspectiveFraming[] = [
  {
    id: "technical",
    title: "Technical correctness",
    angle: (topic) =>
      "Act as a rigorous subject-matter expert. Read the note below and verify its claims, " +
      "formulas, and definitions for technical correctness. Produce a markdown analysis: " +
      "(a) what is correct, (b) clear errors or over-generalizations, (c) concrete recommended " +
      "corrections.\n\n--- TOPIC TEXT ---\n" +
      topic,
  },
  {
    id: "exam",
    title: "Exam & memory angle",
    angle: (topic) =>
      "Act as a study coach preparing someone for an exam. Turn the note into exam-ready " +
      "material: key facts worth memorizing, likely exam questions with short answers, and " +
      "3-5 mnemonic or spaced-repetition recall prompts.\n\n--- TOPIC TEXT ---\n" +
      topic,
  },
  {
    id: "debate",
    title: "Critique & counter-argument",
    angle: (topic) =>
      "Act as a friendly devil's advocate. Argue the strongest case AGAINST the note's " +
      "central claims, then respond with the strongest defense. Produce the result as a " +
      "balanced markdown essay with a clear conclusion.\n\n--- TOPIC TEXT ---\n" +
      topic,
  },
  {
    id: "beginner",
    title: "Beginner's lens",
    angle: (topic) =>
      "Act as a patient teacher for a complete beginner. Re-explain the note using analogies, " +
      "minimal jargon, and step-by-step reasoning, flagging anywhere the original text assumes " +
      "prior knowledge.\n\n--- TOPIC TEXT ---\n" +
      topic,
  },
  {
    id: "outlook",
    title: "Future & open questions",
    angle: (topic) =>
      "Act as a research strategist. Identify the open questions, edge cases, and promising " +
      "directions that the note hints at but does not resolve, and order them by expected value.\n\n--- TOPIC TEXT ---\n" +
      topic,
  },
];

export interface PerspectiveDraft {
  framingId: string;
  title: string;
  content: string;
  childSessionId: string;
}

export interface PerspectivesResult {
  baseSessionId: string;
  drafts: PerspectiveDraft[];
  fusedNotePath: string | null;
  fusionArtifactId: string | null;
  error?: string;
}

const TOPIC_CAP = 12000;

function sanitizeFilename(title: string): string {
  const cleaned = title
    .replace(/[^A-Za-z0-9 _-]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return cleaned || "topic";
}

function buildFusionGoal(opts: {
  topicTitle: string;
  drafts: PerspectiveDraft[];
  expectedPath: string;
}): string {
  const { drafts, topicTitle, expectedPath } = opts;
  const parts = drafts.map(
    (d, i) => `### ${i + 1}. ${d.title}\n\n${d.content.slice(0, 6000) || "(no text produced)"}`
  );
  return (
    `You are synthesizing ${drafts.length} independent perspective analyses of "${topicTitle}" into ONE ` +
    "balanced markdown note. Cover: (a) conclusions every perspective agrees on, (b) genuine tensions " +
    "or conflicts between perspectives, (c) what a learner should actually take away. " +
    `Use clear headings under a single \`# ${topicTitle}: A Balanced View\` title.\n\n` +
    `After writing the synthesis as markdown, save it to the vault with the create_note tool at path ` +
    `"${expectedPath}" and then reply with a one-line confirmation (file path + word count). ` +
    "If the create_note tool is not available, keep the full markdown in your final reply instead.\n\n" +
    "--- PERSPECTIVE DRAFTS ---\n\n" +
    parts.join("\n\n")
  );
}

/**
 * Runs the full Perspectives + Fusion pipeline:
 *  1. create a base session,
 *  2. fork it once per framing and run one goal loop each (sequential),
 *  3. save every draft as an artifact,
 *  4. run a fusion loop that writes the balanced note via the gated `create_note` tool.
 * Returns the drafts + resulting vault note path (or a fallback artifact id when the
 * file-write tool is disabled).
 */
export async function runPerspectives(opts: {
  topic: string;
  topicTitle?: string;
  framingIds?: string[];
}): Promise<PerspectivesResult> {
  const store = useStore.getState();
  const settings = store.settings;
  const engine = settings.assistantEngine;
  const topicTitle = (opts.topicTitle || "Topic").trim();
  const topic = opts.topic.length > TOPIC_CAP ? `${opts.topic.slice(0, TOPIC_CAP)}\n… (truncated)` : opts.topic;
  const attachmentsDir = (settings.attachmentsFolder || "_attachments").replace(/^\/+|\/+$/g, "");

  const framings = (opts.framingIds ?? PERSPECTIVE_FRAMINGS.map((f) => f.id))
    .map((id) => PERSPECTIVE_FRAMINGS.find((f) => f.id === id))
    .filter((f): f is PerspectiveFraming => !!f);
  if (!framings.length) {
    return { baseSessionId: "", drafts: [], fusedNotePath: null, fusionArtifactId: null, error: "No perspective framings selected." };
  }

  const base = await store.createAgentSession({ title: `${topicTitle} — perspectives`, engine });
  if (!base) {
    return { baseSessionId: "", drafts: [], fusedNotePath: null, fusionArtifactId: null, error: "Could not create the base agent session." };
  }

  const drafts: PerspectiveDraft[] = [];
  let error: string | undefined;

  for (const framing of framings) {
    const child = await store.forkAgentSession(base.id);
    if (!child) {
      error = `Could not fork a session for "${framing.title}".`;
      break;
    }
    const run = await store.runGoalOnSession(child.id, framing.angle(topic), engine);
    const content = run?.latestOutput?.trim() ?? "";
    const draft: PerspectiveDraft = {
      framingId: framing.id,
      title: framing.title,
      content,
      childSessionId: child.id,
    };
    drafts.push(draft);
    if (content) {
      store.addArtifact({
        id: `persp-${child.id}`,
        title: `${topicTitle} — ${framing.title}`,
        type: "markdown",
        content,
        createdAt: Date.now(),
      });
    }
    if (!run) {
      error = `Perspective "${framing.title}" did not complete a run.`;
    }
  }

  let fusedNotePath: string | null = null;
  let fusionArtifactId: string | null = null;

  if (drafts.length) {
    const fusionChild = await store.forkAgentSession(base.id);
    if (!fusionChild) {
      error = error ?? "Could not fork the fusion session.";
    } else {
      const expectedPath = `${attachmentsDir}/orchestration/${sanitizeFilename(topicTitle)}-balanced-view.md`;
      const fusionGoal = buildFusionGoal({
        drafts,
        topicTitle,
        expectedPath,
      });
      const fused = await store.runGoalOnSession(fusionChild.id, fusionGoal, engine);
      const output = fused?.latestOutput?.trim() ?? "";

      // The fusion is contractually supposed to have written the file via create_note.
      // Verify it actually landed; otherwise fall back to an artifact so nothing is lost.
      let wrote = false;
      try {
        const { resolveVaultPath } = await import("./workspaceTools");
        const abs = resolveVaultPath(store.currentFolderPath || "", expectedPath);
        if (abs) {
          const { invoke } = await import("@tauri-apps/api/core");
          const read = await invoke<string | null>("read_local_file", { path: abs });
          wrote = !!read;
        }
      } catch {
        wrote = false;
      }

      if (wrote) {
        fusedNotePath = expectedPath;
      } else {
        const finalContent = output || `# ${topicTitle}: A Balanced View\n\n(Synthesis produced no text.)`;
        fusionArtifactId = `fusion-${fusionChild.id}`;
        store.addArtifact({
          id: fusionArtifactId,
          title: `${topicTitle} — Balanced View (fallback)`,
          type: "markdown",
          content: finalContent,
          createdAt: Date.now(),
        });
        if (!output || !output.includes(".")) {
          error = error ?? "Fusion ran, but the balanced note wasn't written to the vault (file-write tool may be off). Saved it as an artifact instead — enable \"AI file write tools\" in Settings to write it as a note.";
        }
      }
    }
  }

  return { baseSessionId: base.id, drafts, fusedNotePath, fusionArtifactId, error };
}