import { handlePlanningCenterRoute } from "@worship-admin/api/http/planning-center-route";
import { logger } from "@worship-admin/api/logger";
import { searchPeople } from "@worship-admin/api/use-cases/planning-center/search-people";
import { z } from "zod";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().min(2).max(80),
});

export const GET = async (request: Request) => {
  const log = logger.withRequest(request);

  return await handlePlanningCenterRoute(request, async () => {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      q: searchParams.get("q") ?? "",
    });

    if (!parsed.success) {
      log.warn({ issues: parsed.error.issues }, "Invalid people search query");
      throw parsed.error;
    }

    const results = await searchPeople(parsed.data.q);

    log.info(
      { queryLength: parsed.data.q.length, count: results.length },
      "People search completed"
    );

    return results;
  });
};
