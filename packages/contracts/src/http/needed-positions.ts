/** Open slots for a position on a plan. */
import { write } from "@pcobooster/contracts/http/endpoint";
import { planningCenterGroup } from "@pcobooster/contracts/http/group";
import {
  neededPositionsAdjustInputSchema,
  neededPositionsAdjustOutputSchema,
} from "@pcobooster/contracts/rpc/needed-positions";
import { Struct } from "effect";

const PLAN = ["serviceTypeId", "planId"] as const;

export const neededPositions = planningCenterGroup(
  "neededPositions",
  /** One slot more or fewer: an action, so each call is its own adjustment. */
  write.post(
    "neededPositions.adjust",
    "/service-types/:serviceTypeId/plans/:planId/needed-positions/adjustments",
    {
      params: Struct.pick(neededPositionsAdjustInputSchema.fields, PLAN),
      payload: Struct.omit(neededPositionsAdjustInputSchema.fields, PLAN),
      success: neededPositionsAdjustOutputSchema,
    }
  )
);
