/** Open slots for a position on a plan. */
import { write } from "@pcobooster/contracts/http/endpoint";
import { planningCenterGroup } from "@pcobooster/contracts/http/group";
import {
  nonNegativeInteger,
  requiredId,
} from "@pcobooster/contracts/http/schema";
import { Struct, Schema } from "effect";

export const neededPositionsAdjustInputSchema = Schema.Struct({
  serviceTypeId: requiredId,
  planId: requiredId,
  teamId: requiredId,
  positionName: requiredId,
  change: Schema.Literals(["add", "remove"]),
});

/** The position's open slots after the change; unchanged when it had no open-slot record. */
export const neededPositionsAdjustOutputSchema = Schema.Struct({
  openCount: nonNegativeInteger,
});

const PLAN = ["serviceTypeId", "planId"] as const;

export const neededPositions = planningCenterGroup(
  "neededPositions",
  /** One slot more or fewer: an action, so each call is its own adjustment. */
  write.post(
    "adjust",
    "/service-types/:serviceTypeId/plans/:planId/needed-positions/adjustments",
    {
      params: Struct.pick(neededPositionsAdjustInputSchema.fields, PLAN),
      payload: Struct.omit(neededPositionsAdjustInputSchema.fields, PLAN),
      success: neededPositionsAdjustOutputSchema,
    }
  )
);
