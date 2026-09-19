import { useEffect, useRef } from "react";
import { useStore } from "../stores/useStore";

// Scheduling clock (AGENTIC_ORCHESTRATION_PLAN.md Phase 3). Polls check_due_tasks on
// mount + every `tickMs` and dispatches each due task through runScheduledTask.
// Contract: scheduled tasks fire only while the app is open (like OpenChamber's
// tasks-need-a-running-server). runScheduledTask's wait-for-idle guard means at most one
// run at a time per engine; overdue-but-skipped tasks are retried on a later tick.
export function useScheduler(tickMs = 60000): void {
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAndRun() {
      if (cancelled) return;
      const store = useStore.getState();
      const due = await store.checkDueTasks();
      await store.loadScheduledTasks();
      if (cancelled) return;
      for (const task of due) {
        if (cancelled) return;
        // Skips (returns false) when a goal or another scheduled run is active; dispatch
        // at most one task per tick and let the next tick pick up any queue.
        const dispatched = await useStore.getState().runScheduledTask(task);
        if (dispatched || cancelled) return;
      }
    }

    void loadAndRun();
    tickRef.current = window.setInterval(() => void loadAndRun(), tickMs);
    return () => {
      cancelled = true;
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [tickMs]);
}