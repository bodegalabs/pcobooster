/** A failed fetch before Planning Center returned an HTTP response. */
export class PlanningCenterNetworkError extends Error {
  override readonly name = "PlanningCenterNetworkError";

  constructor(cause: Error) {
    super("Planning Center request could not reach the provider", { cause });
  }
}
