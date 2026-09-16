import type { NextRequest } from "next/server";

import { handlePlanningCenterRoute } from "@/lib/http/planning-center-route";
import { logger } from "@/lib/logger";
import { getServiceTypes } from "@/lib/use-cases/planning-center/get-service-types";

export const dynamic = "force-dynamic";

const log = logger.for("api/service-types");

export async function GET(request: NextRequest) {
  return handlePlanningCenterRoute(request, async ({ session }) => {
    log.info("Fetching service types");
    const serviceTypes = await getServiceTypes();

    log.info(
      { count: serviceTypes.length, userId: session?.user.id },
      "Service types fetched"
    );
    return serviceTypes;
  });
}
