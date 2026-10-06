import { faultClass } from "@pcobooster/contracts/faults/fault-class";
import { Schema } from "effect";

export class Conflict extends faultClass<Conflict>()("Conflict", {
  message: Schema.String,
  reason: Schema.String,
}) {}
