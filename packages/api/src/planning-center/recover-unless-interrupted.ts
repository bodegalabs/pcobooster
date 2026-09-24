import { logger } from "@pcobooster/api/logger";
import { PlanningCenterApiError } from "@pcobooster/api/planning-center/api-error";
import { PlanningCenterRateLimitError } from "@pcobooster/api/planning-center/rate-limit-error";
import { PlanningCenterSubrequestLimitError } from "@pcobooster/api/planning-center/subrequest-limit-error";
import { Cause, Effect } from "effect";

const log = logger.for("planning-center/optional-read");

/** The tag of the first rate-limit or subrequest-limit failure in `cause`. */
const budgetFailureIn = <Failure>(
  cause: Cause.Cause<Failure>
): string | undefined => {
  for (const reason of cause.reasons) {
    if (!Cause.isFailReason(reason)) {
      continue;
    }
    const { error } = reason;
    if (
      error instanceof PlanningCenterRateLimitError ||
      error instanceof PlanningCenterSubrequestLimitError
    ) {
      return error._tag;
    }
    if (error instanceof PlanningCenterApiError && error.status === 429) {
      return "PlanningCenterApiError(429)";
    }
  }
  return undefined;
};

/**
 * Falls back after any failure or defect, as optional Planning Center reads
 * always have, while cancellation still stops the caller.
 *
 * A fallback after a rate-limit or subrequest-limit failure hides missing
 * data, so it is logged at `warn`; the procedure summary also counts it.
 * Callers that must not degrade should stop using this for those failures.
 */
export const recoverUnlessInterrupted =
  <Fallback>(fallback: () => Fallback) =>
  <Value, Failure, Requirements>(
    self: Effect.Effect<Value, Failure, Requirements>
  ): Effect.Effect<Value | Fallback, never, Requirements> =>
    Effect.catchCause(self, (cause) => {
      if (Cause.hasInterruptsOnly(cause)) {
        return Effect.interrupt;
      }
      const budgetFailure = budgetFailureIn(cause);
      if (budgetFailure !== undefined) {
        log.warn(
          { failure: budgetFailure },
          "Optional Planning Center read fell back after a budget failure"
        );
      }
      return Effect.sync(fallback);
    });
