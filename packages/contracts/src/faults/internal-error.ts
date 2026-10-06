import {
  faultClass,
  INTERNAL_SERVER_ERROR_MESSAGE,
} from "@pcobooster/contracts/faults/fault-class";
import { faultStatus } from "@pcobooster/contracts/faults/outcome";
import { Effect, Schema } from "effect";

/**
 * A defect, or a success the server could not encode. Programs never construct it: the RPC
 * transport logs and reports the cause, then answers with this so no defect reaches the wire.
 */
export class InternalError extends faultClass<InternalError>()(
  "InternalError",
  {
    message: Schema.Literal(INTERNAL_SERVER_ERROR_MESSAGE).pipe(
      Schema.withConstructorDefault(
        Effect.succeed(INTERNAL_SERVER_ERROR_MESSAGE)
      )
    ),
  },
  faultStatus("InternalError")
) {}
