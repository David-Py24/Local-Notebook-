import { describe, it, expect } from "vitest";
import { estimateTokens, decideIteration } from "./agentOrchestrator";
import { parseAuditorResponse } from "./agentAuditor";

const base = { iterations: 1, stuckStrikes: 0, tokenEstimate: 0, tokenBudget: 80000, maxIterations: 12 };

describe("estimateTokens", () => {
  it("estimates ~1 token per 4 characters", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });
  it("is zero for empty input", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("decideIteration (goal state machine)", () => {
  it("done terminates immediately", () => {
    const out = decideIteration({ verdict: "done", reason: "complete" }, base);
    expect(out.status).toBe("done");
  });

  it("keep_going continues when budget/iterations remain", () => {
    const out = decideIteration({ verdict: "keep_going", reason: "progress" }, base);
    expect(out.status).toBe("running");
    expect(out.nextStrikes).toBe(0);
  });

  it("stuck increments strikes and blocks at 3", () => {
    const s1 = decideIteration({ verdict: "stuck", reason: "circles" }, base);
    expect(s1.nextStrikes).toBe(1);

    const s3 = decideIteration(
      { verdict: "stuck", reason: "circles" },
      { ...base, stuckStrikes: 2 }
    );
    expect(s3.nextStrikes).toBe(3);
    expect(s3.status).toBe("blocked");
  });

  it("token budget hit blocks the run", () => {
    const out = decideIteration(
      { verdict: "keep_going", reason: "slow" },
      { ...base, tokenEstimate: 80001 }
    );
    expect(out.status).toBe("blocked");
  });

  it("iteration cap blocks the run", () => {
    const out = decideIteration(
      { verdict: "keep_going", reason: "long" },
      { ...base, iterations: 12 }
    );
    expect(out.status).toBe("blocked");
  });

  it("a non-stuck verdict after strikes resets the counter", () => {
    const out = decideIteration(
      { verdict: "keep_going", reason: "back on track" },
      { ...base, stuckStrikes: 2 }
    );
    expect(out.nextStrikes).toBe(0);
    expect(out.status).toBe("running");
  });
});

describe("parseAuditorResponse", () => {
  it("parses strict JSON verdicts", () => {
    expect(parseAuditorResponse('{"verdict": "done", "reason": "note written"}')).toEqual({
      verdict: "done",
      reason: "note written",
    });
  });

  it("extracts a JSON blob embedded in prose", () => {
    const prose = 'Here you go:\n{"verdict":"stuck","reason":"no progress"}.\nRegards';
    expect(parseAuditorResponse(prose)).toEqual({ verdict: "stuck", reason: "no progress" });
  });

  it("falls back to keyword heuristics for non-JSON", () => {
    expect(parseAuditorResponse("The agent appears stuck in a loop.")).toMatchObject({
      verdict: "stuck",
    });
    expect(parseAuditorResponse("Goal achieved — done.")).toMatchObject({ verdict: "done" });
    expect(parseAuditorResponse("It is making progress.")).toMatchObject({ verdict: "keep_going" });
  });

  it("rejects invalid verdicts and defaults to keep_going", () => {
    expect(parseAuditorResponse('{"verdict": "maybe"}')).toMatchObject({ verdict: "keep_going" });
  });
});