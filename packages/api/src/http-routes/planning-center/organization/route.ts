import { handlePlanningCenterRoute } from "@worship-admin/api/http/planning-center-route";
import { resolveOrganizationTimeZone } from "@worship-admin/api/planning-center/resolve-organization-timezone";

export const dynamic = "force-dynamic";

export const GET = async (request: Request) =>
  await handlePlanningCenterRoute(request, async () => {
    const timeZone = await resolveOrganizationTimeZone();
    return { timeZone };
  });
