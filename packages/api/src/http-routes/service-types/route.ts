import { handlePlanningCenterRoute } from "@worship-admin/api/http/planning-center-route";
import { logger } from "@worship-admin/api/logger";
import { getServiceTypes } from "@worship-admin/api/use-cases/planning-center/get-service-types";

export const dynamic = "force-dynamic";

const log = logger.for("api/service-types");

export const GET = async (request: Request) =>
  await handlePlanningCenterRoute(request, async ({ session }) => {
    log.info("Fetching service types");
    const serviceTypes = await getServiceTypes();

    log.info(
      { count: serviceTypes.length, userId: session?.user.id },
      "Service types fetched"
    );
    return serviceTypes;
  });
