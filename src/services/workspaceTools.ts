import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../stores/useStore";
import type { McpConnector } from "../types";

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

// Wire shapes returned by the Rust MCP host (src-tauri/src/mcp.rs).
interface McpTool {
  name: string;
  description: string;
  input_schema: ToolDefinition["function"]["parameters"];
}

interface McpContent {
  type: string;
  text?: string;
}

interface McpCallResult {
  content: McpContent[];
  is_error: boolean;
}

/** Maps a frontend connector to the Rust `ConnectorConfig` wire shape (snake_case keys). */
function connectorToConfig(c: McpConnector): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    command: c.command,
    args: c.args,
    cwd: c.cwd,
    url: c.url,
    headers: c.headers,
    env: c.env,
    tools: c.tools,
  };
}

function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : !!navigator.onLine;
}

const CONNECTOR_TOOLS_TTL_MS = 60_000;
const connectorToolsCache = new Map<string, { at: number; tools: McpTool[] }>();

function connectorCacheKey(c: McpConnector): string {
  return `${c.id}|${JSON.stringify({
    name: c.name,
    kind: c.kind,
    command: c.command,
    args: c.args,
    cwd: c.cwd,
    url: c.url,
    headers: c.headers,
    env: c.env,
  })}`;
}

function mcpResultToString(result: McpCallResult): string {
  const parts = result.content
    .map((c) => (c.type === "text" && c.text ? c.text : `[${c.type} content not renderable as text]`))
    .filter(Boolean);
  if (parts.length === 0) return "(connector returned no content)";
  return parts.join("\n\n");
}

/**
 * Builds the full tool list sent to the AI model: builtin workspace tools merged with
 * every enabled connector's tools. Connector names are namespaced as `<connector>/<tool>`
 * so builtin vs connector tools can never collide; the dispatch path strips the prefix.
 * Offline http connectors are excluded so the model never wastes a turn on an
 * unreachable cloud server.
 */
export async function buildEffectiveTools(): Promise<ToolDefinition[]> {
  const tools: ToolDefinition[] = [...WORKSPACE_TOOLS];
  const settings = useStore.getState().settings;
  // Agent control meta tools (create/fork sessions, set goal, schedule tasks) — no file
  // writes, gated behind aiEnableAgentControls (default true) so a model can never
  // invoke them when the user has opted out.
  if (settings.aiEnableAgentControls) {
    tools.push(...CONTROL_TOOLS);
  }
  // File-mutation tools are gated off entirely unless aiEnableFileWrite is on (Phase 2b).
  if (settings.aiEnableFileWrite) {
    tools.push(...FILE_WRITE_TOOLS);
  }
  const connectors = useStore.getState().settings.connectors.filter((c) => c.enabled);
  for (const connector of connectors) {
    if (connector.kind === "http" && !isOnline()) continue;
    // TTL-cache per connector identity+config so tools/list isn't re-pinged on every
    // turn. Editing a connector changes its fingerprint and bypasses the cache.
    const key = connectorCacheKey(connector);
    const cached = connectorToolsCache.get(key);
    let mcpTools: McpTool[] | null = null;
    if (cached && Date.now() - cached.at < CONNECTOR_TOOLS_TTL_MS) {
      mcpTools = cached.tools;
    } else {
      try {
        mcpTools = await invoke<McpTool[]>("list_connector_tools", {
          config: connectorToConfig(connector),
        });
        connectorToolsCache.set(key, { at: Date.now(), tools: mcpTools });
      } catch (err) {
        console.warn(`[MCP] Skipping connector "${connector.name}":`, err);
        continue;
      }
    }
    for (const t of mcpTools) {
      tools.push({
        type: "function",
        function: {
          name: `${connector.name}/${t.name}`,
          description: t.description,
          parameters: t.input_schema,
        },
      });
    }
  }
  return tools;
}

