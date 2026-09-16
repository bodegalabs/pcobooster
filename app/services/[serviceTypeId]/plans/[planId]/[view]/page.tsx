import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DashboardPage } from "@/components/dashboard-page";
import { SchedulePlanWorkspaceFallback } from "@/components/schedule/schedule-page-fallbacks";
import type { DashboardView } from "@/lib/schedule-navigation";

const isDashboardView = (view: string): view is DashboardView =>
  view === "assign" || view === "lineup" || view === "plan" || view === "times";

interface ServicesPlanViewPageProps {
  params: Promise<{
    serviceTypeId: string;
    planId: string;
    view: string;
  }>;
}

const ServicesPlanViewPage = async ({ params }: ServicesPlanViewPageProps) => {
  const { serviceTypeId, planId, view } = await params;

  if (!isDashboardView(view)) {
    notFound();
  }

  return (
    <Suspense fallback={<SchedulePlanWorkspaceFallback />}>
      <DashboardPage
        planId={planId}
        serviceTypeId={serviceTypeId}
        view={view}
      />
    </Suspense>
  );
};

export default ServicesPlanViewPage;
