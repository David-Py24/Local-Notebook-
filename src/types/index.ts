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

export interface Project {
  id: string;
  name: string;
  path: string;
  pinned?: boolean;
  lastOpened: string; // ISO timestamp
}

