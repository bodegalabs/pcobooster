import {
  readPlanFiles,
  resolvePlanFile,
} from "@pcobooster/api/application/plan-files";
import { withPlanningCenterAccess } from "@pcobooster/api/application/planning-center-access";
import { executeApplicationEffect } from "@pcobooster/api/transport/orpc/execute";
import { rpc } from "@pcobooster/api/transport/orpc/implementation";

export const planFilesRouter = {
  list: rpc.planFiles.list.handler(
    async ({ input, context, signal }) =>
      await executeApplicationEffect(
        withPlanningCenterAccess(readPlanFiles(input)),
        context,
        signal
      )
  ),
  open: rpc.planFiles.open.handler(
    async ({ input, context, signal }) =>
      await executeApplicationEffect(
        withPlanningCenterAccess(resolvePlanFile(input)),
        context,
        signal
      )
  ),
};
