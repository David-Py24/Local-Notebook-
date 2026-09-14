export interface Source {
  id: number;
  title: string;
  file_type: string;
  file_path: string | null;
  raw_content: string;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: number;
  source_id: number | null;
  title: string;
  content: string;
  pinned: boolean;
  tags: string;
  created_at: string;
  updated_at: string;
}

export interface OpenTab {
  id: number; // note id, -1 for a new blank note
  title: string;
  sourceId: number | null;
  pinned: boolean;
  dirty: boolean;
}

export type FileChangeKind =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted";

export interface GitStatusEntry {
  /** path relative to the repository root (forward slashes) */
  path: string;
  kind: FileChangeKind;
  staged: boolean;
  /** previous path for renames */
  oldPath?: string;
}

export interface GitRepoStatus {
  /** false when the vault folder is not inside any git repository */
  isRepo: boolean;
  /** repository working-directory root */
  root: string;
  /** currently checked-out branch (null when detached/unborn) */
  branch: string | null;
  entries: GitStatusEntry[];
}

export interface Project {
  id: string;
  name: string;
  path: string;
  pinned?: boolean;
  lastOpened: string; // ISO timestamp
}

export type ConnectorKind = "stdio" | "http";

export interface McpConnector {
  id: string;
  name: string;
  kind: ConnectorKind;
  // stdio server (local binary)
  command?: string;
  args?: string[];
  cwd?: string;
  // http (streamable-http) server
  url?: string;
  headers?: Record<string, string>;
  // common
  enabled: boolean;
  env?: Record<string, string>;   // scoped child env vars (never persisted secrets)
  tools?: string[];               // cached list of tool names exposed by this server
}

