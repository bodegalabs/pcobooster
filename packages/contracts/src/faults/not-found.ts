import { faultClass } from "@pcobooster/contracts/faults/fault-class";
import { Schema } from "effect";

export class NotFound extends faultClass<NotFound>()("NotFound", {
  message: Schema.String,
  resource: Schema.String,
}) {}
