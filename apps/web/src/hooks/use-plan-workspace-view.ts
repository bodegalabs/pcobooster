import { usePathname } from "next/navigation";

import { parsePlanRoute } from "@/lib/app-routes";
import type { DashboardView } from "@/lib/schedule-navigation";

/**
 * Views switch in place through the History API, so once the workspace has
 * mounted the pathname, not the route param, says which view is showing.
 */
export const usePlanWorkspaceView = (
  serviceTypeId: string,
  planId: string,
  routeView: DashboardView
): DashboardView => {
  const pathPlan = parsePlanRoute(usePathname());
  return pathPlan?.serviceTypeId === serviceTypeId && pathPlan.planId === planId
    ? pathPlan.view
    : routeView;
};
