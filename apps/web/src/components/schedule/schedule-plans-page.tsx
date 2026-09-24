import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState, useTransition } from "react";

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

    // Services takes no query; drop stale ones from old links.
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
    <main className="bg-background flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain md:overflow-hidden">
      <div className="pb-tab-bar mx-auto flex w-full max-w-7xl flex-col px-4 pt-1 md:min-h-0 md:flex-1 md:px-4 md:py-4">
        <ServicePlanTableSelector
          selectedServiceTypeId={null}
          selectedPlanId={isOpeningPlan ? openingPlanId : null}
          isNavigating={isOpeningPlan}
          onSelect={handleServicePlanSelect}
        />
      </div>
    </main>
  );
};
