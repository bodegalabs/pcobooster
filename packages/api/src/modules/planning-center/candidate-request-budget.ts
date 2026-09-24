import { currentPlanningCenterRequestCount } from "@pcobooster/api/planning-center/accounting";
import { Effect } from "effect";

/**
 * Planning Center requests one candidate-list call may make. Workers Free allows 50 subrequests
 * per invocation, and auth, D1, KV, and flag reads use some of them, so Planning Center gets 40.
 */
export const CANDIDATE_REQUEST_BUDGET = 40;

/** Planning Center pages hold 100 records (`per_page=100`). */
const PAGE_SIZE = 100;

export const pagesFor = (records: number): number =>
  Math.max(1, Math.ceil(records / PAGE_SIZE));

/**
 * Requests this call has sent: the procedure's own count when transport accounts for it, and
 * otherwise (scripts, unit tests) the caller's upper-bound estimate.
 */
export const requestsSpent = (estimate: number): Effect.Effect<number> =>
  currentPlanningCenterRequestCount.pipe(
    Effect.map((count) => count ?? estimate)
  );
