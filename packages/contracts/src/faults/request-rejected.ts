import { faultClass } from "@pcobooster/contracts/faults/fault-class";
import { Schema } from "effect";

/**
 * The request never reached a handler: its procedure is unknown, its payload did not decode, or
 * the message itself was not a well-formed RPC request. Almost always version skew (an old tab or
 * app build) or a hand-written caller. Only the RPC protocol produces it.
 */
export class RequestRejected extends faultClass<RequestRejected>()(
  "RequestRejected",
  {
    message: Schema.String,
    reason: Schema.Literals([
      "unknown-procedure",
      "invalid-payload",
      "malformed-request",
    ]),
  }
) {}
