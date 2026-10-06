import {
  faultClass,
  serverOnly,
} from "@pcobooster/contracts/faults/fault-class";
import { Schema } from "effect";

export class ExternalServiceFailure extends faultClass<ExternalServiceFailure>()(
  "ExternalServiceFailure",
  {
    message: Schema.String,
    service: Schema.String,
    cause: serverOnly(Schema.Unknown),
  }
) {}
