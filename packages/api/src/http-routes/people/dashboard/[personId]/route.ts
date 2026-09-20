import { handlePlanningCenterRoute } from "@worship-admin/api/http/planning-center-route";
import { logger } from "@worship-admin/api/logger";
import { peoplePageFlag } from "@worship-admin/api/people-page-flag";
import { getPeopleDashboardPerson } from "@worship-admin/api/use-cases/planning-center/get-people-dashboard-person";
import { presentDashboardPerson } from "@worship-admin/api/use-cases/planning-center/presentation";
import { z } from "zod";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/u)
    .optional(),
});

export const GET = async (
  request: Request,
  { params }: { params: Promise<{ personId: string }> }
) => {
  const log = logger.withRequest(request);
  return await handlePlanningCenterRoute(request, async () => {
    if (!(await peoplePageFlag(request))) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const { personId } = await params;
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      month: searchParams.get("month") ?? undefined,
    });

    if (!parsed.success) {
      log.warn(
        { issues: parsed.error.issues },
        "Invalid people detail query params"
      );
      throw parsed.error;
    }

    const detail = await getPeopleDashboardPerson({
      personId,
      month: parsed.data.month,
    });

    log.info(
      {
        personId,
        month: parsed.data.month,
      },
      "People dashboard detail fetched"
    );

    return await presentDashboardPerson(detail);
  });
};