export const WORKSPACE_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "search_vault",
      description: "Search local markdown notes in the user's workspace for keywords or topics.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query or keyword to locate in workspace notes.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_active_note",
      description: "Read the full contents of the currently active note open in the editor.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_note_backlinks",
      description: "Get incoming backlinks and outgoing connections for a specific note path.",
      parameters: {
        type: "object",
        properties: {
          note_path: {
            type: "string",
            description: "The path or filename of the note to retrieve backlinks for.",
          },
        },
        required: ["note_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rag_search",
      description:
        "Semantic + keyword search over the workspace notes (Memory-RAG) that returns the most relevant passages for a query, even when wording differs.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The question or topic to retrieve context for.",
          },
          limit: {
            type: "number",
            description: "Maximum passages to return (default 5).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recall_memory",
      description:
        "Recall durable memory entries (facts, prior Q&A, user context) for a topic or query, semantically by default, keyword fallback offline.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "What to recall (topic, question, or fact).",
          },
          scope: {
            type: "string",
            description: 'Optional memory scope filter, e.g. a topic title or "global".',
          },
          limit: {
            type: "number",
            description: "Maximum entries to return (default 5).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description:
        "Persist a durable fact or context about the user, a topic, or their workspace so future turns can recall it.",
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            description: 'Memory scope: a topic title or "global".',
          },
          content: {
            type: "string",
            description: "The fact or context to remember (1-3 sentences).",
          },
          topic_title: {
            type: "string",
            description: "Optional topic title for grouping.",
          },
        },
        required: ["scope", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_note_context",
      description:
        "Get the full context bundle for a single note: related passages (RAG), prior memory, backlinks, and the note's contents.",
      parameters: {
        type: "object",
        properties: {
          note_path: {
            type: "string",
            description: "Path of the note to build context for (defaults to the active note).",
          },
          query: {
            type: "string",
            description: "Optional question/topic to rank context against.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_recent_notes",
      description: "List markdown notes available in the workspace (top-level folders included).",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum entries to list (default 20).",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_status",
      description:
        "Get the current git status of the workspace: branch name and changed/staged/untracked files. Read-only — does not run a shell.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_diff",
      description:
        "Get the git diff for a single file in the workspace, vault-relative path. Read-only — does not run a shell.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative path of the file to diff.",
          },
          staged: {
            type: "boolean",
            description: "Diff the staged (index) version instead of the working-tree version (default false).",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_note",
      description: "Read the full text content of any note in the vault by its vault-relative path (e.g. 'Guides/Physics.md').",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative path of the note to read.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_artifacts",
      description: "List all AI-generated artifacts created in the current session.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_artifact",
      description: "Delete an artifact by its ID.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "ID of the artifact to delete.",
          },
        },
        required: ["id"],
      },
    },
  },
];

// File-mutation tools (Phase 2b) — only exposed to the model when
// `settings.aiEnableFileWrite` is enabled (default off). delete/rename/overwrite still
// pass through the user approval gate in `executeWorkspaceTool`.
export const FILE_WRITE_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "create_note",
      description:
        "Create a new markdown note at a vault-relative path (e.g. 'Guides/Chemistry.md'). Fails if a file already exists at that path. Use for creating new study notes and guides.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative path of the new note, e.g. 'Guides/Organic Chemistry.md'.",
          },
          content: {
            type: "string",
            description: "Full markdown content (start with a `# Title` heading).",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_note",
      description:
        "Overwrite an existing note with new content, or create it when create_if_missing is true. Overwriting a non-empty file requires user approval.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative path of the note to edit.",
          },
          content: {
            type: "string",
            description: "Full replacement markdown content.",
          },
          create_if_missing: {
            type: "boolean",
            description: "Create the file when it doesn't exist yet (default false).",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "append_note",
      description:
        "Append content to the end of an existing note (or create it if missing). Safe alternative to full edit; requires approval if non-empty.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative path of the note to append to.",
          },
          content: {
            type: "string",
            description: "Markdown text to append.",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_note",
      description:
        "Permanently delete a note (or folder) from the vault. DANGEROUS — requires explicit user approval before it runs.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative path of the note or folder to delete.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rename_note",
      description:
        "Rename or move a note within the vault. Requires user approval before it runs.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative current path.",
          },
          new_name: {
            type: "string",
            description: "New vault-relative path.",
          },
        },
        required: ["path", "new_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_folder",
      description: "Create a new folder inside the vault (creates intermediate folders too).",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative folder path, e.g. 'Guides/Physics'.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "export_markdown",
      description:
        "Export text as a .md file into the vault, defaulting to '_attachments/exports/'. Creates parent folders as needed. Safe: only ever creates new files, never overwrites without the user.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative output path, e.g. '_attachments/exports/Study Guide.md'.",
          },
          content: {
            type: "string",
            description: "The markdown content to write.",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "export_pdf",
      description:
        "Render markdown text into an A4 PDF and save it into the vault, defaulting to '_attachments/exports/'. Creates parent folders as needed. Safe: only ever creates new files, never overwrites without the user.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative output path ending in .pdf, e.g. '_attachments/exports/Study Guide.pdf'.",
          },
          title: {
            type: "string",
            description: "PDF document title (defaults to the filename).",
          },
          content: {
            type: "string",
            description: "The markdown content to render.",
          },
        },
        required: ["path", "content"],
      },
    },
  },
];

