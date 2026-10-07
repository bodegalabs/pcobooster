import { Data } from "effect";

/**
 * A collection read that cannot return the whole collection: `page-limit` when it still had a
 * next page after the most pages its caller allows, `invalid-next` when Planning Center's next
 * link does not advance the offset. Never read as a complete (or empty) collection.
 */
export class PlanningCenterPaginationError extends Data.TaggedError(
  "PlanningCenterPaginationError"
)<{
  readonly reason: "page-limit" | "invalid-next";
  readonly path: string;
  /** Pages read before stopping. */
  readonly pages: number;
}> {
  override readonly message =
    this.reason === "page-limit"
      ? `Planning Center ${this.path} has more than ${this.pages} pages`
      : `Planning Center ${this.path} returned a next page that does not advance`;
}
