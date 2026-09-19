import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "../stores/useStore";
import { streamAIResponse, type ChatMessagePayload } from "./aiProvider";
import { streamOpencodeReply } from "./opencodeClient";
import { auditGoal, type AuditorVerdict } from "./agentAuditor";

export type RunStatus = "running" | "done" | "blocked" | "stopped" | "failed";

export interface AgentRun {
  id: string;
  sessionId: string;
  goal: string;
  status: RunStatus;
  iterations: number;
  stuckStrikes: number;
  tokenEstimate: number;
  lastVerdict: AuditorVerdict | null;
  startedAt: number;
  finishedAt: number | null;
}

interface ExecuteTurnParams {
  goal: string;
  sessionId: string;
  engine: "opencode" | "byok";
  settings: Settings;
  vaultRoot: string | null;
  signal: AbortSignal;
  onChunk: (text: string) => void;
  onToolCall?: (tool: string) => void;
  onStatus: (status: string) => void;
  iterations: number;
}

// Estimated tokens from character count (≈4 chars/token). Used only for budget capping.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Pure decision: given the auditor verdict + run counters + budget, compute the next
 * run status. Isolated so the state machine is unit-testable without any HTTP.
 */
export function decideIteration(
  verdict: AuditorVerdict,
  opts: { iterations: number; stuckStrikes: number; tokenEstimate: number; tokenBudget: number; maxIterations: number }
): { status: RunStatus; nextStrikes: number } {
  const nextStrikes = verdict.verdict === "stuck" ? opts.stuckStrikes + 1 : 0;
  if (verdict.verdict === "done") return { status: "done", nextStrikes };
  if (opts.tokenEstimate >= opts.tokenBudget) return { status: "blocked", nextStrikes };
  if (nextStrikes >= 3) return { status: "blocked", nextStrikes };
  if (opts.iterations >= opts.maxIterations) return { status: "blocked", nextStrikes };
  return { status: "running", nextStrikes };
}

// Module-level controller for the single active goal loop. Stop/pause must preempt the
// loop between turns (the streaming request itself is aborted on stop).
export interface GoalControl {
  abort: AbortController;
  paused: { value: boolean };
}

let activeControl: GoalControl | null = null;
let activeStatusListener: ((s: RunStatus) => void) | null = null;

export function getActiveGoalRun(): GoalControl | null {
  return activeControl;
}

export function setActiveGoalRun(control: GoalControl | null, onStatus?: (s: RunStatus) => void): void {
  activeControl = control;
  activeStatusListener = onStatus ?? null;
}

async function executeTurn(params: ExecuteTurnParams): Promise<string> {
  const { goal, engine, settings, vaultRoot, signal, onChunk, onToolCall, onStatus } = params;

  const contextBlock = vaultRoot
    ? await (async () => {
        try {
          const { fetchContextBundle, formatContextBundle } = await import("./agentKnowledge");
          const scope = vaultRoot.split(/[\\/]/).pop() || "vault";
          const bundle = await fetchContextBundle({ vaultRoot, scope, queryText: goal, limit: settings.ragTopK ?? 5 });
          return bundle ? formatContextBundle(bundle) : "";
        } catch {
          return "";
        }
      })()
    : "";

  const prompt = [
    "## Autonomous study goal",
    goal,
    "",
    contextBlock ? "## Workspace context (Memory-RAG)\n" + contextBlock + "\n" : "",
    "Work toward the goal using the workspace tools and context. Produce concrete output",
    "(e.g. a note in the vault) rather than merely replying. Stop when the goal is met.",
  ]
    .filter((s) => s !== "")
    .join("\n\n");

  if (engine === "opencode") {
    const store = await import("../stores/useStore").then((m) => m.useStore.getState());
    const { opencodeSessionId, opencodeServerPassword, opencodeServerPort } = store;
    if (!opencodeSessionId || !opencodeServerPassword) throw new Error("no opencode session");
    const { resolveOpencodeModel } = await import("./opencodeClient");
    return streamOpencodeReply({
      sessionId: opencodeSessionId,
      port: opencodeServerPort ?? settings.opencodePort,
      password: opencodeServerPassword,
      model: resolveOpencodeModel(settings),
      text: prompt,
      signal,
      onChunk,
      onStatusChange: onStatus,
      onToolCall: (tool) => onToolCall?.(tool),
    });
  }

  const messages: ChatMessagePayload[] = [
    { role: "system", content: settings.aiSystemPrompt || "You are an autonomous study agent." },
    { role: "user", content: prompt },
  ];
  return streamAIResponse({
    messages,
    settings,
    signal,
    onChunk,
    onStatusChange: onStatus,
    onToolCall: (tool) => onToolCall?.(tool),
  });
}