/**
 * Agent control meta tools (AGENTIC_ORCHESTRATION_PLAN.md Phase 6). These let the
 * agent create/fork sessions, arm/stop a goal run, and schedule study tasks from chat.
 * They perform NO file writes, so unlike FILE_WRITE_TOOLS they pass through the normal
 * router without the destructive-approval gate. Exposed to models only when
 * `settings.aiEnableAgentControls` is on (default true) — see buildEffectiveTools().
 * Each dispatcher returns the resulting session/task id as text so the model can cite it.
 */
export const CONTROL_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "create_session",
      description:
        "Create a new agent session (durable, resumable). Returns the new session id. Optional title and engine ('opencode' | 'byok').",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Session title (optional)." },
          engine: { type: "string", description: "Engine: 'opencode' or 'byok' (defaults to the app's current engine)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_sessions",
      description: "List recent agent sessions (id, title, engine, status).",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fork_session",
      description:
        "Fork an existing agent session into a new child session that inherits its context (keeps parent lineage). Returns the new child session id.",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string", description: "The parent session id." },
        },
        required: ["session_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_goal",
      description:
        "Arm an autonomous study goal on the active (or given) session. The agent runs a capped loop with a built-in auditor until it judges the goal done, it hits the token budget, or 3 stuck strikes block it. Returns a start confirmation.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", description: "The study goal to pursue." },
          session_id: { type: "string", description: "Session to run on (defaults to the active one)." },
        },
        required: ["goal"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "stop_goal",
      description: "Hard-stop any running goal loop. Stop always wins over a running agent.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_scheduled_task",
      description:
        "Create a scheduled study task that fires while the app is open. Returns the new task id. `schedule_sel` is 'once' | 'daily' | 'weekly' | 'cron'; weekly tasks take `weekday` (comma-separated 0-6, 0=Mon), daily/weekly/once take `time` (HH:mm), cron tasks take a `cron` expression.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Task name." },
          prompt: { type: "string", description: "Goal/prompt executed when the task fires." },
          schedule_sel: { type: "string", description: "'once' | 'daily' | 'weekly' | 'cron'." },
          time: { type: "string", description: "HH:mm for daily/weekly/once (default '09:00')." },
          weekday: { type: "string", description: "Comma-separated 0-6 for weekly (0=Mon)." },
          cron: { type: "string", description: "Cron expression for 'cron'." },
        },
        required: ["name", "prompt", "schedule_sel"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_scheduled_tasks",
      description: "List scheduled study tasks (id, name, schedule, next run, enabled).",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

/** Whether a tool name is one of the agent control meta tools. */
export function isControlTool(name: string): boolean {
  return CONTROL_TOOLS.some((t) => t.function.name === name);
}

/**
 * Resolves a vault-relative path to an absolute one, refusing anything that escapes the
 * vault root (`..`, absolute paths, drive letters). Mirrors Rust `validate_vault_path`.
 */
export function resolveVaultPath(vaultRoot: string, rel: string): string | null {
  if (!vaultRoot || typeof rel !== "string" || !rel.trim()) return null;
  if (rel.includes("\0")) return null;
  const normalized = rel.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) return null;
  // vaultRoot arrives with OS-native separators (backslashes on Windows). Normalize it
  // to forward slashes BEFORE building `joined`, not just for the `rootLower` comparison
  // — otherwise `cleaned` keeps Windows backslashes while `rootLower` doesn't, so
  // `cleaned.startsWith(rootLower)` is false for every path on every Windows vault,
  // and every write tool fails with a bogus "must stay inside the vault root" error.
  const rootNorm = vaultRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const joined = rootNorm + "/" + normalized;
  // Segment-filtering drops the leading "" from an absolute POSIX path's split("/")
  // (e.g. "/Users/x".split("/") -> ["", "Users", "x"]) — restore that leading slash
  // afterwards so a POSIX vault root (macOS/Linux) doesn't silently lose it and fail
  // the vault-root prefix check below.
  const isAbsolutePosix = joined.startsWith("/");
  const cleaned =
    (isAbsolutePosix ? "/" : "") +
    joined
      .split("/")
      .reduce<string[]>((acc, seg) => {
        if (seg === "..") acc.pop();
        else if (seg !== "." && seg !== "") acc.push(seg);
        return acc;
      }, [])
      .join("/");
  const rootLower = rootNorm.toLowerCase();
  const check = cleaned.toLowerCase();
  if (check === rootLower) return null;
  if (!check.startsWith(rootLower + "/")) return null;
  return cleaned;
}

