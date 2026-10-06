import { faultClass } from "@pcobooster/contracts/faults/fault-class";
import { Schema } from "effect";

/**
 * The request never reached a handler: its procedure is unknown or its payload did not decode.
 * Almost always version skew (an old tab or app build). Only the RPC protocol produces it.
 */
export class RequestRejected extends faultClass<RequestRejected>()(
  "RequestRejected",
  {
    message: Schema.String,
    reason: Schema.Literals(["unknown-procedure", "invalid-payload"]),
  }
) {}
