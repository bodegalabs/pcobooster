import { faultClass } from "@pcobooster/contracts/faults/fault-class";
import { Schema } from "effect";

export class PositionMismatch extends faultClass<PositionMismatch>()(
  "PositionMismatch",
  {
    message: Schema.String,
    details: Schema.Struct({
      selected: Schema.Struct({
        teamId: Schema.String,
        teamName: Schema.String,
        positionId: Schema.String,
        positionName: Schema.String,
      }),
      created: Schema.Struct({
        planPersonId: Schema.String,
        teamPositionName: Schema.String,
      }),
    }),
  }
) {}
