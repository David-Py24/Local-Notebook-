import type { Settings } from "../stores/useStore";

export interface AuditorVerdict {
  verdict: "done" | "keep_going" | "stuck";
  reason: string;
}

/**
 * Defensive parse of the auditor's chat response. Extracts a `{"verdict": ...}` JSON
 * blob if present, then falls back to keyword heuristics. Pure and exported so the
 * unit tests can lock the wire-shape parsing without an HTTP round-trip.
 */
export function parseAuditorResponse(content: string): AuditorVerdict {
  const match = content.match(/\{[^{}]*"verdict"[^{}]*\}/);
  const target = match ? match[0] : content;
  try {
    const parsed = JSON.parse(target);
    const verdict = parsed.verdict;
    if (verdict === "done" || verdict === "keep_going" || verdict === "stuck") {
      return { verdict, reason: String(parsed.reason ?? "") };
    }
  } catch {
    // Not JSON — fall through.
  }
  const lower = content.toLowerCase();
  if (/\bdone\b/.test(lower) && !/"keep_going"/.test(lower)) {
    return { verdict: "done", reason: content.slice(-120) };
  }
  if (/stuck/.test(lower)) {
    return { verdict: "stuck", reason: content.slice(-120) };
  }
  return { verdict: "keep_going", reason: content.slice(-120) };
}

interface AuditorRequestOpts {
  goal: string;
  latestOutput: string;
  iterations: number;
  settings: Settings;
  signal?: AbortSignal;
}

/**
 * Lightweight goal judge for the agent orchestrator (AGENTIC_ORCHESTRATION_PLAN.md
 * Phase 2). One non-streaming chat/completions call with no tools, returning a JSON
 * verdict. Uses `settings.smallModel` when set, else the main BYOK model. Structured
 * output is requested but not required — the response is parsed defensively.
 *
 * The auditor is a *frontend* service (all AI HTTP callers live in services) and never
 * persists raw verdicts — only aggregated strikes/counts are recorded via
 * `record_run_turn`.
 */
export async function auditGoal(opts: AuditorRequestOpts): Promise<AuditorVerdict> {
  const { goal, latestOutput, settings, signal } = opts;
  const baseUrl = (settings.smallModelBaseUrl || settings.aiBaseUrl || "http://localhost:11434/v1").replace(/\/+$/, "");
  const model = settings.smallModel || settings.aiModelName || "hermes3:8b";
  const endpoint = `${baseUrl}/chat/completions`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.aiApiKey?.trim()) {
    headers["Authorization"] = `Bearer ${settings.aiApiKey.trim()}`;
  }

  const system =
    "You are an impartial auditor for a study-agent loop. Judge whether the agent's latest " +
    "turn has made real progress toward the stated goal. Respond with JSON only, exactly " +
    '{"verdict": "done" | "keep_going" | "stuck", "reason": "<short reason>"}. ' +
    '"done" means the goal is substantially fulfilled. "stuck" means no real progress ' +
    "or the agent is going in circles. " +
    '"keep_going" means visible progress but the goal is not yet met.';

  const user = `GOAL: ${goal}\n\nITERATION: ${opts.iterations + 1}\n\nLATEST AGENT OUTPUT:\n${
    latestOutput.length > 6000 ? latestOutput.slice(-6000) : latestOutput
  }\n\nRespond with the JSON verdict only.`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0,
      stream: false,
      max_tokens: 120,
    }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`Auditor ${endpoint} responded ${res.status} ${res.statusText}`);
  }

  const body = await res.json();
  const content: string | undefined = body?.choices?.[0]?.message?.content;
  if (!content) {
    return { verdict: "keep_going", reason: "auditor returned no content" };
  }
  return parseAuditorResponse(content);
}