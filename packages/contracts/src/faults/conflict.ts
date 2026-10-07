import { faultClass } from "@pcobooster/contracts/faults/fault-class";
import { faultStatus } from "@pcobooster/contracts/faults/outcome";
import { Schema } from "effect";

export class Conflict extends faultClass<Conflict>()(
  "Conflict",
  {
    message: Schema.String,
    reason: Schema.String,
  },
  faultStatus("Conflict")
) {}