/** Polls the approval gate until the user resolves the request. */
function awaitApproval(id: string): Promise<boolean> {
  return new Promise((resolve) => {
    const poll = setInterval(() => {
      const item = useStore.getState().pendingToolApprovals.find((p) => p.id === id);
      if (!item || item.status !== "pending") {
        clearInterval(poll);
        resolve(item?.status === "approved");
      }
    }, 150);
  });
}

/** Adds an approval request and waits for the user; auto-denies when the store entry is gone. */
async function requireApproval(opts: {
  tool: string;
  args: Record<string, any>;
  summary: string;
}): Promise<boolean> {
  const id = "tool-approval-" + Date.now() + "-" + Math.round(Math.random() * 1e6);
  useStore.getState().addPendingToolApproval({
    id,
    tool: opts.tool,
    args: opts.args,
    summary: opts.summary,
    status: "pending",
  });
  return awaitApproval(id);
}

let postWriteTimer: ReturnType<typeof setTimeout> | null = null;

/** Reindexes the vault after a write tool succeeds, then lazily re-embeds (Phase 2b). */
function triggerPostWriteReindex(vaultRoot: string): void {
  invoke("reindex_vault", { vaultRoot })
    .then(() => {
      if (postWriteTimer !== null) clearTimeout(postWriteTimer);
      postWriteTimer = setTimeout(() => {
        postWriteTimer = null;
        const settings = useStore.getState().settings;
        if (!settings.aiEnabled) return;
        import("./agentKnowledge").then(({ rebuildEmbeddings }) => {
          rebuildEmbeddings(vaultRoot, settings).catch(() => {});
        });
      }, 500);
    })
    .catch(() => {});
}

