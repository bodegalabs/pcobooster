import {
  currentPlanningCenterRequestCount,
  PlanningCenterAccounting,
} from "@pcobooster/api/planning-center/accounting";
import { PlanningCenterRequestAccounting } from "@pcobooster/api/planning-center/request-accounting";
import { Effect, Option } from "effect";

/**
 * Subrequests one Worker invocation may make on Workers Free: Planning Center fetches, D1, KV,
 * Flagship, and service-binding calls together.
 */
export const WORKER_SUBREQUEST_LIMIT = 50;

/**
 * Subrequests a procedure makes besides Planning Center API reads, counted from the code that
 * runs before and around them:
 *
 * - Account and token (Better Auth over D1): `listUserAccounts` reads the accounts (1), and
 *   `getAccessToken` bypasses the session cookie cache, so it reads the session and the accounts
 *   (2). The first `getSession` is served from the signed session cookie.
 * - An expiring access token (every 2 hours per account): the token refresh and the account
 *   update (2).
 * - An expired session cookie cache (every 5 minutes per browser): the session reads behind
 *   `getSession` and `listUserAccounts` (2).
 * - The shared read tier: one KV read and, on a miss, one write (2). No procedure reads both
 *   shared caches.
 * - One feature flag evaluation (1).
 *
 * The rare fallback after `getAccessToken` fails (`refreshToken`) adds four more; if that
 * coincides with a full procedure, Cloudflare refuses the fetch and the procedure fails with a
 * typed fault instead of returning partial data.
 */
export const NON_PLANNING_CENTER_SUBREQUEST_RESERVE = 3 + 2 + 2 + 2 + 1;

/**
 * Planning Center requests one procedure may send, retries included. Past it the client fails
 * with `PlanningCenterSubrequestLimitError` (`source: "budget"`) before Cloudflare would refuse
 * the fetch. Transport sets it on every procedure's accounting.
 */
export const PLANNING_CENTER_REQUEST_CAP =
  WORKER_SUBREQUEST_LIMIT - NON_PLANNING_CENTER_SUBREQUEST_RESERVE;

/** Room under the cap for retries of reads a progressive procedure already admitted. */
const RETRY_HEADROOM = 4;

/**
 * What a progressive procedure plans a call against. It admits work by upper-bound costs and
 * then counts what was really sent, so cached reads leave room for more work.
 */
export const PROGRESSIVE_REQUEST_BUDGET =
  PLANNING_CENTER_REQUEST_CAP - RETRY_HEADROOM;

/** Planning Center pages hold 100 records (`per_page=100`). */
const PAGE_SIZE = 100;

/** Pages a list of `records` needs; an empty list still costs one request. */
export const pagesFor = (records: number): number =>
  Math.max(1, Math.ceil(records / PAGE_SIZE));

/**
 * Planning Center requests this procedure has sent so far, cached reads excluded. Inside
 * `withPlanningCenterRequestCount` the count always exists.
 */
export const planningCenterRequestsSpent: Effect.Effect<number> =
  currentPlanningCenterRequestCount.pipe(Effect.map((count) => count ?? 0));

/**
 * Runs a budgeted program with the procedure's accounting, or with a fresh one outside a
 * procedure (scripts, unit tests), so its request counts are always real.
 */
export const withPlanningCenterRequestCount = <Value, Failure, Requirements>(
  program: Effect.Effect<Value, Failure, Requirements>
): Effect.Effect<Value, Failure, Requirements> =>
  Effect.flatMap(
    Effect.serviceOption(PlanningCenterAccounting),
    (accounting) =>
      Option.isSome(accounting)
        ? program
        : Effect.provideService(
            program,
            PlanningCenterAccounting,
            new PlanningCenterRequestAccounting()
          )
  );
