import { faultClass } from "@pcobooster/contracts/faults/fault-class";
import { faultStatus } from "@pcobooster/contracts/faults/outcome";
import { Schema } from "effect";

/** Messages are written for people (the read-only demo notice); clients show them as is. */
export class Forbidden extends faultClass<Forbidden>()(
  "Forbidden",
  {
    message: Schema.String,
  },
  faultStatus("Forbidden")
) {}
