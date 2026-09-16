import {
  addCalendarDaysToDayKey,
  formatCalendarDayInTimeZone,
} from "@/lib/planning-center/org-calendar";
import { resolveOrganizationTimeZone } from "@/lib/planning-center/resolve-organization-timezone";
import { planningCenterPeopleService } from "@/lib/planning-center/services/people-service";
import type { PlanningCenterPeopleService } from "@/lib/planning-center/services/people-service";
import type { PlanPerson, RawSchedule, ScheduleFrequency } from "@/lib/types";
import {
  buildFrequencyFromServiceHistory,
  buildHistoryAndFrequencyForPerson,
} from "@/lib/use-cases/planning-center/people/history";
import { scheduleResourceSchema } from "@/lib/use-cases/planning-center/people/resource-schemas";

export interface ScheduleHistoryResult {
  planPeople: PlanPerson[];
  frequency: ScheduleFrequency;
}

export interface ScheduleHistoryDependencies {
  peopleService: Pick<PlanningCenterPeopleService, "getPersonSchedules">;
  resolveTimeZone: typeof resolveOrganizationTimeZone;
}

const defaultDependencies: ScheduleHistoryDependencies = {
  peopleService: planningCenterPeopleService,
  resolveTimeZone: resolveOrganizationTimeZone,
};

const isConfirmedStatus = (status: string | undefined): boolean => {
  const normalized = (status ?? "").toLowerCase();
  return normalized === "confirmed" || normalized === "c";
};

export const getScheduleHistory = async (
  personId: string,
  lookbackDays: number,
  dependencies: ScheduleHistoryDependencies = defaultDependencies
): Promise<ScheduleHistoryResult> => {
  const now = new Date();
  const orgTz = await dependencies.resolveTimeZone();
  const refDayKey = formatCalendarDayInTimeZone(now, orgTz);
  const earliestDayKey = addCalendarDaysToDayKey(
    refDayKey,
    -lookbackDays,
    orgTz
  );

  const historyResponse = await dependencies.peopleService.getPersonSchedules(
    personId,
    {},
    3
  );
  const schedules: RawSchedule[] = [];
  for (const resource of historyResponse.data) {
    const parsed = scheduleResourceSchema.safeParse(resource);
    if (parsed.success) {
      schedules.push(parsed.data);
    }
  }
  const historyIncluded = historyResponse.included ?? [];

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

  const planPeople: PlanPerson[] = [];
  for (const item of confirmedHistory) {
    if (formatCalendarDayInTimeZone(item.date, orgTz) < earliestDayKey) {
      continue;
    }
    planPeople.push({
      id: item.id,
      status: item.status,
      createdAt: item.date,
      teamPositionName: item.teamPositionName,
      planTitle: item.planTitle,
      planDate: item.date,
      declineReason: undefined,
    });
  }
  planPeople.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const frequency = buildFrequencyFromServiceHistory(
    confirmedHistory,
    now,
    orgTz
  );

  return {
    planPeople: planPeople.slice(0, 20),
    frequency,
  };
};
