import { findIncluded } from "@pcobooster/api/planning-center/utils";
import {
  isDeclinedAssignmentStatus,
  summarizeCandidateHistory,
} from "@pcobooster/planning-center-models/candidate-frequency";
import {
  isNonEmptyString,
  isString,
} from "@pcobooster/planning-center-models/json";
import type {
  PCResource,
  RawSchedule,
  ScheduleFrequency,
  ServiceHistoryItem,
} from "@pcobooster/planning-center-models/types";

type HistoryTimeType = "service" | "rehearsal" | "other";

const getRelationshipIds = (
  relationship: { data?: { id: string } | { id: string }[] | null } | undefined
): string[] => {
  const data = relationship?.data;
  if (!data) {
    return [];
  }
  return Array.isArray(data) ? data.map((item) => item.id) : [data.id];
};

const classifyScheduleTimeType = (
  schedule: RawSchedule,
  historyIncluded: PCResource[]
): HistoryTimeType | undefined => {
  const planTimeIds = [
    ...getRelationshipIds(schedule.relationships?.plan_times),
    ...getRelationshipIds(schedule.relationships?.times),
  ];

  const uniquePlanTimeIds = [...new Set(planTimeIds)];
  if (uniquePlanTimeIds.length > 0) {
    const timeTypes = new Set<string>();
    for (const id of uniquePlanTimeIds) {
      const timeType = findIncluded(historyIncluded, "PlanTime", id)?.attributes
        .time_type;
      if (isString(timeType)) {
        timeTypes.add(timeType);
      }
    }

    if (timeTypes.has("service")) {
      return "service";
    }
    if (timeTypes.has("rehearsal")) {
      return "rehearsal";
    }
    if (timeTypes.has("other")) {
      return "other";
    }
  }

  const teamRel = schedule.relationships?.team?.data;
  const teamId = teamRel?.id;
  if (isNonEmptyString(teamId)) {
    const team = findIncluded(historyIncluded, "Team", teamId);
    if (team?.attributes.rehearsal_team === true) {
      return "rehearsal";
    }
  }

  return undefined;
};

const getSchedulePlanTimes = (
  schedule: RawSchedule,
  historyIncluded: PCResource[]
): PCResource[] => {
  const planTimeIds = [
    ...getRelationshipIds(schedule.relationships?.plan_times),
    ...getRelationshipIds(schedule.relationships?.times),
  ];

  const planTimes: PCResource[] = [];
  for (const id of new Set(planTimeIds)) {
    const planTime = findIncluded(historyIncluded, "PlanTime", id);
    if (planTime !== undefined) {
      planTimes.push(planTime);
    }
  }
  return planTimes;
};

/** History rows for a person's own schedules; declined schedules are left out. */
export const mapSchedulesToServiceHistory = (
  schedules: RawSchedule[],
  historyIncluded: PCResource[]
): ServiceHistoryItem[] =>
  schedules.flatMap((schedule) => {
    if (isDeclinedAssignmentStatus(schedule.attributes.status)) {
      return [];
    }

    const planRel = schedule.relationships?.plan?.data;
    const planId = planRel?.id;
    const plan = isNonEmptyString(planId)
      ? findIncluded(historyIncluded, "Plan", planId)
      : undefined;

    const fallbackSortDate =
      schedule.attributes.sort_date ?? plan?.attributes.sort_date;
    const planTimes = getSchedulePlanTimes(schedule, historyIncluded);

    const buildItem = (
      id: string,
      date: Date,
      timeType: HistoryTimeType | undefined
    ): ServiceHistoryItem => ({
      id,
      sourceScheduleId: schedule.id,
      date,
      teamPositionName: schedule.attributes.team_position_name ?? "",
      teamName: schedule.attributes.team_name ?? undefined,
      serviceTypeName: schedule.attributes.service_type_name ?? undefined,
      planTitle: isString(plan?.attributes.title)
        ? plan.attributes.title
        : undefined,
      status: schedule.attributes.status || "",
      timeType,
    });

    if (planTimes.length === 0) {
      const date = isNonEmptyString(fallbackSortDate)
        ? new Date(fallbackSortDate)
        : new Date();
      return [
        buildItem(
          schedule.id,
          date,
          classifyScheduleTimeType(schedule, historyIncluded)
        ),
      ];
    }

    const items = planTimes.map((planTime) => {
      const timeTypeRaw = planTime.attributes.time_type;
      const timeType: HistoryTimeType | undefined =
        timeTypeRaw === "service" ||
        timeTypeRaw === "rehearsal" ||
        timeTypeRaw === "other"
          ? timeTypeRaw
          : undefined;
      const dateString = planTime.attributes.starts_at ?? fallbackSortDate;
      const date = isNonEmptyString(dateString)
        ? new Date(dateString)
        : new Date();
      return buildItem(`${schedule.id}:${planTime.id}`, date, timeType);
    });

    // If all included plan times are "other", keep one fallback row so history still shows the assignment.
    const hasServiceOrRehearsal = items.some(
      (item) => item.timeType === "service" || item.timeType === "rehearsal"
    );
    if (!hasServiceOrRehearsal) {
      const date = isNonEmptyString(fallbackSortDate)
        ? new Date(fallbackSortDate)
        : new Date();
      return [
        buildItem(
          schedule.id,
          date,
          classifyScheduleTimeType(schedule, historyIncluded)
        ),
      ];
    }

    return items.filter(
      (item) => item.timeType === "service" || item.timeType === "rehearsal"
    );
  });

const limitHistory = (
  serviceHistory: ServiceHistoryItem[],
  historyLimit: number
): ServiceHistoryItem[] => {
  if (!Number.isFinite(historyLimit)) {
    return serviceHistory;
  }
  return historyLimit <= 0
    ? []
    : serviceHistory.slice(-Math.floor(historyLimit));
};

export interface HistoryBuildResult {
  serviceHistory: ServiceHistoryItem[];
  frequency: ScheduleFrequency;
}

export const buildHistoryAndFrequencyForPerson = (
  schedules: RawSchedule[],
  historyIncluded: PCResource[],
  referenceDate: Date,
  historyLimit: number,
  orgTimeZone: string
): HistoryBuildResult => {
  const { frequency, serviceHistory } = summarizeCandidateHistory(
    mapSchedulesToServiceHistory(schedules, historyIncluded),
    referenceDate,
    orgTimeZone
  );
  return {
    serviceHistory: limitHistory(serviceHistory, historyLimit),
    frequency,
  };
};
