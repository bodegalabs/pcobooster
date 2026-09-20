import { withPlanningCenterUser } from "@worship-admin/api/auth/planning-center-session";
import type { PlanningCenterUserAuthContext } from "@worship-admin/api/auth/planning-center-session";
import { handleRoute } from "@worship-admin/api/http/route-handler";

export const handlePlanningCenterRoute = async <T>(
  request: Request,
  handler: (ctx: PlanningCenterUserAuthContext) => Promise<T>
) =>
  await handleRoute(async () => await withPlanningCenterUser(request, handler));
