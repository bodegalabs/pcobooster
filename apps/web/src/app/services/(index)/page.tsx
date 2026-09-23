import { Suspense } from "react";

import { SchedulePlansFallback } from "@/components/schedule/schedule-page-fallbacks";
import { SchedulePlansPage } from "@/components/schedule/schedule-plans-page";

const ServicesPage = () => (
  <Suspense fallback={<SchedulePlansFallback />}>
    <SchedulePlansPage />
  </Suspense>
);

export default ServicesPage;
