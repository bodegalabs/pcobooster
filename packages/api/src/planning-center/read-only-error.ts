import { Data } from "effect";

/** A write attempted through a read-only client; nothing was sent. */
export class PlanningCenterReadOnlyError extends Data.TaggedError(
  "PlanningCenterReadOnlyError"
)<{
  readonly method: string;
  readonly path: string;
}> {
  override readonly message = `Planning Center ${this.method} ${this.path} blocked by a read-only client`;
}
