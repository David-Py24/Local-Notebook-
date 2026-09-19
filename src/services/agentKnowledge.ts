import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "../stores/useStore";
import type { Artifact } from "../stores/useStore";
import { embedTexts, streamAIResponse, ChatMessagePayload } from "./aiProvider";

// ---------------------------------------------------------------------------
// Agent Knowledge Service (AGENT_MEMORY_RAG_PLAN.md, Phase 2).
// Single frontend wrapper over the Memory-RAG commands consumed by every surface
// (Study Assistant, Micro Agent panel, OpenCode bootstrap). Mirrors the tool-loop
// pattern in aiProvider.ts: all AI HTTP lives here/in aiProvider, Rust stores + ranks.
// ---------------------------------------------------------------------------

export interface RagHit {
  path: string;
  title: string;
  snippet: string;
  score: number;
  char_offset: number;
}

export interface MemoryItem {
  id: number;
  scope: string;
  kind: string;
  content: string;
  source: string;
  topic_title: string | null;
  created_at: string;
  score: number;
}

export interface ActiveNoteContext {
  path: string;
  title: string;
  excerpt: string;
}

export interface Backlink {
  id?: number;
  source_path: string;
  target_path: string;
  link_text: string;
  line_number: number;
}

export interface ContextBundle {
  scope: string;
  memory: MemoryItem[];
  rag: RagHit[];
  active_note: ActiveNoteContext | null;
  backlinks: Backlink[];
}

/** Embeds one query text; returns [] when the embed server is unreachable. */
async function embedQuery(text: string, settings: Settings): Promise<number[]> {
  try {
    const [vec] = await embedTexts([text], settings);
    return vec ?? [];
  } catch {
    return [];
  }
}

/**
 * Lazy, idempotent embedding rebuild: pulls chunks whose embedding is still NULL and
 * batches them to the Ollama server until none remain. Returns how many rows gained a
 * vector; stops early (returns accumulated count) if the server goes away mid-loop.
 */
export async function rebuildEmbeddings(vaultRoot: string, settings: Settings, batchSize = 16): Promise<number> {
  let total = 0;
  for (;;) {
    const chunks = await invoke<Array<{ rowid: number; path: string; chunk_index: number; text: string }>>(
      "get_unembedded_chunks",
      { vaultRoot, limit: batchSize }
    );
    if (!chunks.length) break;

    const embeddings = await embedTexts(chunks.map((c) => c.text), settings);
    const items: Array<{ rowid: number; embedding: number[] }> = [];
    chunks.forEach((c, i) => {
      const vec = embeddings[i];
      if (vec && vec.length) items.push({ rowid: c.rowid, embedding: vec });
    });
    if (!items.length) break; // embed server unavailable — keep what we have

    const updated = await invoke<number>("store_chunk_embeddings", {
      items,
      embedModel: settings.embedModel || "nomic-embed-text",
    });
    total += updated;
  }
  return total;
}

/**
 * Fetches the single ContextBundle a turn needs: recent related memory, RAG passages,
 * active-note excerpt, and backlinks. `queryText` defaults to the scope (topic title).
 */
export async function fetchContextBundle(opts: {
  vaultRoot: string;
  scope: string;
  queryText?: string;
  activeNotePath?: string | null;
  limit?: number;
}): Promise<ContextBundle | null> {
  const state = await import("../stores/useStore");
  const settings = state.useStore.getState().settings;
  if (!opts.vaultRoot || !opts.scope) return null;

  const queryText = opts.queryText || opts.scope;
  const queryEmbedding = await embedQuery(queryText, settings);

  return invoke<ContextBundle>("get_context_bundle", {
    vaultRoot: opts.vaultRoot,
    scope: opts.scope,
    queryText,
    queryEmbedding,
    activeNotePath: opts.activeNotePath ?? null,
    ragLimit: opts.limit ?? settings.ragTopK ?? 5,
  });
}

/** Persists a durable memory entry (kind: fact | context | message) with an embedding. */
export async function remember(opts: {
  scope: string;
  kind: "fact" | "context" | "message";
  content: string;
  source: string;
  topicTitle?: string;
}, settings?: Settings): Promise<number | null> {
  if (!opts.content.trim()) return null;
  const s = settings ?? (await import("../stores/useStore")).useStore.getState().settings;
  const embedding = await embedQuery(opts.content, s);
  try {
    return await invoke<number>("add_memory", {
      scope: opts.scope,
      kind: opts.kind,
      content: opts.content,
      source: opts.source,
      topicTitle: opts.topicTitle ?? null,
      embedding,
    });
  } catch {
    return null;
  }
}

