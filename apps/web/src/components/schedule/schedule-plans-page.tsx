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
    <main className="bg-background flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-3 py-3 sm:px-4 sm:py-4">
        <ServicePlanTableSelector
          selectedServiceTypeId={null}
          selectedPlanId={null}
          onSelect={handleServicePlanSelect}
        />
      </div>
    </main>
  );
};
