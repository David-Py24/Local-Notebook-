import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../stores/useStore";

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
];

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

    return `Error: Unknown tool "${name}".`;
  } catch (err) {
    return `Error executing tool "${name}": ${String(err)}`;
  }
}
