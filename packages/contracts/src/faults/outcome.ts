/**
 * HTTP status and code per fault: the one table behind server logs, the schedule audit's
 * status and error code columns, error reporting (5xx only), client retry and navigation, and
 * each fault class's `httpApiStatus` (how HttpApi encodes and the client decodes it). Codes are
 * stable strings: audit rows and dashboards compare them across releases, so never rename one.
 * `faults.ts` checks the table names every fault and nothing else.
 */
export const faultOutcome = {
  Unauthenticated: { status: 401, code: "UNAUTHORIZED" },
  Forbidden: { status: 403, code: "FORBIDDEN" },
  InvalidInput: { status: 400, code: "BAD_REQUEST" },
  RequestRejected: { status: 400, code: "BAD_REQUEST" },
  ClientOutdated: { status: 426, code: "CLIENT_OUTDATED" },
  NotFound: { status: 404, code: "NOT_FOUND" },
  Conflict: { status: 409, code: "CONFLICT" },
  AlreadyScheduled: { status: 409, code: "ALREADY_SCHEDULED" },
  PositionMismatch: { status: 409, code: "POSITION_MISMATCH" },
  RateLimited: { status: 429, code: "TOO_MANY_REQUESTS" },
  ExternalServiceFailure: { status: 502, code: "BAD_GATEWAY" },
  PersistenceFailure: { status: 500, code: "INTERNAL_SERVER_ERROR" },
  InternalError: { status: 500, code: "INTERNAL_SERVER_ERROR" },
} as const satisfies Record<
  string,
  { readonly status: number; readonly code: string }
>;

/** The `httpApiStatus` annotation for a fault class: its status from the table above. */
export const faultStatus = (tag: keyof typeof faultOutcome) => ({
  httpApiStatus: faultOutcome[tag].status,
});
