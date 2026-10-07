import { faultClass } from "@pcobooster/contracts/faults/fault-class";
import { faultStatus } from "@pcobooster/contracts/faults/outcome";
import { Schema } from "effect";

export class InvalidInput extends faultClass<InvalidInput>()(
  "InvalidInput",
  {
    message: Schema.String,
  },
  faultStatus("InvalidInput")
) {}