/** Semantic recall over durable memory; degrades to keyword (created_at desc) offline. */
export async function recall(opts: {
  query: string;
  scope?: string;
  limit?: number;
}): Promise<MemoryItem[]> {
  const s = (await import("../stores/useStore")).useStore.getState().settings;
  const embedding = await embedQuery(opts.query, s);
  try {
    return await invoke<MemoryItem[]>("recall_memory", {
      scope: opts.scope ?? "global",
      queryText: opts.query,
      queryEmbedding: embedding,
      limit: opts.limit ?? s.ragTopK ?? 5,
    });
  } catch {
    return [];
  }
}

/** Renders a ContextBundle into prompt-injectable markdown. */
export function formatContextBundle(bundle: ContextBundle): string {
  const parts: string[] = [];

  if (bundle.active_note) {
    parts.push(
      `### Active Note: ${bundle.active_note.title}\nPath: \`${bundle.active_note.path}\`\n\n${bundle.active_note.excerpt.slice(0, 2000)}`
    );
  }

  if (bundle.rag.length) {
    const passages = bundle.rag
      .map((r) => `- **[${r.title}]** (score ${r.score.toFixed(3)}): ${r.snippet}`)
      .join("\n");
    parts.push(`### Related notes (retrieved)\n${passages}`);
  }

  if (bundle.memory.length) {
    const mem = bundle.memory
      .map((m) => `- [${m.kind}/${m.scope}] ${m.content}`)
      .join("\n");
    parts.push(`### Prior memory\n${mem}`);
  }

  if (bundle.backlinks.length) {
    const links = bundle.backlinks
      .map((b) => `- Linked from \`${b.source_path}\` (line ${b.line_number}): "${b.link_text}"`)
      .join("\n");
    parts.push(`### Backlinks\n${links}`);
  }

  return parts.join("\n\n");
}

/**
 * Composes the ChatMessagePayload[] the Study Assistant (and other surfaces) send to the
 * model: a system prompt fused with the Memory-RAG context bundle (memory digest, RAG
 * passages, backlinks), recent history, and an optional attachment block appended to the
 * latest user message. Replaces the ad-hoc `contextPrefix` + bare `slice(-10)` in
 * `sendAssistantMessage`. Degrades gracefully: offline/embed-server errors fall back to
 * the plain prompt + history.
 */
export async function buildPromptWithContext(opts: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  settings: Settings;
  scope: string;
  vaultRoot?: string;
  queryText?: string;
  attachment?: string;
  ragLimit?: number;
}): Promise<ChatMessagePayload[]> {
  const { settings, messages, scope, vaultRoot } = opts;
  const systemBase = settings.aiSystemPrompt || "You are an intelligent study assistant for Local Study Notebook.";

  let bundle: ContextBundle | null = null;
  if (vaultRoot) {
    try {
      bundle = await fetchContextBundle({
        vaultRoot,
        scope,
        queryText: opts.queryText || scope,
        limit: opts.ragLimit ?? settings.ragTopK ?? 5,
      });
    } catch {
      bundle = null;
    }
  }

  const contextBlock = bundle ? formatContextBundle(bundle) : "";
  const system = contextBlock
    ? `${systemBase}\n\nUse this retrieved context. Do not claim facts beyond it:\n\n${contextBlock}`
    : systemBase;

  const history = messages.slice(-10).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const historyPayload: ChatMessagePayload[] = [
    { role: "system", content: system },
    ...history,
  ];

  // Attach context (active-note excerpt, etc.) to the newest user turn explicitly.
  if (opts.attachment && historyPayload.length > 1) {
    const last = historyPayload[historyPayload.length - 1];
    historyPayload[historyPayload.length - 1] = {
      ...last,
      content: `${opts.attachment}${last.content}`,
    };
  }

  return historyPayload;
}

/** Persists a Q&A turn to durable memory when `memoryAutoSave` is enabled. */
export async function persistConversationTurn(opts: {
  userText: string;
  assistantText: string;
  scope: string;
}, settings?: Settings): Promise<number | null> {
  const s = settings ?? (await import("../stores/useStore")).useStore.getState().settings;
  if (s.memoryAutoSave === false) return null;
  if (!opts.assistantText.trim()) return null;
  return remember(
    {
      scope: opts.scope,
      kind: "message",
      content: `Q: ${opts.userText}\nA: ${opts.assistantText.slice(0, 2000)}`,
      source: "study-assistant",
      topicTitle: opts.scope,
    },
    s
  );
}

