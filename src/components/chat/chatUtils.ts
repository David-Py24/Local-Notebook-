// Shared helpers for the OpenChamber-style chat parts (CHAT_UI_REDESIGN_PLAN.md).

export function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

// Rough markdown → plain text (used for reasoning summary previews).
export function stripMarkdown(text: string, max = 140): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~#>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "";
  return plain.length > max ? plain.slice(0, max).trimEnd() + "…" : plain;
}

// Compact label for a tool part's args (avoid dumping whole JSON in the chip).
export function summarizeArgs(args?: Record<string, any>): string {
  if (!args) return "";
  return Object.entries(args)
    .slice(0, 2)
    .map(([k, v]) => `${k}=${typeof v === "string" ? `"${v.length > 40 ? v.slice(0, 40) + "…" : v}"` : JSON.stringify(v)?.slice(0, 40)}`)
    .join(" ");
}