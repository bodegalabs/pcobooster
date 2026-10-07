import { Data } from "effect";

const messages = {
  "page-limit": (path: string, pages: number) =>
    `Planning Center ${path} has more than ${pages} pages`,
  "invalid-next": (path: string) =>
    `Planning Center ${path} returned a next page that does not advance`,
  "cursor-limit": (path: string) =>
    `Planning Center ${path} lists more than one continuation can carry`,
  changed: (path: string) =>
    `Planning Center ${path} changed between the calls reading it`,
} as const;

/**
 * A collection read that cannot return the whole collection: `page-limit` when it still had a
 * next page after the most pages its caller allows, `invalid-next` when Planning Center's next
 * link does not advance the offset, `cursor-limit` when what it found must be carried to a
 * follow-up call and would not fit the continuation the API accepts, `changed` when records
 * before where an earlier call stopped moved, so offsets no longer resume it. Never read as a
 * complete (or empty) collection.
 */
export class PlanningCenterPaginationError extends Data.TaggedError(
  "PlanningCenterPaginationError"
)<{
  readonly reason: keyof typeof messages;
  readonly path: string;
  /** Pages of `path` read before stopping, in the call that stopped. */
  readonly pages: number;
}> {
  override readonly message = messages[this.reason](this.path, this.pages);
}
