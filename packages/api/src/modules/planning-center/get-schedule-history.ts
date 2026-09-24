import { buildHistoryAndFrequencyForPerson } from "@pcobooster/api/modules/planning-center/people/history";
import { scheduleResourceSchema } from "@pcobooster/api/modules/planning-center/people/resource-schemas";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import {
  addCalendarDaysToDayKey,
  formatCalendarDayInTimeZone,
} from "@pcobooster/planning-center-models/calendar";
import { buildFrequencyFromServiceHistory } from "@pcobooster/planning-center-models/candidate-frequency";
import type {
  PlanPerson,
  RawSchedule,
  ScheduleFrequency,
} from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

export interface ScheduleHistoryResult {
  planPeople: PlanPerson[];
  frequency: ScheduleFrequency;
}

export interface ScheduleHistoryDependencies {
  peopleService: Pick<PlanningCenterPeopleService, "getPersonSchedules">;
  resolveTimeZone: Effect.Effect<string, PlanningCenterError>;
}

const isConfirmedStatus = (status: string | undefined): boolean => {
  const normalized = (status ?? "").toLowerCase();
  return normalized === "confirmed" || normalized === "c";
};

export const getScheduleHistory = (
  personId: string,
  lookbackDays: number,
  dependencies: ScheduleHistoryDependencies
): Effect.Effect<ScheduleHistoryResult, PlanningCenterError> =>
  Effect.gen(function* readScheduleHistory() {
    const now = new Date();
    const orgTz = yield* dependencies.resolveTimeZone;
    const refDayKey = formatCalendarDayInTimeZone(now, orgTz);
    const earliestDayKey = addCalendarDaysToDayKey(
      refDayKey,
      -lookbackDays,
      orgTz
    );

    const historyResponse =
      yield* dependencies.peopleService.getPersonSchedules(personId, {}, 3);
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
  });
