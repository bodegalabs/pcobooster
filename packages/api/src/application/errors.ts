import type { AlreadyScheduled } from "@pcobooster/contracts/faults/already-scheduled";
import type { Conflict } from "@pcobooster/contracts/faults/conflict";
import type { ExternalServiceFailure } from "@pcobooster/contracts/faults/external-service-failure";
import type { Forbidden } from "@pcobooster/contracts/faults/forbidden";
import type { InvalidInput } from "@pcobooster/contracts/faults/invalid-input";
import type { NotFound } from "@pcobooster/contracts/faults/not-found";
import type { PersistenceFailure } from "@pcobooster/contracts/faults/persistence-failure";
import type { PositionMismatch } from "@pcobooster/contracts/faults/position-mismatch";
import type { RateLimited } from "@pcobooster/contracts/faults/rate-limited";
import type { Unauthenticated } from "@pcobooster/contracts/faults/unauthenticated";

/**
 * The faults application programs fail with. `RequestRejected` and `InternalError` are not
 * among them: only the transport (`packages/api/src/http`) answers with those.
 */
export type ApplicationFault =
  | AlreadyScheduled
  | PositionMismatch
  | Unauthenticated
  | Forbidden
  | InvalidInput
  | NotFound
  | Conflict
  | ExternalServiceFailure
  | RateLimited
  | PersistenceFailure;
