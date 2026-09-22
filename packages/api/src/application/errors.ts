import type { AlreadyScheduled } from "@pcobooster/api/application/errors/already-scheduled";
import type { Conflict } from "@pcobooster/api/application/errors/conflict";
import type { ExternalServiceFailure } from "@pcobooster/api/application/errors/external-service-failure";
import type { Forbidden } from "@pcobooster/api/application/errors/forbidden";
import type { InvalidInput } from "@pcobooster/api/application/errors/invalid-input";
import type { NotFound } from "@pcobooster/api/application/errors/not-found";
import type { PersistenceFailure } from "@pcobooster/api/application/errors/persistence-failure";
import type { PositionMismatch } from "@pcobooster/api/application/errors/position-mismatch";
import type { RateLimited } from "@pcobooster/api/application/errors/rate-limited";
import type { Unauthenticated } from "@pcobooster/api/application/errors/unauthenticated";

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
