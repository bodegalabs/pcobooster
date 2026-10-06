import {
  faultClass,
  INTERNAL_SERVER_ERROR_MESSAGE,
  serverOnly,
} from "@pcobooster/contracts/faults/fault-class";
import { Effect, Schema } from "effect";

/**
 * A database read or write failed. The wire message is always "Internal server error";
 * `detail` and `operation` say what failed, for logs and error reports only.
 */
export class PersistenceFailure extends faultClass<PersistenceFailure>()(
  "PersistenceFailure",
  {
    message: Schema.Literal(INTERNAL_SERVER_ERROR_MESSAGE).pipe(
      Schema.withConstructorDefault(
        Effect.succeed(INTERNAL_SERVER_ERROR_MESSAGE)
      )
    ),
    detail: serverOnly(Schema.String),
    operation: serverOnly(Schema.String),
    cause: serverOnly(Schema.Unknown),
  }
) {}
