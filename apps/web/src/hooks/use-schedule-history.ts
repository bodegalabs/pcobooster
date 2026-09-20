import { useQuery } from "@tanstack/react-query";

import { scheduleHistoryResponseSchema } from "@/lib/api-schemas";
import { getJson } from "@/lib/http/client";
import { isNonEmptyString } from "@/lib/json";
import { queryKeys } from "@/lib/query-keys";
import type { PlanPerson, ScheduleFrequency } from "@/lib/types";

interface ScheduleHistoryResponse {
  planPeople: PlanPerson[];
  frequency: ScheduleFrequency;
}

export const useScheduleHistory = (personId: string | undefined, days = 90) =>
  useQuery<ScheduleHistoryResponse>({
    queryKey: queryKeys.scheduleHistory(personId ?? null, days),
    queryFn: async () => {
      if (!isNonEmptyString(personId)) {
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

      return await getJson(
        `/api/schedule-history/${personId}?days=${days}`,
        scheduleHistoryResponseSchema
      );
    },
    enabled: isNonEmptyString(personId),
    // 5 minutes
    staleTime: 5 * 60 * 1000,
  });
