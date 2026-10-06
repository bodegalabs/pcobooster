import { faultClass } from "@pcobooster/contracts/faults/fault-class";
import { Schema } from "effect";

export class Unauthenticated extends faultClass<Unauthenticated>()(
  "Unauthenticated",
  { message: Schema.String }
) {}