export async function executeWorkspaceTool(name: string, args: Record<string, any>): Promise<string> {
  const store = useStore.getState();
  const vaultRoot = store.currentFolderPath;

  try {
    if (name === "search_vault") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      const results = await invoke<Array<{ path: string; title: string; snippet: string; line_number: number }>>("search_vault", {
        vaultRoot,
        query: args.query || "",
      });

      if (!results || results.length === 0) {
        return `No matching note snippets found for query "${args.query}".`;
      }

      return results
        .map((r) => `- [${r.title}] (Line ${r.line_number}): ${r.snippet}`)
        .join("\n");
    }

    if (name === "read_active_note") {
      const activePath = store.activeLeftTabId || store.activeRightTabId;
      if (!activePath) return "No active tab open in the editor.";

      const content = store.activePanel === "left" ? store.leftDraft : store.rightDraft;
      const title = activePath.split(/[\\/]/).pop();
      return `### Active Note: ${title}\nPath: ${activePath}\n\n${content}`;
    }

    if (name === "get_note_backlinks") {
      const notePath = args.note_path || store.activeLeftTabId || "";
      if (!notePath) return "No note path specified.";

      const backlinks = await invoke<Array<{ source_path: string; link_text: string; line_number: number }>>("get_backlinks", {
        targetPath: notePath,
      });

      if (!backlinks || backlinks.length === 0) {
        return `No incoming backlinks found for "${notePath}".`;
      }

      return backlinks
        .map((b) => `- Linked from [${b.source_path.split(/[\\/]/).pop()}] (Line ${b.line_number}): "${b.link_text}"`)
        .join("\n");
    }

    if (name === "rag_search") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      const settings = useStore.getState().settings;
      const { embedTexts } = await import("./aiProvider");
      const embedding = (await embedTexts([String(args.query || "")], settings))[0] ?? [];
      const results = await invoke<Array<{ path: string; title: string; snippet: string; score: number }>>("search_rag", {
        vaultRoot,
        queryText: String(args.query || ""),
        queryEmbedding: embedding,
        limit: Math.max(1, Number(args.limit) || settings.ragTopK || 5),
      });
      if (!results || results.length === 0) {
        return `No relevant passages found for "${args.query}".`;
      }
      return results
        .map((r) => `- [${r.title}] (score ${r.score.toFixed(3)}): ${r.snippet}`)
        .join("\n");
    }

    if (name === "recall_memory") {
      const settings = useStore.getState().settings;
      const { embedTexts } = await import("./aiProvider");
      const query = String(args.query || "");
      const embedding = (await embedTexts([query], settings))[0] ?? [];
      const results = await invoke<Array<{ id: number; scope: string; kind: string; content: string; created_at: string; score: number }>>("recall_memory", {
        scope: String(args.scope || "global"),
        queryText: query,
        queryEmbedding: embedding,
        limit: Math.max(1, Number(args.limit) || settings.ragTopK || 5),
      });
      if (!results || results.length === 0) return `No recalled memory for "${query}".`;
      return results
        .map((m) => `- [${m.kind}/${m.scope}] ${m.content}`)
        .join("\n");
    }

    if (name === "save_memory") {
      const { remember } = await import("./agentKnowledge");
      const content = String(args.content || "").trim();
      if (!content) return "Error: save_memory requires a non-empty content.";
      const settings = useStore.getState().settings;
      await remember(
        {
          scope: String(args.scope || "global"),
          kind: "fact",
          content,
          source: "ai-assistant",
          topicTitle: args.topic_title ? String(args.topic_title) : undefined,
        },
        settings
      );
      return `Remembered: ${content.slice(0, 300)}`;
    }

    if (name === "get_note_context") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      const { fetchContextBundle, formatContextBundle } = await import("./agentKnowledge");
      const notePath = args.note_path || store.activeLeftTabId || store.activeRightTabId || null;
      const bundle = await fetchContextBundle({
        vaultRoot,
        scope: notePath ? notePath.split(/[\\/]/).pop() || "note" : "global",
        queryText: args.query ? String(args.query) : undefined,
        activeNotePath: notePath,
      });
      if (!bundle) return "Could not build context for that note.";
      return formatContextBundle(bundle);
    }

    if (name === "git_status") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      const status = await invoke<{
        is_repo: boolean;
        root: string;
        branch: string | null;
        entries: Array<{ path: string; kind: string; staged: boolean; old_path: string | null }>;
      }>("git_status", { vaultRoot });
      if (!status.is_repo) return "This workspace is not a git repository.";
      if (status.entries.length === 0) {
        return `Branch: ${status.branch ?? "(detached)"}\nWorking tree clean.`;
      }
      const lines = status.entries.map(
        (e) => `- [${e.staged ? "staged" : "unstaged"}/${e.kind}] ${e.path}${e.old_path ? ` (was ${e.old_path})` : ""}`
      );
      return `Branch: ${status.branch ?? "(detached)"}\n${lines.join("\n")}`;
    }

    if (name === "git_diff") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      const path = String(args.path || "").trim();
      if (!path) return "Error: git_diff requires a path.";
      const diff = await invoke<string | null>("git_diff_file", {
        vaultRoot,
        path,
        staged: Boolean(args.staged),
      });
      if (!diff) return `No diff for "${path}" (unchanged, untracked, or not a git repository).`;
      return diff;
    }

    if (name === "list_recent_notes") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      const excludedList = store.settings.excludedFolders
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const entries = await invoke<Array<{ name: string; path: string; is_dir: boolean }>>("read_local_dir", {
        path: vaultRoot,
        excludedFolders: excludedList,
      });
      const limit = Math.max(1, Number(args.limit) || 20);
      const notes = entries
        .filter((e) => !e.is_dir && /\.(md|markdown|txt)$/i.test(e.name))
        .slice(0, limit);
      if (!notes.length) return "No markdown/plain-text notes found in the workspace root.";
      return notes.map((n) => `- ${n.name}`).join("\n");
    }

    if (name === "read_note") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      const rel = String(args.path || "").trim();
      const target = resolveVaultPath(vaultRoot, rel);
      if (!target) return `Error: Refusing path "${rel}" — must stay inside vault root.`;
      try {
        const text = await invoke<string>("read_local_file", { path: target, vaultRoot });
        return `### Note: ${rel}\n\n${text}`;
      } catch (err) {
        return `Error reading note "${rel}": ${err}`;
      }
    }

    if (name === "list_artifacts") {
      const artifacts = store.artifacts;
      if (!artifacts.length) return "No artifacts found in current session.";
      return artifacts
        .map((a) => `- [ID: ${a.id}] "${a.title}" (${a.type}, created ${new Date(a.createdAt).toLocaleTimeString()})`)
        .join("\n");
    }

    if (name === "delete_artifact") {
      const id = String(args.id || "").trim();
      if (!id) return "Error: delete_artifact requires an artifact ID.";
      store.deleteArtifact(id);
      return `Artifact "${id}" deleted.`;
    }

    // ---- Phase 6a: agent control meta tools (gated by aiEnableAgentControls) ----
    // No file writes, so no approval gate. The defensive `isControlTool` check keeps a
    // stray model from invoking them even if a stale tool list was cached when the
    // setting was on but has since been turned off.

    if (name === "create_session") {
      const session = await store.createAgentSession({
        title: args.title ? String(args.title) : undefined,
        engine: args.engine === "byok" ? "byok" : args.engine === "opencode" ? "opencode" : store.settings.assistantEngine,
      });
      if (!session) return "Error: Failed to create agent session.";
      return `Created session "${session.title || session.id}" with id: ${session.id}`;
    }

    if (name === "list_sessions") {
      await store.loadAgentSessions();
      const sessions = useStore.getState().agentSessions;
      if (!sessions.length) return "No agent sessions yet.";
      return sessions
        .map(
          (s) => `- [${s.id}] "${s.title || "Untitled"}" · ${s.engine || "unknown"} · ${s.status}${s.parentId ? ` (fork of ${s.parentId})` : ""}`
        )
        .join("\n");
    }

    if (name === "fork_session") {
      const sessionId = String(args.session_id || "").trim();
      if (!sessionId) return "Error: fork_session requires a session_id.";
      const child = await store.forkAgentSession(sessionId);
      if (!child) return `Error: Could not fork session "${sessionId}".`;
      return `Forked session "${sessionId}" -> new child id: ${child.id}`;
    }

    if (name === "set_goal") {
      const goal = String(args.goal || "").trim();
      if (!goal) return "Error: set_goal requires a goal.";
      const active = useStore.getState().goalRunning;
      if (active) return "Error: A goal run is already active — stop it first (stop_goal).";
      const sessionId = args.session_id ? String(args.session_id).trim() : null;
      if (sessionId) {
        // Point the active session at the target so the goal loop runs on it.
        useStore.getState().setActiveAgentSession(sessionId);
        // startGoalRun uses the active (or freshly created) session, so a resume-able
        // run lands on the requested one rather than a brand-new session.
      }
      store.startGoalRun(goal).catch((err) => {
        console.error("set_goal startGoalRun failed", err);
      });
      return `Goal armed on the active session: "${goal.slice(0, 80)}"${goal.length > 80 ? "…" : ""}`;
    }

    if (name === "stop_goal") {
      store.stopGoalRun();
      return "Goal run stopped (if one was active).";
    }

    if (name === "create_scheduled_task") {
      const nameArg = String(args.name || "").trim();
      const promptArg = String(args.prompt || "").trim();
      const scheduleSel = String(args.schedule_sel || "once").toLowerCase();
      if (!nameArg) return "Error: create_scheduled_task requires a name.";
      if (!promptArg) return "Error: create_scheduled_task requires a prompt.";
      const task = await store.createScheduledTask({
        name: nameArg,
        prompt: promptArg,
        scheduleSel,
        cron: args.cron ? String(args.cron) : undefined,
        weekday: args.weekday ? String(args.weekday) : undefined,
        time: args.time ? String(args.time) : "09:00",
      });
      if (!task) return "Error: Failed to create scheduled task.";
      return `Created scheduled task "${task.name}" with id: ${task.id} (${task.scheduleSel}${task.nextRun ? `, next run ${new Date(task.nextRun).toLocaleString()}` : ""}).`;
    }

    if (name === "list_scheduled_tasks") {
      await store.loadScheduledTasks();
      const tasks = useStore.getState().scheduledTasks;
      if (!tasks.length) return "No scheduled tasks yet.";
      return tasks
        .map(
          (t) =>
            `- [${t.id}] "${t.name}" · ${t.scheduleSel}${t.weekday ? ` (weekday ${t.weekday})` : ""}${t.time ? ` at ${t.time}` : ""} · ${t.disabled ? "disabled" : "enabled"}${t.nextRun ? ` · next ${new Date(t.nextRun).toLocaleString()}` : ""}`
        )
        .join("\n");
    }

    // ---- Phase 2b: file-mutation tools (gated + approval-required) ----

    if (name === "append_note" || name === "append_file") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      if (!useStore.getState().settings.aiEnableFileWrite) {
        return "Error: File write tools are disabled. Enable 'Allow AI file writes' in Settings -> AI.";
      }
      const rel = String(args.path || "").trim();
      const target = resolveVaultPath(vaultRoot, rel);
      if (!target) return `Error: Refusing path "${rel}" — must stay inside vault root.`;
      const toAppend = String(args.content || "");
      let existing = "";
      try {
        existing = await invoke<string>("read_local_file", { path: target, vaultRoot });
      } catch {
        existing = "";
      }
      if (existing.trim().length > 0) {
        const approved = await requireApproval({
          tool: name,
          args,
          summary: `Append ${toAppend.length} characters to note "${rel}"?`,
        });
        if (!approved) return "User declined the append — no changes made.";
      }
      const merged = existing ? `${existing.trimEnd()}\n\n${toAppend.trim()}` : toAppend;
      await invoke("write_local_file", { path: target, content: merged, vaultRoot });
      triggerPostWriteReindex(vaultRoot);
      return `Appended content to note "${rel}".`;
    }

    if (name === "create_note" || name === "create_folder") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      if (!useStore.getState().settings.aiEnableFileWrite) {
        return "Error: File write tools are disabled. Enable 'Allow AI file writes' in Settings -> AI.";
      }
      const rel = String(args.path || "").trim();
      const target = resolveVaultPath(vaultRoot, rel);
      if (!target) return `Error: Refusing path "${rel}" — must stay inside the vault root and be non-empty.`;
      if (name === "create_folder") {
        await invoke("create_local_dir", { parentPath: vaultRoot, name: rel, vaultRoot });
        triggerPostWriteReindex(vaultRoot);
        return `Created folder "${rel}".`;
      }
      const dirName = target.split("/").pop() || "note.md";
      const dirPath = target.slice(0, target.length - dirName.length).replace(/\/$/, "") || vaultRoot;
      await invoke("create_local_file", {
        dirPath,
        name: dirName,
        vaultRoot,
      });
      await invoke("write_local_file", {
        path: target,
        content: String(args.content || ""),
        vaultRoot,
      });
      triggerPostWriteReindex(vaultRoot);
      return `Created note "${rel}".`;
    }

    if (name === "edit_note") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      if (!useStore.getState().settings.aiEnableFileWrite) {
        return "Error: File write tools are disabled. Enable 'Allow AI file writes' in Settings -> AI.";
      }
      const rel = String(args.path || "");
      const target = resolveVaultPath(vaultRoot, rel);
      if (!target) return `Error: Refusing path "${rel}" — must stay inside the vault root and be non-empty.`;

      let existing = "";
      try {
        existing = await invoke<string>("read_local_file", { path: target });
      } catch {
        existing = "___NOT_FOUND___";
      }

      if (existing === "___NOT_FOUND___" && args.create_if_missing !== true) {
        return `Error: No file exists at "${rel}" (create_if_missing is false).`;
      }
      if (existing !== "___NOT_FOUND___" && existing.replace(/\s+/g, "").length > 0) {
        const approved = await requireApproval({
          tool: name,
          args,
          summary: `Overwrite note "${rel}" (${existing.length} chars) with new AI-provided content?`,
        });
        if (!approved) return "User declined the overwrite — no changes made.";
      }
      await invoke("write_local_file", { path: target, content: String(args.content || ""), vaultRoot });
      triggerPostWriteReindex(vaultRoot);
      return `Updated note "${rel}".`;
    }

    if (name === "delete_note") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      if (!useStore.getState().settings.aiEnableFileWrite) {
        return "Error: File write tools are disabled. Enable 'Allow AI file writes' in Settings -> AI.";
      }
      const rel = String(args.path || "");
      const target = resolveVaultPath(vaultRoot, rel);
      if (!target) return `Error: Refusing path "${rel}" — must stay inside the vault root and be non-empty.`;
      const approved = await requireApproval({
        tool: name,
        args,
        summary: `Delete "${rel}"? This cannot be undone.`,
      });
      if (!approved) return "User declined the delete — nothing was removed.";
      await invoke("delete_local_entry", { path: target, vaultRoot });
      useStore.getState().closeTab("left", target);
      useStore.getState().closeTab("right", target);
      triggerPostWriteReindex(vaultRoot);
      return `Deleted "${rel}".`;
    }

    if (name === "rename_note") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      if (!useStore.getState().settings.aiEnableFileWrite) {
        return "Error: File write tools are disabled. Enable 'Allow AI file writes' in Settings -> AI.";
      }
      const relOld = String(args.path || "");
      const relNew = String(args.new_name || "");
      const oldTarget = resolveVaultPath(vaultRoot, relOld);
      const newTarget = resolveVaultPath(vaultRoot, relNew);
      if (!oldTarget || !newTarget) return `Error: Refusing path — must stay inside the vault root.`;
      const approved = await requireApproval({
        tool: name,
        args,
        summary: `Rename/move "${relOld}" to "${relNew}"?`,
      });
      if (!approved) return "User declined the rename — nothing changed.";
      await invoke("rename_local_entry", { oldPath: oldTarget, newPath: newTarget, vaultRoot });
      triggerPostWriteReindex(vaultRoot);
      return `Renamed "${relOld}" to "${relNew}".`;
    }

    // Phase 2b: artifact export (markdown sink + PDF renderer). Only creates new files,
    // so unlike delete/rename/overwrite these do not require approval.
    if (name === "export_markdown" || name === "export_pdf") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      if (!useStore.getState().settings.aiEnableFileWrite) {
        return "Error: File write tools are disabled. Enable 'Allow AI file writes' in Settings -> AI.";
      }
      const rel = String(args.path || "").trim();
      const target = resolveVaultPath(vaultRoot, rel);
      if (!target) return `Error: Refusing path "${rel}" — must stay inside the vault root and be non-empty.`;
      try {
        await invoke("create_local_dir", {
          parentPath: vaultRoot,
          name: "_attachments/exports",
          vaultRoot,
        });
      } catch {
        // sink probably already exists — the write below reports if it truly can't.
      }
      if (name === "export_pdf") {
        const title = String(args.title || rel.split("/").pop() || "note");
        const written = await invoke<string>("export_markdown_to_pdf", {
          title,
          content: String(args.content || ""),
          targetPath: target,
          vaultRoot,
        });
        return `Exported PDF to "${written}".`;
      }
      await invoke("write_local_file", { path: target, content: String(args.content || ""), vaultRoot });
      triggerPostWriteReindex(vaultRoot);
      return `Exported markdown to "${rel}".`;
    }

    // Namespaced connector tools: "<connectorName>/<toolName>".
    const slashIndex = name.indexOf("/");
    if (slashIndex > 0 && slashIndex < name.length - 1) {
      const connectorName = name.slice(0, slashIndex);
      const toolName = name.slice(slashIndex + 1);
      const connector = store.settings.connectors.find(
        (c) => c.enabled && c.name === connectorName
      );
      if (connector) {
        if (connector.kind === "http" && !isOnline()) {
          return "⚠️ Not connected — this connector requires internet access.";
        }
        const result = await invoke<McpCallResult>("call_connector_tool", {
          config: connectorToConfig(connector),
          name: toolName,
          args,
        });
        return mcpResultToString(result);
      }
    }

    return `Error: Unknown tool "${name}".`;
  } catch (err) {
    return `Error executing tool "${name}": ${String(err)}`;
  }
}
