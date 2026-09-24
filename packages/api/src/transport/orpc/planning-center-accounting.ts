import { logger } from "@pcobooster/api/logger";
import {
  PlanningCenterRequestAccounting,
  logPlanningCenterProcedureSummary,
} from "@pcobooster/api/planning-center/request-accounting";
import type { PlanningCenterLogger } from "@pcobooster/api/planning-center/request-accounting";

/**
 * Planning Center requests one procedure may send; `undefined` leaves only
 * Cloudflare's own cap (50 subrequests on Workers Free, shared with D1, KV,
 * and service bindings). Set a number to make the client fail with
 * `PlanningCenterSubrequestLimitError` before Cloudflare refuses the fetch.
 */
export const PLANNING_CENTER_REQUEST_BUDGET: number | undefined = undefined;

export interface PlanningCenterProcedureAccountingOptions {
  readonly logger?: PlanningCenterLogger;
  readonly requestBudget?: number;
  readonly now?: () => number;
}

export interface PlanningCenterProcedure {
  /** Dotted oRPC path, for example `people.list`. */
  readonly procedure: string;
  readonly requestId: string;
  /** Present when an outer middleware already counts this procedure. */
  readonly accounting?: PlanningCenterRequestAccounting;
}

/**
 * Runs one oRPC procedure with fresh Planning Center accounting and logs
 * its summary once it settles. Every application execution in the procedure
 * shares the accounting through the oRPC context.
 */
export const accountPlanningCenterProcedure = async <Result>(
  { procedure, requestId, accounting: existing }: PlanningCenterProcedure,
  run: (accounting: PlanningCenterRequestAccounting) => Promise<Result>,
  options: PlanningCenterProcedureAccountingOptions = {}
): Promise<Result> => {
  if (existing !== undefined) {
    return await run(existing);
  }
  const now = options.now ?? Date.now;
  const accounting = new PlanningCenterRequestAccounting({
    requestBudget: options.requestBudget ?? PLANNING_CENTER_REQUEST_BUDGET,
  });
  const startedAt = now();
  let outcome: "success" | "failure" = "failure";
  try {
    const result = await run(accounting);
    outcome = "success";
    return result;
  } finally {
    logPlanningCenterProcedureSummary(
      options.logger ?? logger.for("planning-center/procedure"),
      { procedure, requestId, durationMs: now() - startedAt, outcome },
      accounting
    );
  }
};
