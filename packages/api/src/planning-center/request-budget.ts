import {
  currentPlanningCenterRequestCount,
  PlanningCenterAccounting,
} from "@pcobooster/api/planning-center/accounting";
import { PlanningCenterRequestAccounting } from "@pcobooster/api/planning-center/request-accounting";
import { Effect, Option } from "effect";

/**
 * Independent product policy, not the Cloudflare account ceiling. Each explicit Planning Center
 * API attempt counts, retries included; core redirects are refused rather than followed unseen.
 * Transport and standalone budgeted programs both enforce this cap. The API Worker separately
 * configures 80 total subrequests on the verified Workers Paid Standard account.
 */
export const PLANNING_CENTER_REQUEST_CAP = 40;

/** Room under the cap for retries of reads a progressive procedure already admitted. */
const RETRY_HEADROOM = 4;

/**
 * What a progressive procedure plans a call against. It admits work by upper-bound costs and
 * then counts what was really sent, so cached reads leave room for more work. A call goes past
 * it only to finish or advance its first unit (a person, a roster), which a follow-up call
 * could not fit either; that unit may use the retry headroom up to `PLANNING_CENTER_REQUEST_CAP`,
 * which transport enforces, leaving that call fewer retries. So a call's reported
 * `planningCenterRequests` can exceed this, never the cap.
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
            new PlanningCenterRequestAccounting({
              requestBudget: PLANNING_CENTER_REQUEST_CAP,
            })
          )
  );
