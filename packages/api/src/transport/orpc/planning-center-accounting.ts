import { logger } from "@pcobooster/api/logger";
import {
  PlanningCenterRequestAccounting,
  logPlanningCenterProcedureSummary,
} from "@pcobooster/api/planning-center/request-accounting";
import type { PlanningCenterLogger } from "@pcobooster/api/planning-center/request-accounting";
import { PLANNING_CENTER_REQUEST_CAP } from "@pcobooster/api/planning-center/request-budget";

export interface PlanningCenterProcedureAccountingOptions {
  readonly logger?: PlanningCenterLogger;
  /** Defaults to `PLANNING_CENTER_REQUEST_CAP`. */
  readonly requestBudget?: number;
  readonly now?: () => number;
}

export interface PlanningCenterProcedure {
  /** Dotted oRPC path, for example `people.planWindowHistory`. */
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
    requestBudget: options.requestBudget ?? PLANNING_CENTER_REQUEST_CAP,
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
