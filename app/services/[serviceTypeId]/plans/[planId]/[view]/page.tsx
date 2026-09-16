import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DashboardPage, type DashboardView } from "@/components/dashboard-page";
import { SchedulePlanWorkspaceFallback } from "@/components/schedule/schedule-page-fallbacks";

const dashboardViews = new Set<DashboardView>([
  "assign",
  "lineup",
  "plan",
  "times",
]);

type ServicesPlanViewPageProps = {
  params: Promise<{
    serviceTypeId: string;
    planId: string;
    view: string;
  }>;
};

export default async function ServicesPlanViewPage({
  params,
}: ServicesPlanViewPageProps) {
  const { serviceTypeId, planId, view } = await params;

  if (!dashboardViews.has(view as DashboardView)) {
    notFound();
  }

  return (
    <Suspense fallback={<SchedulePlanWorkspaceFallback />}>
      <DashboardPage
        planId={planId}
        serviceTypeId={serviceTypeId}
        view={view as DashboardView}
      />
    </Suspense>
  );
}
