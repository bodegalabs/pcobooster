import { useQuery } from "@tanstack/react-query";

import { getJson } from "@/lib/http/client";
import { queryKeys } from "@/lib/query-keys";
import type { PlanPerson, ScheduleFrequency } from "@/lib/types";

interface ScheduleHistoryResponse {
  planPeople: PlanPerson[];
  frequency: ScheduleFrequency;
}

export function useScheduleHistory(
  personId: string | undefined,
  days: number = 90
) {
  return useQuery<ScheduleHistoryResponse>({
    queryKey: queryKeys.scheduleHistory(personId ?? null, days),
    queryFn: async () => {
      if (!personId) {
        return {
          planPeople: [],
          frequency: {
            recentServedDays: 0,
            last60Days: 0,
            last90Days: 0,
            recentRehearsalOnlyDays: 0,
            rehearsalLast60Days: 0,
            rehearsalLast90Days: 0,
            totalServed: 0,
            totalRehearsals: 0,
            upcomingServices: 0,
            upcomingRehearsals: 0,
          },
        };
      }

      return getJson<ScheduleHistoryResponse>(
        `/api/schedule-history/${personId}?days=${days}`
      );
    },
    enabled: !!personId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
