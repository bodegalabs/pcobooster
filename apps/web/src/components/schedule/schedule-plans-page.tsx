"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useState,
  useTransition,
} from "react";

import { ServicePlanTableSelector } from "@/components/service-plan-table-selector";
import { buildPlanWorkspaceUrl } from "@/lib/schedule-navigation";

export const SchedulePlansPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.toString();
  const [isOpeningPlan, startOpeningPlan] = useTransition();
  const [openingPlanId, setOpeningPlanId] = useState<string | null>(null);

  useEffect(() => {
    if (!searchQuery) {
      return;
    }

    startTransition(() => {
      router.replace("/services");
    });
  }, [router, searchQuery]);

  const handleServicePlanSelect = useCallback(
    ({ serviceTypeId, planId }: { serviceTypeId: string; planId: string }) => {
      const nextUrl = buildPlanWorkspaceUrl(serviceTypeId, planId);

      // Mark the row right away; if the route is not prefetched yet, the
      // highlight and bar acknowledge the click until the plan shell arrives.
      setOpeningPlanId(planId);
      startOpeningPlan(() => {
        router.push(nextUrl);
      });
    },
    [router]
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
