/**
 * The one set of faults. Application programs fail with them, RPC handlers return them
 * unchanged, the wire carries them, and clients catch the same classes (`instanceof NotFound`).
 * Each class lives in `faults/<name>.ts`; this module is the union and the status table.
 */
import { AlreadyScheduled } from "@pcobooster/contracts/faults/already-scheduled";
import { ClientOutdated } from "@pcobooster/contracts/faults/client-outdated";
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
  ClientOutdated,
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

export { faultOutcome } from "@pcobooster/contracts/faults/outcome";

/** Procedures interrupted because their caller went away are logged with this outcome. */
export const clientClosedOutcome = {
  status: 499,
  code: "CLIENT_CLOSED_REQUEST",
} as const;

export const isProductFault: (value: unknown) => value is ProductFault =
  Schema.is(productFaultSchema);
