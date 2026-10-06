import { faultClass } from "@pcobooster/contracts/faults/fault-class";
import { Schema } from "effect";

export class AlreadyScheduled extends faultClass<AlreadyScheduled>()(
  "AlreadyScheduled",
  { message: Schema.String, details: Schema.optional(Schema.String) }
) {}
