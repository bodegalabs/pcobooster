import { Suspense } from "react";

import { SchedulePlansFallback } from "@/components/schedule/schedule-page-fallbacks";
import { SchedulePlansPage } from "@/components/schedule/schedule-plans-page";

export default function ServicesPage() {
  return (
    <Suspense fallback={<SchedulePlansFallback />}>
      <SchedulePlansPage />
    </Suspense>
  );
}
