import { z } from "zod";

import { handlePlanningCenterRoute } from "@/lib/http/planning-center-route";
import { logger } from "@/lib/logger";
import { searchPeople } from "@/lib/use-cases/planning-center/search-people";

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
