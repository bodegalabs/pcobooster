import type { ReconcileTimer } from "./reconcile";

/** A reconcile timer tests fire by hand: the delays still waiting, and running them. */
export const makeManualTimer = () => {
  let waiting: { ms: number; run: () => void }[] = [];
  const timer: ReconcileTimer = {
    after: (ms, run) => {
      const entry = { ms, run };
      waiting.push(entry);
      return () => {
        waiting = waiting.filter((value) => value !== entry);
      };
    },
  };
  return {
    timer,
    pending: () => waiting.map((entry) => entry.ms),
    fire: () => {
      const due = waiting;
      waiting = [];
      for (const entry of due) {
        entry.run();
      }
    },
  };
};
