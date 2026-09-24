import { createFileRoute } from "@tanstack/react-router";

import { SchedulePlansFallback } from "@/components/schedule/schedule-page-fallbacks";
import { SchedulePlansPage } from "@/components/schedule/schedule-plans-page";

export const Route = createFileRoute("/_app/services/")({
  // Route checks run on the server; the page renders from browser caches.
  ssr: "data-only",
  pendingComponent: SchedulePlansFallback,
  component: SchedulePlansPage,
});
