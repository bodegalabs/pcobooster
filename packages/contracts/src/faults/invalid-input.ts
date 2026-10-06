import { faultClass } from "@pcobooster/contracts/faults/fault-class";
import { Schema } from "effect";

export class InvalidInput extends faultClass<InvalidInput>()("InvalidInput", {
  message: Schema.String,
}) {}
