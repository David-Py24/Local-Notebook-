import { describe, it, expect, vi, afterEach } from "vitest";
import { EventPipeline } from "./opencodeClient";

// Direct EventPipeline coverage (plan_openchamber_paseo_flaws.md workstream E):
// 100ms batch coalescing, flush-on-stop drain, timer teardown + re-arm, and the
// queue overflow bound.

describe("EventPipeline — 100ms batch coalescing", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("flushes pushed frames in insertion order once the interval elapses", () => {
    vi.useFakeTimers();
    const received: string[] = [];
    const pipe = new EventPipeline((raw) => received.push(raw), 100);

    pipe.push("a");
    pipe.push("b");
    pipe.push("c");
    expect(received).toEqual([]);

    vi.advanceTimersByTime(105);
    pipe.stop();
    expect(received).toEqual(["a", "b", "c"]);
  });

  it("stop() drains any queued frames synchronously", () => {
    const received: string[] = [];
    const pipe = new EventPipeline((raw) => received.push(raw), 100);
    pipe.push("x");
    pipe.push("y");
    pipe.stop();
    expect(received).toEqual(["x", "y"]);
  });

  it("tears the interval down once the queue is empty", () => {
    vi.useFakeTimers();
    const received: string[] = [];
    const pipe = new EventPipeline((raw) => received.push(raw), 100);

    pipe.push("only");
    vi.advanceTimersByTime(105);
    expect(received).toEqual(["only"]);

    // Queue is now empty; the interval must have been cleared, so no further
    // flushes fire even after the frame would have been batched again.
    vi.advanceTimersByTime(1000);
    expect(received).toEqual(["only"]);
  });

  it("re-arms the interval after a fresh push following an empty flush", () => {
    vi.useFakeTimers();
    const received: string[] = [];
    const pipe = new EventPipeline((raw) => received.push(raw), 100);

    pipe.push("first");
    vi.advanceTimersByTime(105);
    expect(received).toEqual(["first"]);

    pipe.push("second");
    vi.advanceTimersByTime(105);
    pipe.stop();
    expect(received).toEqual(["first", "second"]);
  });

  it("bounds the queue at 500 frames by draining the oldest slice synchronously", () => {
    const received: string[] = [];
    const pipe = new EventPipeline((raw) => received.push(raw), 100);

    // Push 600 frames with no interval elapsing in between.
    for (let i = 0; i < 600; i++) pipe.push(`f${i}`);

    // The first 100 (the overflow beyond the 500 cap) were drained synchronously.
    expect(received.length).toBe(100);
    expect(received[0]).toBe("f0");
    expect(received[99]).toBe("f99");

    // stop() then drains the retained 500 in order.
    pipe.stop();
    expect(received.length).toBe(600);
    expect(received[599]).toBe("f599");
  });
});