import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/components/dashboard-page";
import { assertPlanView } from "@/lib/app-routes";
import { planWorkspaceSearchSchema } from "@/lib/route-search";

const PlanWorkspacePage = () => {
  const { serviceTypeId, planId, view } = Route.useParams();
  return (
    <DashboardPage serviceTypeId={serviceTypeId} planId={planId} view={view} />
  );
};

export const Route = createFileRoute(
  "/_app/services/$serviceTypeId/plans/$planId/$view"
)({
  params: {
    parse: ({ view }) => {
      assertPlanView(view);
      return { view };
    },
    stringify: ({ view }) => ({ view }),
  },
  validateSearch: planWorkspaceSearchSchema,
  component: PlanWorkspacePage,
});
