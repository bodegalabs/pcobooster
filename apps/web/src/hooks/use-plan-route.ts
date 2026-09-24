import { useMatch } from "@tanstack/react-router";

import type { PlanRoute } from "@/lib/app-routes";

/** The plan workspace on screen, or null outside one. */
export const usePlanRoute = (): PlanRoute | null =>
  useMatch({
    from: "/_app/services/$serviceTypeId/plans/$planId/$view",
    shouldThrow: false,
    select: ({ params }) => ({
      serviceTypeId: params.serviceTypeId,
      planId: params.planId,
      view: params.view,
    }),
  }) ?? null;