/** Slugifies a title into a safe filename stem (kept short for Windows paths). */
function slugify(title: string): string {
  const slug = (title || "artifact")
    .toLowerCase()
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return slug || "artifact";
}

/**
 * Persists the artifact registry to `<vault>/.lsn_artifacts/index.json` so AI output
 * survives app restarts. The `.lsn_artifacts` folder starts with `.`, so the Rust
 * `reindex_dir_recursive` walk (which skips dot-entries) never indexes it.
 */
export async function persistArtifacts(vaultRoot: string, artifacts: Artifact[]): Promise<void> {
  if (!vaultRoot) return;
  try {
    await invoke("create_local_dir", { parentPath: vaultRoot, name: ".lsn_artifacts", vaultRoot });
  } catch {
    // already exists (or races) — the write below errors loudly if it truly can't.
  }
  await invoke("write_local_file", {
    path: `${vaultRoot.replace(/[\\/]+$/, "")}/.lsn_artifacts/index.json`,
    content: JSON.stringify(artifacts),
    vaultRoot,
  });
}

/** Reads the artifact registry back; returns null when no persisted registry exists. */
export async function loadPersistedArtifacts(vaultRoot: string): Promise<Artifact[] | null> {
  if (!vaultRoot) return null;
  try {
    const text = await invoke<string>("read_local_file", {
      path: `${vaultRoot.replace(/[\\/]+$/, "")}/.lsn_artifacts/index.json`,
      vaultRoot,
    });
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? (parsed as Artifact[]) : null;
  } catch {
    return null;
  }
}

/**
 * Exports an artifact (title + content) into `<vault>/_attachments/exports/`.
 * `.md` is written with the existing local-file API; `pdf` is rendered by the Rust
 * `export_markdown_to_pdf` command. Returns the absolute written path.
 */
export async function exportArtifact(opts: {
  title: string;
  content: string;
  vaultRoot: string;
  format: "markdown" | "pdf";
}): Promise<string> {
  const { title, content, vaultRoot, format } = opts;
  if (!vaultRoot) throw new Error("No active workspace folder opened.");

  const stem = slugify(title);
  const base = `${vaultRoot.replace(/[\\/]+$/, "")}/_attachments/exports`;

  // Ensure the export sink exists; create_local_dir uses create_dir_all so nesting is fine.
  try {
    await invoke("create_local_dir", { parentPath: vaultRoot, name: "_attachments/exports", vaultRoot });
  } catch {
    // already exists (or races) — the file write below errors loudly if it doesn't.
  }

  if (format === "pdf") {
    const targetPath = `${base}/${stem}.pdf`;
    const written = await invoke<string>("export_markdown_to_pdf", {
      title: title || stem,
      content,
      targetPath,
      vaultRoot,
    });
    return written;
  }

  const target = `${base}/${stem}.md`;
  await invoke("write_local_file", { path: target, content, vaultRoot });
  return target;
}

/**
 * Micro-agent executor used by the Agent panel (summarize/improve/assess/custom) and
 * reuseable anywhere a one-shot task needs memory + RAG context. Streams the completion
 * through `onChunk` and returns the final text.
 */
export async function runAgentTask(opts: {
  task: string;
  context: string;
  scope: string;
  vaultRoot: string;
  onChunk?: (text: string) => void;
  onStatusChange?: (status: string) => void;
  onToolCall?: (tool: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const { useStore } = await import("../stores/useStore");
  const store = useStore.getState();
  const settings = store.settings;

  const bundle = await fetchContextBundle({
    vaultRoot: opts.vaultRoot,
    scope: opts.scope,
    queryText: opts.context || opts.scope,
    activeNotePath: store.activeLeftTabId || store.activeRightTabId,
  });

  const contextBlock = bundle ? formatContextBundle(bundle) : "";
  const system = [
    "You are the Local Study Notebook micro-agent. Perform the requested task using only the provided context and your own knowledge.",
    "Do not invent facts not supported by the context. Keep the answer concise and well-structured.",
  ].join(" ");

  const messages: ChatMessagePayload[] = [
    { role: "system", content: system },
    {
      role: "user",
      content: `[TASK]\n${opts.task}\n\n[CONTEXT]\n${contextBlock || opts.context}\n[TARGET TEXT]\n${opts.context}`,
    },
  ];

  let out = "";
  await streamAIResponse({
    messages,
    settings,
    onChunk: (t) => {
      out = t;
      opts.onChunk?.(t);
    },
    onStatusChange: opts.onStatusChange,
    onToolCall: (name) => opts.onToolCall?.(name),
    signal: opts.signal,
  });
  return out;
}