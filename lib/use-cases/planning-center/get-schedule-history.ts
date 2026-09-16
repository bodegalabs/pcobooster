import {
  addCalendarDaysToDayKey,
  formatCalendarDayInTimeZone,
} from "@/lib/planning-center/org-calendar";
import { resolveOrganizationTimeZone } from "@/lib/planning-center/resolve-organization-timezone";
import { planningCenterPeopleService } from "@/lib/planning-center/services/people-service";
import type { PlanPerson, RawSchedule, ScheduleFrequency } from "@/lib/types";
import {
  buildFrequencyFromServiceHistory,
  buildHistoryAndFrequencyForPerson,
} from "@/lib/use-cases/planning-center/people/history";

export interface ScheduleHistoryResult {
  planPeople: PlanPerson[];
  frequency: ScheduleFrequency;
}

function isConfirmedStatus(status: string | undefined): boolean {
  const normalized = (status || "").toLowerCase();
  return normalized === "confirmed" || normalized === "c";
}

export async function getScheduleHistory(
  personId: string,
  lookbackDays: number
): Promise<ScheduleHistoryResult> {
  const now = new Date();
  const orgTz = await resolveOrganizationTimeZone();
  const refDayKey = formatCalendarDayInTimeZone(now, orgTz);
  const earliestDayKey = addCalendarDaysToDayKey(
    refDayKey,
    -lookbackDays,
    orgTz
  );

  const historyResponse = await planningCenterPeopleService.getPersonSchedules(
    personId,
    {},
    3
  );
  const schedules = historyResponse.data as unknown as RawSchedule[];
  const historyIncluded = historyResponse.included || [];

  const historyResult = buildHistoryAndFrequencyForPerson(
    schedules,
    historyIncluded,
    now,
    {},
    Number.POSITIVE_INFINITY,
    orgTz
  );

  const confirmedHistory = historyResult.serviceHistory.filter((item) =>
    isConfirmedStatus(item.status)
  );

  const planPeople: PlanPerson[] = confirmedHistory
    .map((item) => ({
      id: item.id,
      status: item.status,
      createdAt: item.date,
      teamPositionName: item.teamPositionName,
      planTitle: item.planTitle,
      planDate: item.date,
      declineReason: undefined,
    }))
    .filter(
      (pp) => formatCalendarDayInTimeZone(pp.createdAt, orgTz) >= earliestDayKey
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const frequency = buildFrequencyFromServiceHistory(
    confirmedHistory,
    now,
    orgTz
  );

  return {
    planPeople: planPeople.slice(0, 20),
    frequency,
  };
}
