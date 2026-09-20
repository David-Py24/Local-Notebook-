import type { Settings } from "../stores/useStore";

export interface DiffHunk {
  header: string;
  lines: string[];
}

export interface WalkthroughHunkNarration {
  header: string;
  narration: string;
}

/**
 * Parses a unified diff body (as produced by `git diff` / `git_diff_file`) into its
 * per-file metadata and hunks. Pure so the parser is unit-testable without git.
 * Returns a single DiffFile; callers pass one file's patch at a time.
 */
export function parseUnifiedDiff(unified: string): {
  headerLines: string[];
  hunks: DiffHunk[];
} {
  const headerLines: string[] = [];
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  const lines = unified.split(/\r?\n/);
  // A trailing newline produces one empty final element that is not diff content.
  if (lines.length && lines[lines.length - 1] === "") {
    lines.pop();
  }
  for (const raw of lines) {
    if (raw.startsWith("@@ ")) {
      current = { header: raw, lines: [] };
      hunks.push(current);
    } else if (current) {
      current.lines.push(raw);
    } else if (raw.trim()) {
      headerLines.push(raw);
    }
  }
  return { headerLines, hunks };
}

export function fileLabelFromHeader(headerLines: string[]): string {
  for (const line of headerLines) {
    const m = line.match(/^\+\+\+\s+(?:b\/)?(.+)$/);
    if (m) return m[1];
    const m2 = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (m2) return m2[2];
  }
  return "file";
}

/**
 * SHA-256 of an arbitrary string via the WebCrypto API (available in the Tauri
 * webview and in Node ≥ 20). No secret is involved — this is only a cache key.
 */
export async function hashPatch(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const CACHE_PREFIX = "lsn_walkthrough_";
const CACHE_MAX = 50;

// Strictly increasing write clock so LRU eviction is deterministic even when many
// entries land in the same millisecond (unit tests rely on this).
let lastWriteTs = 0;
function nextWriteTs(): number {
  lastWriteTs = Math.max(Date.now(), lastWriteTs + 1);
  return lastWriteTs;
}

function cacheKeyFor(hash: string): string {
  return `${CACHE_PREFIX}${hash}`;
}

export function readWalkthroughCache(hash: string): WalkthroughHunkNarration[] | null {
  try {
    const raw = window.localStorage.getItem(cacheKeyFor(hash));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; items: WalkthroughHunkNarration[] };
    if (!Array.isArray(parsed.items)) return null;
    // Refresh the timestamp so a hot entry stays warm for LRU eviction.
    window.localStorage.setItem(cacheKeyFor(hash), JSON.stringify({ ts: nextWriteTs(), items: parsed.items }));
    return parsed.items;
  } catch {
    return null;
  }
}

/**
 * Writes a narration set into the ~50-entry LRU cache. When the cache is full the
 * least-recently-used (smallest ts) entry is evicted to make room.
 */
export function writeWalkthroughCache(hash: string, items: WalkthroughHunkNarration[]): void {
  try {
    const key = cacheKeyFor(hash);
    window.localStorage.setItem(key, JSON.stringify({ ts: nextWriteTs(), items }));
    const entries: Array<{ key: string; ts: number }> = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(CACHE_PREFIX)) continue;
      try {
        const parsed = JSON.parse(window.localStorage.getItem(k) || "") as { ts: number };
        entries.push({ key: k, ts: parsed.ts ?? 0 });
      } catch {
        continue;
      }
    }
    entries.sort((a, b) => b.ts - a.ts);
    for (const e of entries.slice(CACHE_MAX)) {
      window.localStorage.removeItem(e.key);
    }
  } catch {
    // Cache is best-effort; never throw into the walkthrough flow.
  }
}

interface WalkthroughOpts {
  patch: string;
  fileLabel: string;
  staged: boolean;
  settings: Settings;
  signal?: AbortSignal;
}

const MAX_HUNK_CHARS = 2500;

/**
 * Phase 5 "Changes Walkthrough": narrates each diff hunk of one file in plain language
 * using the small BYOK model (AGENTIC_ORCHESTRATION_PLAN.md Phase 5). Per the locked
 * decision this is per-diff-hunk narration only — no deep working-tree semantic sweep.
 *
 * Cached by SHA-256(patch + label + staged) with a ~50-entry LRU so repeated looks at
 * the same diff don't re-bill tokens. Pure no-Rust surface: it consumes the same
 * `diffContents` the DiffView already renders.
 */
export async function walkthroughDiff(opts: WalkthroughOpts): Promise<{
  cached: boolean;
  items: WalkthroughHunkNarration[];
  error?: string;
}> {
  const { patch, fileLabel, staged, settings, signal } = opts;

  if (!patch.trim() || /^\/\//.test(patch.trim())) {
    return { cached: false, items: [], error: `No usable diff for ${fileLabel}.` };
  }

  const hash = await hashPatch(`${fileLabel}\u0000${String(staged)}\u0000${patch}`);
  const cachedItems = readWalkthroughCache(hash);
  if (cachedItems) {
    return { cached: true, items: cachedItems };
  }

  const { hunks } = parseUnifiedDiff(patch);
  if (!hunks.length) {
    return { cached: false, items: [], error: `No hunks to narrate in ${fileLabel}.` };
  }

  const baseUrl = (settings.smallModelBaseUrl || settings.aiBaseUrl || "http://localhost:11434/v1").replace(/\/+$/, "");
  const model = settings.smallModel || settings.aiModelName || "hermes3:8b";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.aiApiKey?.trim()) {
    headers["Authorization"] = `Bearer ${settings.aiApiKey.trim()}`;
  }

  const system =
    "You explain code/notes diffs to a student. For the given unified-diff hunk, write " +
    "ONE short, plain-language paragraph (at most 90 words) that a learner can follow " +
    "without seeing the whole file: what changed, roughly why, and any pitfalls. " +
    "No markdown structure, no bullet lists, no PII, no opinion about the author.";

  const items: WalkthroughHunkNarration[] = [];
  for (const hunk of hunks) {
    let hunkText = hunk.lines.join("\n");
    if (hunkText.length > MAX_HUNK_CHARS) {
      hunkText = `${hunkText.slice(0, MAX_HUNK_CHARS)}\n… (truncated)`;
    }
    const user = `FILE: ${fileLabel} (${staged ? "staged" : "working-tree"} change)\nHUNK HEADER: ${hunk.header}\n\nDIFF:\n${hunkText}\n\nNarrate this hunk:`;

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.3,
        stream: false,
        max_tokens: 240,
      }),
      signal,
    });
    if (!res.ok) {
      return {
        cached: false,
        items,
        error: `Walkthrough model ${baseUrl} responded ${res.status} ${res.statusText}.`,
      };
    }
    const body = await res.json();
    const content: string | undefined = body?.choices?.[0]?.message?.content;
    if (content?.trim()) {
      items.push({ header: hunk.header, narration: content.trim() });
    }
  }

  writeWalkthroughCache(hash, items);
  return { cached: false, items };
}