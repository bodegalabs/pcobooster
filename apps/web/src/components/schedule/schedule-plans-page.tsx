import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState, useTransition } from "react";

import { PageShell } from "@/components/page-shell";
import { ServicePlanTableSelector } from "@/components/service-plan-table-selector";
import { planWorkspaceLink } from "@/lib/schedule-navigation";

export const SchedulePlansPage = () => {
  const navigate = useNavigate();
  const searchQuery = useLocation({ select: (location) => location.searchStr });
  const [isOpeningPlan, startOpeningPlan] = useTransition();
  const [openingPlanId, setOpeningPlanId] = useState<string | null>(null);

  useEffect(() => {
    if (!searchQuery) {
      return;
    }

    // Services takes no query; drop any a link carried.
    void navigate({ to: "/services", replace: true });
  }, [navigate, searchQuery]);

  const handleServicePlanSelect = useCallback(
    ({ serviceTypeId, planId }: { serviceTypeId: string; planId: string }) => {
      // Mark the row right away; if the route is not preloaded yet, the
      // highlight and bar acknowledge the click until the plan shell arrives.
      setOpeningPlanId(planId);
      startOpeningPlan(async () => {
        await navigate(planWorkspaceLink(serviceTypeId, planId));
      });
    },
    [navigate]
  );

  return (
    <PageShell layout="fill">
      <ServicePlanTableSelector
        selectedServiceTypeId={null}
        selectedPlanId={isOpeningPlan ? openingPlanId : null}
        isNavigating={isOpeningPlan}
        onSelect={handleServicePlanSelect}
      />
    </PageShell>
  );
};
