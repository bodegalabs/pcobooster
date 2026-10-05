import { adjustPlanNeededPositions } from "@pcobooster/api/application/needed-positions";
import { withPlanningCenterAccess } from "@pcobooster/api/application/planning-center-access";
import { executeApplicationEffect } from "@pcobooster/api/transport/rpc/execute";
import { defineHandler } from "@pcobooster/api/transport/rpc/implementation";

const adjust = defineHandler(
  "neededPositions.adjust",
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      withPlanningCenterAccess(adjustPlanNeededPositions(input)),
      context,
      signal,
      { interruptOnAbort: false }
    )
);

export const neededPositionsRouter = { adjust };
