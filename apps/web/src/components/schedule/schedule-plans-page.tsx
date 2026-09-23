"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useCallback, useEffect } from "react";

import { ServicePlanTableSelector } from "@/components/service-plan-table-selector";

const buildPlanWorkspaceUrl = (serviceTypeId: string, planId: string): string =>
  `/services/${encodeURIComponent(serviceTypeId)}/plans/${encodeURIComponent(planId)}/assign`;

export const SchedulePlansPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.toString();

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

      startTransition(() => {
        router.push(nextUrl);
      });
    },
    [router]
  );

  return (
    <main className="bg-background flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain md:overflow-hidden">
      <div className="mx-auto flex w-full max-w-7xl flex-col px-4 pt-1 pb-6 md:min-h-0 md:flex-1 md:px-4 md:py-4">
        <ServicePlanTableSelector
          selectedServiceTypeId={null}
          selectedPlanId={null}
          onSelect={handleServicePlanSelect}
        />
      </div>
    </main>
  );
};
