/**
 * The one set of faults. Application programs fail with them, RPC handlers return them
 * unchanged, the wire carries them, and clients catch the same classes (`instanceof NotFound`).
 * Each class lives in `faults/<name>.ts`; this module is the union and the status table.
 */
import { AlreadyScheduled } from "@pcobooster/contracts/faults/already-scheduled";
import { Conflict } from "@pcobooster/contracts/faults/conflict";
import { ExternalServiceFailure } from "@pcobooster/contracts/faults/external-service-failure";
import { Forbidden } from "@pcobooster/contracts/faults/forbidden";
import { InternalError } from "@pcobooster/contracts/faults/internal-error";
import { InvalidInput } from "@pcobooster/contracts/faults/invalid-input";
import { NotFound } from "@pcobooster/contracts/faults/not-found";
import { PersistenceFailure } from "@pcobooster/contracts/faults/persistence-failure";
import { PositionMismatch } from "@pcobooster/contracts/faults/position-mismatch";
import { RateLimited } from "@pcobooster/contracts/faults/rate-limited";
import { RequestRejected } from "@pcobooster/contracts/faults/request-rejected";
import { Unauthenticated } from "@pcobooster/contracts/faults/unauthenticated";
import { Schema } from "effect";

/** Every fault a procedure can answer with. */
export const productFaultSchema = Schema.Union([
  Unauthenticated,
  Forbidden,
  InvalidInput,
  RequestRejected,
  NotFound,
  Conflict,
  AlreadyScheduled,
  PositionMismatch,
  RateLimited,
  ExternalServiceFailure,
  PersistenceFailure,
  InternalError,
]);
export type ProductFault = typeof productFaultSchema.Type;
export type ProductFaultTag = ProductFault["_tag"];

/**
 * HTTP status and code per fault: the one table behind server logs, the schedule audit's
 * status and error code columns, error reporting (5xx only), and client retry and navigation.
 * Codes keep main's strings so audit rows and dashboards stay comparable.
 */
export const faultOutcome = {
  Unauthenticated: { status: 401, code: "UNAUTHORIZED" },
  Forbidden: { status: 403, code: "FORBIDDEN" },
  InvalidInput: { status: 400, code: "BAD_REQUEST" },
  RequestRejected: { status: 400, code: "BAD_REQUEST" },
  NotFound: { status: 404, code: "NOT_FOUND" },
  Conflict: { status: 409, code: "CONFLICT" },
  AlreadyScheduled: { status: 409, code: "ALREADY_SCHEDULED" },
  PositionMismatch: { status: 409, code: "POSITION_MISMATCH" },
  RateLimited: { status: 429, code: "TOO_MANY_REQUESTS" },
  ExternalServiceFailure: { status: 502, code: "BAD_GATEWAY" },
  PersistenceFailure: { status: 500, code: "INTERNAL_SERVER_ERROR" },
  InternalError: { status: 500, code: "INTERNAL_SERVER_ERROR" },
} as const satisfies Record<
  ProductFaultTag,
  { readonly status: number; readonly code: string }
>;

/** Procedures interrupted because their caller went away are logged with this outcome. */
export const clientClosedOutcome = {
  status: 499,
  code: "CLIENT_CLOSED_REQUEST",
} as const;

export const isProductFault: (value: unknown) => value is ProductFault =
  Schema.is(productFaultSchema);
