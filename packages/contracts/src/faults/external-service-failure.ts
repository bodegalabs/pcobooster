import {
  faultClass,
  serverOnly,
} from "@pcobooster/contracts/faults/fault-class";
import { faultStatus } from "@pcobooster/contracts/faults/outcome";
import { Schema } from "effect";

export class ExternalServiceFailure extends faultClass<ExternalServiceFailure>()(
  "ExternalServiceFailure",
  {
    message: Schema.String,
    service: Schema.String,
    cause: serverOnly(Schema.Unknown),
  },
  faultStatus("ExternalServiceFailure")
) {}