async function sleepUntilResumed(pausedRef: { value: boolean }, signal: AbortSignal): Promise<void> {
  while (pausedRef.value && !signal.aborted) {
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

/**
 * Run one goal to completion. `onRun` streams live run state; `onStatus` is a coarse
 * status callback used to keep the panel indicator in sync. Returns when the loop
 * finishes for any reason (budget/strikes/iteration cap/done/user stop/engine fail).
 */
export async function runGoalLoop(opts: {
  sessionId: string;
  goal: string;
  engine: "opencode" | "byok";
  settings: Settings;
  vaultRoot: string | null;
  tokenBudget?: number;
  maxIterations?: number;
  signal: AbortSignal;
  pausedRef: { value: boolean };
  onRun: (run: AgentRun) => void;
  onStatus?: (status: RunStatus) => void;
  onToolCall?: (tool: string) => void;
}): Promise<AgentRun> {
  const budget = opts.tokenBudget ?? opts.settings.goalTokenBudget ?? 80000;
  const maxIter = opts.maxIterations ?? opts.settings.goalMaxIterations ?? 12;
  const startedAt = Date.now();

  let run: AgentRun = {
    id: "",
    sessionId: opts.sessionId,
    goal: opts.goal,
    status: "running",
    iterations: 0,
    stuckStrikes: 0,
    tokenEstimate: 0,
    lastVerdict: null,
    startedAt,
    finishedAt: null,
  };
  opts.onRun(run);

  try {
    const started = await invoke<{ id: string }>("start_agent_run", {
      sessionId: opts.sessionId,
      goal: opts.goal,
      tokenBudget: budget,
    });
    run = { ...run, id: started.id };
    opts.onRun(run);
  } catch (err) {
    run = { ...run, status: "failed", finishedAt: Date.now() };
    opts.onRun(run);
    opts.onStatus?.("failed");
    return run;
  }

  let turnText = "";
  try {
    while (run.status === "running") {
      if (opts.signal.aborted) {
        run = { ...run, status: "stopped", finishedAt: Date.now() };
        break;
      }
      await sleepUntilResumed(opts.pausedRef, opts.signal);

      opts.onRun({ ...run, status: "running" });
      turnText = await executeTurn({
        goal: opts.goal,
        sessionId: opts.sessionId,
        engine: opts.engine,
        settings: opts.settings,
        vaultRoot: opts.vaultRoot,
        signal: opts.signal,
        onChunk: () => {},
        onToolCall: opts.onToolCall,
        onStatus: (msg) => {},
        iterations: run.iterations,
      });

      const nextIterationCount = run.iterations + 1;
      const tokenEstimate = run.tokenEstimate + estimateTokens(turnText);
      const verdict = await auditGoal({
        goal: opts.goal,
        latestOutput: turnText,
        iterations: run.iterations,
        settings: opts.settings,
        signal: opts.signal,
      });

      const decision = decideIteration(verdict, {
        iterations: nextIterationCount,
        stuckStrikes: run.stuckStrikes,
        tokenEstimate,
        tokenBudget: budget,
        maxIterations: maxIter,
      });

      run = {
        ...run,
        status: decision.status,
        iterations: nextIterationCount,
        stuckStrikes: decision.nextStrikes,
        tokenEstimate,
        lastVerdict: verdict,
        finishedAt: decision.status !== "running" ? Date.now() : null,
      };
      opts.onRun(run);

      if (run.status !== "running") break;

      try {
        await invoke("record_run_turn", {
          runId: run.id,
          iterations: run.iterations,
          stuckStrikes: run.stuckStrikes,
          status: "running",
        });
      } catch {
        // Heartbeat best-effort; loop continues.
      }
    }
  } catch (err) {
    // A user Stop (abort) must always win over any engine failure.
    run = {
      ...run,
      status: opts.signal.aborted ? "stopped" : "failed",
      finishedAt: Date.now(),
      lastVerdict: run.lastVerdict ?? { verdict: "stuck", reason: `engine error: ${String(err)}` },
    };
    opts.onRun(run);
    try {
      await invoke("record_run_turn", {
        runId: run.id,
        iterations: run.iterations,
        stuckStrikes: run.stuckStrikes,
        status: run.status,
      });
    } catch {
      // best-effort
    }
    opts.onStatus?.(run.status);
    return run;
  }

  try {
    await invoke("record_run_turn", {
      runId: run.id,
      iterations: run.iterations,
      stuckStrikes: run.stuckStrikes,
      status: run.status,
    });
  } catch {
    // final write best-effort
  }
  opts.onRun(run);
  opts.onStatus?.(run.status);
  return run;
}