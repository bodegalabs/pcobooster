import { faultClass } from "@pcobooster/contracts/faults/fault-class";
import { faultStatus } from "@pcobooster/contracts/faults/outcome";
import { Schema } from "effect";

/**
 * The request never reached a handler: it names no endpoint (`unknown-endpoint`), its input did
 * not decode (`invalid-payload`), or its body was not JSON (`malformed-request`). Almost always
 * version skew (an old tab or app build) or a hand-written caller. Only the transport produces
 * it, never a program.
 */
export class RequestRejected extends faultClass<RequestRejected>()(
  "RequestRejected",
  {
    message: Schema.String,
    reason: Schema.Literals([
      "unknown-procedure",
      "unknown-endpoint",
      "invalid-payload",
      "malformed-request",
    ]),
  },
  faultStatus("RequestRejected")
) {}
