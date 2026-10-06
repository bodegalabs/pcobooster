import { faultClass } from "@pcobooster/contracts/faults/fault-class";
import { Schema } from "effect";

export class RateLimited extends faultClass<RateLimited>()("RateLimited", {
  message: Schema.String,
  service: Schema.String,
  retryAfterSeconds: Schema.optional(Schema.Number),
}) {}
