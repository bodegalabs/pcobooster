import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import {
  planningCenterRequestsSpent,
  PROGRESSIVE_REQUEST_BUDGET,
} from "@pcobooster/api/planning-center/request-budget";
import { Effect } from "effect";

/** One read a progressive procedure may admit, and what admitting it costs at most. */
export interface PageRead {
  /** Planning Center requests the read sends at most; a cached read sends none. */
  readonly pages: number;
  /** The read's first page for someone this call has not read for yet. */
  readonly starts: boolean;
  /** Room the read must leave for reads that come before it and are not ready yet. */
  readonly reserve?: number;
  /**
   * Reads the page(s) and records what they showed, so the next round asks for what follows.
   * Built for every ready read, admitted or not, so it must not start anything until run.
   */
  readonly run: Effect.Effect<void, PlanningCenterError>;
}

export interface PageRoundsOptions {
  readonly concurrency: number;
  /**
   * Room a read that `starts` someone must leave for the reads of those already started, so
   * a call finishes people instead of starting everyone.
   */
  readonly startReserve: number;
}

/**
 * Runs page reads in rounds within `PROGRESSIVE_REQUEST_BUDGET`. Each round asks `nextReads`
 * for the reads that are ready, in priority order, admits those whose upper-bound cost fits
 * what is left after the requests really sent, and runs them. A round's results decide the
 * next round's reads, so a collection is read one page at a time and stops as soon as its
 * caller has what it needs. The first read of a call is always admitted, so every call
 * advances. Returns whether reads were left for a later call.
 */
export const readPagesWithinBudget = (
  nextReads: () => readonly PageRead[],
  { concurrency, startReserve }: PageRoundsOptions
): Effect.Effect<boolean, PlanningCenterError> =>
  Effect.gen(function* readRounds() {
    let advanced = false;
    for (;;) {
      const ready = nextReads();
      if (ready.length === 0) {
        return false;
      }
      let remaining =
        PROGRESSIVE_REQUEST_BUDGET - (yield* planningCenterRequestsSpent);
      const admitted: PageRead[] = [];
      for (const read of ready) {
        const reserve = Math.max(
          read.starts ? startReserve : 0,
          read.reserve ?? 0
        );
        const first = !advanced && admitted.length === 0;
        if (!first && read.pages + reserve > remaining) {
          continue;
        }
        admitted.push(read);
        remaining -= read.pages;
      }
      if (admitted.length === 0) {
        return true;
      }
      advanced = true;
      yield* Effect.forEach(admitted, (read) => read.run, {
        concurrency,
        discard: true,
      });
    }
  });
