import { faultClass } from "@pcobooster/contracts/faults/fault-class";
import { Schema } from "effect";

/**
 * The caller announced an RPC protocol older than the server supports (`x-pcobooster-client`),
 * or a header the server cannot read. The procedure never ran; the app must reload or update.
 */
export class ClientOutdated extends faultClass<ClientOutdated>()(
  "ClientOutdated",
  {
    message: Schema.String,
    /** The oldest protocol version the server still answers. */
    minimumProtocolVersion: Schema.Int,
  }
) {}
