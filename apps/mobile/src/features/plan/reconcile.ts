import type {
  InvalidateQueryFilters,
  QueryClient,
} from "@tanstack/react-query";

/** How long writes must be quiet before a plan's lists refetch (web's reconcile delay). */
export const PLAN_RECONCILE_DELAY_MS = 2500;

/** Runs `run` after `ms`; returns a cancel. Injected so tests fire it by hand. */
export interface ReconcileTimer {
  after: (ms: number, run: () => void) => () => void;
}

export const realTimer: ReconcileTimer = {
  after: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => {
      clearTimeout(timer);
    };
  },
};

/**
 * Refetches what a plan's writes changed once they have been quiet for a while, outside the
 * write queue: spaced edits cost one read, and a read never holds up the next write. Every
 * write holds each list it changes from the moment it paints until it lands, across lists and
 * writers, so no refetch can paint over any write still pending.
 */
export class PlanReconciler {
  private readonly cache: QueryClient;
  private readonly timer: ReconcileTimer;
  private readonly holds = new Map<string, number>();
  private readonly waiting = new Map<string, () => void>();
  constructor(cache: QueryClient, timer: ReconcileTimer) {
    this.cache = cache;
    this.timer = timer;
  }

  /** A write starts: cancel these lists' waiting refetches and keep new ones off until it ends. */
  hold(lists: readonly InvalidateQueryFilters[]): void {
    for (const filters of lists) {
      const name = JSON.stringify(filters.queryKey);
      this.waiting.get(name)?.();
      this.waiting.delete(name);
      this.holds.set(name, (this.holds.get(name) ?? 0) + 1);
    }
  }

  /** A write ended: refetch each list after the quiet delay once no other write holds it. */
  release(lists: readonly InvalidateQueryFilters[]): void {
    for (const filters of lists) {
      const name = JSON.stringify(filters.queryKey);
      const remaining = (this.holds.get(name) ?? 1) - 1;
      if (remaining > 0) {
        this.holds.set(name, remaining);
        continue;
      }
      this.holds.delete(name);
      this.waiting.get(name)?.();
      this.waiting.set(
        name,
        this.timer.after(PLAN_RECONCILE_DELAY_MS, () => {
          this.waiting.delete(name);
          void this.cache.invalidateQueries(filters);
        })
      );
    }
  }
}
