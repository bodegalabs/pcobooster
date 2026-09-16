import { withPlanningCenterUser } from "@/lib/auth/planning-center-session";
import type { PlanningCenterUserAuthContext } from "@/lib/auth/planning-center-session";
import { handleRoute } from "@/lib/http/route-handler";

export const handlePlanningCenterRoute = async <T>(
  request: Request,
  handler: (ctx: PlanningCenterUserAuthContext) => Promise<T>
) =>
  await handleRoute(async () => await withPlanningCenterUser(request, handler));
