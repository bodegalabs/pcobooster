/**
 * What a failed product call left behind for diagnostics: the request ID it sent, the procedure
 * it named, and how long it took. `makeAppClient` records it against the rejection; the query
 * and mutation caches read it back when that rejection turns out to be terminal, so a report
 * carries the ID that finds the Worker's `rpc` line. It also keeps the diagnostics context the call
 * started in, so a failure that arrives after an account switch, a sign-out, or an opt-out is
 * judged by where it came from.
 */
import type { ReportOrigin } from "./diagnostics-client";

export interface CallFailure {
  readonly requestId: string;
  /** The route-table procedure (`plans.list`); null when no request was sent. */
  readonly procedure: string | null;
  readonly durationMs: number;
  /** The diagnostics context when the call started; null when nothing pinned it. */
  readonly origin: ReportOrigin | null;
}

const failures = new WeakMap<object, CallFailure>();

export const recordCallFailure = (cause: unknown, failure: CallFailure) => {
  if (cause instanceof Object) {
    failures.set(cause, failure);
  }
};

export const callFailureOf = (cause: unknown): CallFailure | null =>
  cause instanceof Object ? (failures.get(cause) ?? null) : null;
