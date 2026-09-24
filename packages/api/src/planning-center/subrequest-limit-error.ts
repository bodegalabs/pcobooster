import { Data } from "effect";

/**
 * This Worker invocation cannot make another Planning Center request:
 * `worker` when Cloudflare refused the fetch ("Too many subrequests"),
 * `budget` when the invocation's configured request budget is spent.
 */
export class PlanningCenterSubrequestLimitError extends Data.TaggedError(
  "PlanningCenterSubrequestLimitError"
)<{
  readonly source: "worker" | "budget";
  /** Planning Center requests this invocation had sent. */
  readonly requests: number;
  readonly limit?: number;
  readonly cause?: unknown;
}> {
  override readonly message =
    "Planning Center request budget for this invocation is exhausted";
}

const TOO_MANY_SUBREQUESTS = /too many subrequests/iu;

/** Cloudflare rejects a fetch past the invocation's subrequest cap with this error. */
export const isTooManySubrequestsError = (cause: unknown): boolean =>
  cause instanceof Error && TOO_MANY_SUBREQUESTS.test(cause.message);
