import { faultClass } from "@pcobooster/contracts/faults/fault-class";
import { faultStatus } from "@pcobooster/contracts/faults/outcome";
import { Schema } from "effect";

export class NotFound extends faultClass<NotFound>()(
  "NotFound",
  {
    message: Schema.String,
    resource: Schema.String,
  },
  faultStatus("NotFound")
) {}
