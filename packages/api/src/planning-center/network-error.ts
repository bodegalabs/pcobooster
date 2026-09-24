import { Data } from "effect";

/** A request that produced no usable response: fetch, body stream, or attempt timeout. */
export class PlanningCenterNetworkError extends Data.TaggedError(
  "PlanningCenterNetworkError"
)<{
  readonly cause: unknown;
}> {
  override readonly message =
    "Planning Center request could not reach the provider";
}
