import type { Conflict } from "@worship-admin/api/application/errors/conflict";
import type { ExternalServiceFailure } from "@worship-admin/api/application/errors/external-service-failure";
import type { Forbidden } from "@worship-admin/api/application/errors/forbidden";
import type { InvalidInput } from "@worship-admin/api/application/errors/invalid-input";
import type { NotFound } from "@worship-admin/api/application/errors/not-found";
import type { PersistenceFailure } from "@worship-admin/api/application/errors/persistence-failure";
import type { RateLimited } from "@worship-admin/api/application/errors/rate-limited";
import type { Unauthenticated } from "@worship-admin/api/application/errors/unauthenticated";

export type ApplicationFault =
  | Unauthenticated
  | Forbidden
  | InvalidInput
  | NotFound
  | Conflict
  | ExternalServiceFailure
  | RateLimited
  | PersistenceFailure;
