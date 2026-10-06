import { faultClass } from "@pcobooster/contracts/faults/fault-class";
import { faultStatus } from "@pcobooster/contracts/faults/outcome";
import { Schema } from "effect";

export class Unauthenticated extends faultClass<Unauthenticated>()(
  "Unauthenticated",
  { message: Schema.String },
  faultStatus("Unauthenticated")
) {}
