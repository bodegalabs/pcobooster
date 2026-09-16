import { presentDashboard } from "@/lib/use-cases/planning-center/presentation";
import { z } from "zod";
import { handlePlanningCenterRoute } from "@/lib/http/planning-center-route";
import { logger } from "@/lib/logger";
import { getPeopleDashboard } from "@/lib/use-cases/planning-center/get-people-dashboard";
import type { PeopleDashboardRange } from "@/lib/use-cases/planning-center/people-dashboard-types";
import { peoplePageFlag } from "@/flags";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  range: z.enum(["month", "30", "90"]).optional(),
});

export async function GET(request: Request) {
  const log = logger.withRequest(request);
  return handlePlanningCenterRoute(request, async () => {
    if (!(await peoplePageFlag())) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      range: searchParams.get("range") ?? undefined,
    });

    if (!parsed.success) {
      log.warn({ issues: parsed.error.issues }, "Invalid people dashboard query params");
      throw parsed.error;
    }

    const range = (parsed.data.range ?? "month") as PeopleDashboardRange;
    const dashboard = await getPeopleDashboard({ range });

    log.info(
      {
        range,
        peopleCount: dashboard.people.length,
        sampled: dashboard.requestBudget.sampled,
      },
      "People dashboard fetched"
    );

    return presentDashboard(dashboard);
  });
}
