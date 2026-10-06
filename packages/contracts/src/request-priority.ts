/**
 * Who is waiting on an RPC call. `interactive` loads what is on screen or what a click just
 * asked for; `speculative` loads ahead of a likely next step (a hover, a warm-up). Every call
 * spends the same Planning Center user's budget, so the API admits speculative reads only while
 * most of that budget is unused and rejects them before sending anything otherwise.
 */
export type RequestPriority = "interactive" | "speculative";

/**
 * RPC message header with each call's priority, which every client sends on every call (it rides
 * in the message, not the HTTP request). Absent reads as interactive.
 */
export const REQUEST_PRIORITY_HEADER = "x-pcobooster-priority";

/** Unknown or missing values are interactive, so a stray header never demotes a call. */
export const parseRequestPriority = (
  value: string | null | undefined
): RequestPriority => (value === "speculative" ? "speculative" : "interactive");
