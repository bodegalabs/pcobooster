import { adjustPlanNeededPositions } from "@pcobooster/api/application/needed-positions";
import { withPlanningCenterAccess } from "@pcobooster/api/application/planning-center-access";
import { executeApplicationEffect } from "@pcobooster/api/transport/orpc/execute";
import { rpc } from "@pcobooster/api/transport/orpc/implementation";

const adjust = rpc.neededPositions.adjust.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      withPlanningCenterAccess(adjustPlanNeededPositions(input)),
      context,
      signal,
      { interruptOnAbort: false }
    )
);

export const neededPositionsRouter = { adjust };
