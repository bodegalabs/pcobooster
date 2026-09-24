import { findMatchingScheduleForSelectedPosition } from "@pcobooster/api/modules/planning-center/people/matching";
import type {
  HistoryBuildResult,
  SelectedPlanMatchContext,
} from "@pcobooster/api/modules/planning-center/people/types";
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
  RawPlanPerson,
  RawPlanTime,
  RawSchedule,
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

const splitPlanPositionName = (teamPositionName: string) => {
  const teamPositionParts = teamPositionName.split(" - ");
  const teamName =
    teamPositionParts.length > 1 ? teamPositionParts[0] : undefined;
  const positionName =
    teamPositionParts.length > 1
      ? teamPositionParts.slice(1).join(" - ")
      : teamPositionParts[0];

  return { teamName, positionName };
};

const getPlanPersonHistoryContext = (
  pp: RawPlanPerson,
  historyIncluded: PCResource[]
) => {
  const planRel = pp.relationships?.plan?.data;
  const planId = planRel?.id;
  const plan = isNonEmptyString(planId)
    ? findIncluded(historyIncluded, "Plan", planId)
    : undefined;
  const serviceTypeRel = plan?.relationships?.service_type?.data;
  const serviceTypeId = Array.isArray(serviceTypeRel)
    ? serviceTypeRel[0]?.id
    : serviceTypeRel?.id;
  const serviceType = isNonEmptyString(serviceTypeId)
    ? findIncluded(historyIncluded, "ServiceType", serviceTypeId)
    : undefined;
  const serviceTypeName = isString(serviceType?.attributes.name)
    ? serviceType.attributes.name
    : undefined;

  const fallbackDate = isNonEmptyString(plan?.attributes.sort_date)
    ? new Date(plan.attributes.sort_date)
    : new Date(pp.attributes.created_at);

  const { teamName, positionName } = splitPlanPositionName(
    pp.attributes.team_position_name
  );
  const planTitle = isString(plan?.attributes.title)
    ? plan.attributes.title
    : undefined;
  return { fallbackDate, teamName, positionName, serviceTypeName, planTitle };
};

const inferAssignedTimeType = (
  rawType: string | undefined
): HistoryTimeType => {
  if (rawType === "other" || rawType === "service") {
    return rawType;
  }
  return "rehearsal";
};

/** History rows for window roster entries; declined entries are left out. */
export const mapPlanPeopleToServiceHistory = (
  planPeople: RawPlanPerson[],
  historyIncluded: PCResource[],
  planTimeById = new Map<string, RawPlanTime>()
): ServiceHistoryItem[] =>
  planPeople.flatMap((pp) => {
    if (isDeclinedAssignmentStatus(pp.attributes.status)) {
      return [];
    }

    const { fallbackDate, teamName, positionName, serviceTypeName, planTitle } =
      getPlanPersonHistoryContext(pp, historyIncluded);

    const buildItem = (
      id: string,
      date: Date,
      timeType: HistoryTimeType | undefined
    ): ServiceHistoryItem => ({
      id,
      sourceScheduleId: pp.id,
      date,
      teamPositionName: positionName || "",
      teamName,
      serviceTypeName,
      planTitle,
      status: pp.attributes.status || "",
      timeType,
    });

    const timesIds = new Set(getRelationshipIds(pp.relationships?.times));
    const serviceTimesIds = new Set(
      getRelationshipIds(pp.relationships?.service_times)
    );

    if (timesIds.size === 0 && serviceTimesIds.size === 0) {
      return [buildItem(pp.id, fallbackDate, "service")];
    }

    const serviceRows = [...serviceTimesIds].map((planTimeId) => {
      const planTime = planTimeById.get(planTimeId);
      const date = isNonEmptyString(planTime?.attributes.starts_at)
        ? new Date(planTime.attributes.starts_at)
        : fallbackDate;
      return buildItem(`${pp.id}:${planTimeId}`, date, "service");
    });

    const rehearsalCandidateIds = [...timesIds].filter(
      (id) => !serviceTimesIds.has(id)
    );
    const rehearsalRows = rehearsalCandidateIds.map((planTimeId) => {
      const planTime = planTimeById.get(planTimeId);
      const rawType = planTime?.attributes.time_type;
      const inferredType = inferAssignedTimeType(rawType);
      const date = isNonEmptyString(planTime?.attributes.starts_at)
        ? new Date(planTime.attributes.starts_at)
        : fallbackDate;
      return buildItem(`${pp.id}:${planTimeId}`, date, inferredType);
    });

    const rows = [...serviceRows, ...rehearsalRows].filter(
      (item) => item.timeType === "service" || item.timeType === "rehearsal"
    );

    return rows.length > 0 ? rows : [buildItem(pp.id, fallbackDate, "service")];
  });

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

export const buildHistoryAndFrequencyForPerson = (
  schedules: RawSchedule[],
  historyIncluded: PCResource[],
  referenceDate: Date,
  selectedMatchContext: SelectedPlanMatchContext,
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
    matchedSchedule: findMatchingScheduleForSelectedPosition(
      schedules,
      selectedMatchContext
    ),
  };
};

export const buildHistoryAndFrequencyForPlanPeople = (
  planPeople: RawPlanPerson[],
  historyIncluded: PCResource[],
  referenceDate: Date,
  selectedMatchContext: SelectedPlanMatchContext,
  planTimeById: Map<string, RawPlanTime>,
  historyLimit: number,
  orgTimeZone: string
): HistoryBuildResult => {
  const { frequency, serviceHistory } = summarizeCandidateHistory(
    mapPlanPeopleToServiceHistory(planPeople, historyIncluded, planTimeById),
    referenceDate,
    orgTimeZone
  );
  return {
    serviceHistory: limitHistory(serviceHistory, historyLimit),
    frequency,
    matchedSchedule: findMatchingScheduleForSelectedPosition(
      planPeople,
      selectedMatchContext
    ),
  };
};
