import { Data } from "effect";

/**
 * The credential's Planning Center budget is spent for longer than an
 * interactive request should wait, so the request was not sent.
 */
export class PlanningCenterRateLimitError extends Data.TaggedError(
  "PlanningCenterRateLimitError"
)<{
  readonly retryAfterSeconds: number;
}> {
  override readonly message =
    "Planning Center rate limit budget is exhausted for this credential";
}
