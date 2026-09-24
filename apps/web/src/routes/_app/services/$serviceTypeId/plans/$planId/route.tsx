import { createFileRoute } from "@tanstack/react-router";

import { SchedulePlanWorkspaceFallback } from "@/components/schedule/schedule-page-fallbacks";

/**
 * Scoped to the plan so opening one shows its shell at once, while switching views inside
 * the plan keeps the current view on screen.
 */
export const Route = createFileRoute(
  "/_app/services/$serviceTypeId/plans/$planId"
)({
  ssr: "data-only",
  pendingComponent: SchedulePlanWorkspaceFallback,
});
