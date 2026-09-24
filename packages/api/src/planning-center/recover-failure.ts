import { logger } from "@pcobooster/api/logger";
import { PlanningCenterApiError } from "@pcobooster/api/planning-center/api-error";
import { PlanningCenterNetworkError } from "@pcobooster/api/planning-center/network-error";
import { Cause, Effect } from "effect";

const log = logger.for("planning-center/recover-failure");

const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY_REQUESTS = 429;
const MAX_LOGGED_ERROR_LENGTH = 280;

/**
 * A Planning Center failure a caller may name as recoverable:
 *
 * - `not-found`: a 404, such as a service type or plan in another organization.
 * - `provider-failure`: any other error status except 429, or a network failure.
 * - `unusable-response`: a defect, such as a response missing the expected resource.
 *
 * Rate limits (the pacer's `PlanningCenterRateLimitError` or a 429 response),
 * subrequest limits, read-only rejections, and interruption are none of these,
 * so no caller can recover from them.
 */
export type RecoverablePlanningCenterFailure =
  | "not-found"
  | "provider-failure"
  | "unusable-response";

/**
 * The recoverable kind of one part of a cause, or `undefined` when it must
 * propagate: an interruption, a rate or subrequest limit, a read-only
 * rejection, or any error this module does not know.
 */
const classifyReason = (
  reason: Cause.Reason<unknown>
): RecoverablePlanningCenterFailure | undefined => {
  if (Cause.isDieReason(reason)) {
    return "unusable-response";
  }
  if (!Cause.isFailReason(reason)) {
    return undefined;
  }
  const { error } = reason;
  if (error instanceof PlanningCenterNetworkError) {
    return "provider-failure";
  }
  if (
    !(error instanceof PlanningCenterApiError) ||
    error.status === HTTP_TOO_MANY_REQUESTS
  ) {
    return undefined;
  }
  return error.status === HTTP_NOT_FOUND ? "not-found" : "provider-failure";
};

/** The kinds in `cause` when every part of it is recoverable and listed in `kinds`. */
const listedKindsOf = <Failure>(
  cause: Cause.Cause<Failure>,
  kinds: readonly RecoverablePlanningCenterFailure[]
): ReadonlySet<RecoverablePlanningCenterFailure> | undefined => {
  const listed = new Set(kinds);
  const found = new Set<RecoverablePlanningCenterFailure>();
  for (const reason of cause.reasons) {
    const kind = classifyReason(reason);
    if (kind === undefined || !listed.has(kind)) {
      return undefined;
    }
    found.add(kind);
  }
  return found.size > 0 ? found : undefined;
};

/**
 * Whether `cause` holds only failures of the listed kinds. Budget failures and
 * interruption are never recoverable, whatever `kinds` lists.
 */
export const isRecoverablePlanningCenterCause = <Failure>(
  cause: Cause.Cause<Failure>,
  kinds: readonly RecoverablePlanningCenterFailure[]
): boolean => listedKindsOf(cause, kinds) !== undefined;

/** A short description of `cause` for logs: never a token or response body. */
export const describePlanningCenterCause = <Failure>(
  cause: Cause.Cause<Failure>
): string => {
  const error = Cause.squash(cause);
  const text = error instanceof Error ? error.message : String(error);
  return text.slice(0, MAX_LOGGED_ERROR_LENGTH);
};

export interface RecoverPlanningCenterFailureOptions<Fallback> {
  /** The failure kinds this read may fall back after; anything else propagates. */
  readonly kinds: readonly RecoverablePlanningCenterFailure[];
  /** Why falling back is correct, logged with every fallback. */
  readonly reason: string;
  /** Identifiers for the log line (ids and paths only, never tokens or bodies). */
  readonly details?: Readonly<Record<string, string>>;
  readonly fallback: () => Fallback;
}

/**
 * Falls back to `fallback()` after a failure of one of the listed kinds, and
 * logs the reason: `not-found` at `info`, any other kind at `warn`. Rate-limit
 * and subrequest-limit failures, read-only rejections, and interruption always
 * propagate, so a spent budget can never read as empty data.
 */
export const recoverPlanningCenterFailure =
  <Fallback>({
    kinds,
    reason,
    details,
    fallback,
  }: RecoverPlanningCenterFailureOptions<Fallback>) =>
  <Value, Failure, Requirements>(
    self: Effect.Effect<Value, Failure, Requirements>
  ): Effect.Effect<Value | Fallback, Failure, Requirements> =>
    Effect.catchCause(self, (cause) => {
      const found = listedKindsOf(cause, kinds);
      if (found === undefined) {
        return Effect.failCause(cause);
      }
      const fields = {
        ...details,
        failure: [...found].join(","),
        error: describePlanningCenterCause(cause),
      };
      if (found.size === 1 && found.has("not-found")) {
        log.info(fields, reason);
      } else {
        log.warn(fields, reason);
      }
      return Effect.sync(fallback);
    });
