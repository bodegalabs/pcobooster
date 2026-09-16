import { isNonEmptyString, isNumber } from "@/lib/json";
import {
  addCalendarDaysToDayKey,
  formatCalendarDayInTimeZone,
} from "@/lib/planning-center/org-calendar";
import { resolveOrganizationTimeZone } from "@/lib/planning-center/resolve-organization-timezone";
import { PLAN_HISTORY_HALF_RANGE_DAYS } from "@/lib/planning-center/schedule-load-constants";
import { planningCenterCatalogService } from "@/lib/planning-center/services/catalog-service";
import { planningCenterPeopleService } from "@/lib/planning-center/services/people-service";
import { planningCenterPlansService } from "@/lib/planning-center/services/plans-service";
import { PlanningCenterReadCache } from "@/lib/planning-center/services/read-cache";
import type {
  PCResource,
  PersonWithAvailability,
  RawPlanPerson,
  RawPlanTime,
  RawSchedule,
  ScheduleFrequency,
  ServiceHistoryItem,
} from "@/lib/types";
import {
  buildHistoryAndFrequencyForPlanPeople,
  buildHistoryAndFrequencyForPerson,
} from "@/lib/use-cases/planning-center/people/history";
import {
  applySelectedPlanStatus,
  findMatchingScheduleForSelectedPosition,
  getSelectedPlanAssignmentLabels,
} from "@/lib/use-cases/planning-center/people/matching";
import {
  planPersonResourceSchema,
  planTimeResourceSchema,
  scheduleResourceSchema,
} from "@/lib/use-cases/planning-center/people/resource-schemas";
import {
  applySelectedPlanRosterStatus,
  getSelectedPlanRosterOverlay,
  mergeAssignedAndSelectedPlanSlotPeople,
  mergeAssignmentLabels,
} from "@/lib/use-cases/planning-center/people/roster-overlay";
import {
  scoreAndNormalizePeople,
  sortPeopleForSelection,
} from "@/lib/use-cases/planning-center/people/scoring";
import {
  applyAvailability,
  buildBlockoutsPromise,
  buildSelectedPlanMatchContext,
  createBasePerson,
  getAssignedPeopleFromAssignments,
  getDefaultFrequency,
} from "@/lib/use-cases/planning-center/people/transforms";
import {
  buildPlanSchedulingContext,
  emptyPlanSchedulingContext,
  getPlanSchedulingContext,
} from "@/lib/use-cases/planning-center/plan-scheduling-context";
import type { PlanSchedulingContext } from "@/lib/use-cases/planning-center/plan-scheduling-context";
import { mapWithConcurrency } from "@/lib/use-cases/planning-center/shared";

/**
 * These are outbound Planning Center read requests. Keep them well below the 100 rps API window,
 * but high enough that independent plan/person reads do not serialize the page load.
 */
const PEOPLE_HYDRATION_CONCURRENCY = 8;
const SERVICE_TYPE_HISTORY_CONCURRENCY = 6;
const PLAN_HISTORY_CONCURRENCY = 8;
const CANDIDATE_HISTORY_CACHE_TTL_MS = 60 * 1000;
const PLAN_WINDOW_HISTORY_CACHE_TTL_MS = 60 * 1000;
/**
 * Candidate history needs enough headroom for dense upcoming schedules; otherwise recent past
 * services can fall out of the fetched pages before the local ±21 day window is applied.
 */
const CANDIDATE_HISTORY_MAX_PAGES = 5;
const candidateHistoryCache =
  new PlanningCenterReadCache<CandidateHistorySnapshot>();
const planWindowHistoryCache =
  new PlanningCenterReadCache<SharedPlanWindowHistorySnapshot>();

type CandidateAssignment = RawPlanPerson | RawSchedule;

interface CandidateHistorySnapshot {
  assignments: CandidateAssignment[];
  frequency: ScheduleFrequency;
  serviceHistory: ServiceHistoryItem[];
}

interface SharedPlanWindowHistorySnapshot {
  historyIncluded: PCResource[];
  includedByPlanId: Map<string, PCResource[]>;
  personAssignments: Map<string, RawPlanPerson[]>;
  planMembersByPlanId: Map<string, RawPlanPerson[]>;
  planTimeById: Map<string, RawPlanTime>;
}

interface Params {
  serviceTypeId: string;
  positionId: string;
  teamId?: string;
  planId?: string;
  date?: string;
}

interface PeopleForPositionDependencies {
  catalog: Pick<typeof planningCenterCatalogService, "getServiceTypesCached">;
  people: Pick<
    typeof planningCenterPeopleService,
    | "getCacheScope"
    | "getPeopleForTeamPosition"
    | "getPersonBlockouts"
    | "getPersonBlockoutDates"
    | "getPersonSchedules"
    | "getPlanTeamMembers"
  >;
  plans: Pick<
    typeof planningCenterPlansService,
    "getPlansWithIncludedInDateRange"
  >;
  resolveTimeZone: typeof resolveOrganizationTimeZone;
}

const defaultDependencies: PeopleForPositionDependencies = {
  catalog: planningCenterCatalogService,
  people: planningCenterPeopleService,
  plans: planningCenterPlansService,
  resolveTimeZone: resolveOrganizationTimeZone,
};

const getSelectedPlanSchedulingContext = async ({
  serviceTypeId,
  planId,
  sharedPlanWindowHistory,
  peopleService,
}: {
  serviceTypeId: string;
  planId?: string;
  sharedPlanWindowHistory: SharedPlanWindowHistorySnapshot | null;
  peopleService: PeopleForPositionDependencies["people"];
}): Promise<PlanSchedulingContext> => {
  if (!isNonEmptyString(planId)) {
    return emptyPlanSchedulingContext(serviceTypeId, "");
  }

  if (
    sharedPlanWindowHistory !== null &&
    sharedPlanWindowHistory.planMembersByPlanId.has(planId)
  ) {
    return buildPlanSchedulingContext({
      serviceTypeId,
      planId,
      planTeamMembers:
        sharedPlanWindowHistory.planMembersByPlanId.get(planId) ?? [],
      included: sharedPlanWindowHistory.includedByPlanId.get(planId) ?? [],
    });
  }

  try {
    return await getPlanSchedulingContext(
      { serviceTypeId, planId },
      peopleService
    );
  } catch {
    return emptyPlanSchedulingContext(serviceTypeId, planId);
  }
};

const getIncludedPlanTimesForPlan = (
  plan: PCResource,
  included: PCResource[]
): RawPlanTime[] => {
  const relationshipData = plan.relationships?.plan_times?.data;
  const relationshipIds = new Set<string>();
  if (Array.isArray(relationshipData)) {
    for (const related of relationshipData) {
      relationshipIds.add(related.id);
    }
  } else if (relationshipData !== undefined && relationshipData !== null) {
    relationshipIds.add(relationshipData.id);
  }

  const planTimes: RawPlanTime[] = [];
  for (const resource of included) {
    const parsed = planTimeResourceSchema.safeParse(resource);
    if (!parsed.success) {
      continue;
    }
    if (relationshipIds.size > 0) {
      if (relationshipIds.has(parsed.data.id)) {
        planTimes.push(parsed.data);
      }
      continue;
    }
    const planRel = resource.relationships?.plan?.data;
    const planId = Array.isArray(planRel) ? planRel[0]?.id : planRel?.id;
    if (planId === plan.id) {
      planTimes.push(parsed.data);
    }
  }
  return planTimes;
};

const getActiveServiceTypes = async (
  catalog: PeopleForPositionDependencies["catalog"]
): Promise<PCResource[]> => {
  const serviceTypes = await catalog.getServiceTypesCached();
  return serviceTypes.filter(
    (resource) => !isNonEmptyString(resource.attributes.archived_at)
  );
};

const getCandidateHistorySnapshotFromSharedPlanWindow = (
  personId: string,
  referenceDate: Date,
  orgTimeZone: string,
  sharedPlanWindowHistory: SharedPlanWindowHistorySnapshot
): CandidateHistorySnapshot => {
  const assignments =
    sharedPlanWindowHistory.personAssignments.get(personId) ?? [];
  const historyResult = buildHistoryAndFrequencyForPlanPeople(
    assignments,
    sharedPlanWindowHistory.historyIncluded,
    referenceDate,
    {},
    sharedPlanWindowHistory.planTimeById,
    Number.POSITIVE_INFINITY,
    orgTimeZone
  );

  return {
    assignments,
    frequency: historyResult.frequency,
    serviceHistory: historyResult.serviceHistory,
  };
};

const getCandidateHistorySnapshot = async (
  personId: string,
  referenceDate: Date,
  orgTimeZone: string,
  peopleService: PeopleForPositionDependencies["people"]
): Promise<CandidateHistorySnapshot> => {
  const refDayKey = formatCalendarDayInTimeZone(referenceDate, orgTimeZone);
  const cacheKey = [
    peopleService.getCacheScope(),
    "candidate-history",
    encodeURIComponent(personId),
    encodeURIComponent(orgTimeZone),
    refDayKey,
  ].join(":");

  return await candidateHistoryCache.get(
    cacheKey,
    CANDIDATE_HISTORY_CACHE_TTL_MS,
    async () => {
      const scheduleResponse = await peopleService.getPersonSchedules(
        personId,
        { order: "-starts_at" },
        CANDIDATE_HISTORY_MAX_PAGES
      );
      const schedules: RawSchedule[] = [];
      for (const resource of scheduleResponse.data) {
        const parsed = scheduleResourceSchema.safeParse(resource);
        if (parsed.success) {
          schedules.push(parsed.data);
        }
      }
      const historyResult = buildHistoryAndFrequencyForPerson(
        schedules,
        scheduleResponse.included ?? [],
        referenceDate,
        {},
        Number.POSITIVE_INFINITY,
        orgTimeZone
      );

      return {
        assignments: schedules,
        frequency: historyResult.frequency,
        serviceHistory: historyResult.serviceHistory,
      };
    }
  );
};

const appendIncludedResources = (
  target: PCResource[],
  additions: PCResource[]
) => {
  const seen = new Set(
    target.map((resource) => `${resource.type}:${resource.id}`)
  );

  for (const resource of additions) {
    const key = `${resource.type}:${resource.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    target.push(resource);
  }
};

const mergeIncludedResources = (
  base: PCResource[],
  additions: PCResource[]
): PCResource[] => {
  const merged = [...base];
  appendIncludedResources(merged, additions);
  return merged;
};

const getSharedPlanWindowHistorySnapshot = async (
  serviceTypeId: string,
  referenceDate: Date,
  orgTimeZone: string,
  dependencies: PeopleForPositionDependencies
): Promise<SharedPlanWindowHistorySnapshot> => {
  const refDayKey = formatCalendarDayInTimeZone(referenceDate, orgTimeZone);
  const cacheKey = [
    dependencies.people.getCacheScope(),
    "plan-window-history",
    encodeURIComponent(serviceTypeId),
    encodeURIComponent(orgTimeZone),
    refDayKey,
  ].join(":");

  return await planWindowHistoryCache.get(
    cacheKey,
    PLAN_WINDOW_HISTORY_CACHE_TTL_MS,
    async () => {
      const activeServiceTypes = await getActiveServiceTypes(
        dependencies.catalog
      );
      const afterDayKey = addCalendarDaysToDayKey(
        refDayKey,
        -PLAN_HISTORY_HALF_RANGE_DAYS,
        orgTimeZone
      );
      const beforeDayKey = addCalendarDaysToDayKey(
        refDayKey,
        PLAN_HISTORY_HALF_RANGE_DAYS,
        orgTimeZone
      );
      const plansByServiceType = await mapWithConcurrency(
        activeServiceTypes,
        SERVICE_TYPE_HISTORY_CONCURRENCY,
        async (serviceType) => {
          const response =
            await dependencies.plans.getPlansWithIncludedInDateRange(
              serviceType.id,
              afterDayKey,
              beforeDayKey,
              "plan_times"
            );

          return {
            included: response.included,
            plans: response.data,
            serviceTypeId: serviceType.id,
          };
        }
      );
      const loadedPlans = await mapWithConcurrency(
        plansByServiceType.flatMap(
          ({ included, plans, serviceTypeId: currentServiceTypeId }) =>
            plans.map((plan) => ({
              included,
              plan,
              serviceTypeId: currentServiceTypeId,
            }))
        ),
        PLAN_HISTORY_CONCURRENCY,
        async ({ included, plan, serviceTypeId: currentServiceTypeId }) => {
          const planTimes = getIncludedPlanTimesForPlan(plan, included);
          const planPeopleCount = isNumber(plan.attributes.plan_people_count)
            ? plan.attributes.plan_people_count
            : null;
          const teamMembersResponse =
            planPeopleCount === 0
              ? { data: [], included: [] }
              : await dependencies.people.getPlanTeamMembers(
                  currentServiceTypeId,
                  plan.id
                );

          return {
            included: mergeIncludedResources(
              teamMembersResponse.included ?? [],
              planTimes
            ),
            planId: plan.id,
            planMembers: teamMembersResponse.data.flatMap((resource) => {
              const parsed = planPersonResourceSchema.safeParse(resource);
              return parsed.success ? [parsed.data] : [];
            }),
            planTimes,
            serviceTypeId: currentServiceTypeId,
          };
        }
      );

      const historyIncluded: PCResource[] = [];
      const includedByPlanId = new Map<string, PCResource[]>();
      const personAssignments = new Map<string, RawPlanPerson[]>();
      const planMembersByPlanId = new Map<string, RawPlanPerson[]>();
      const planTimeById = new Map<string, RawPlanTime>();
      appendIncludedResources(historyIncluded, activeServiceTypes);

      for (const loadedPlan of loadedPlans) {
        includedByPlanId.set(loadedPlan.planId, loadedPlan.included);
        planMembersByPlanId.set(loadedPlan.planId, loadedPlan.planMembers);
        appendIncludedResources(historyIncluded, loadedPlan.included);

        for (const planTime of loadedPlan.planTimes) {
          planTimeById.set(planTime.id, planTime);
        }

        for (const planMember of loadedPlan.planMembers) {
          const personId = planMember.relationships?.person?.data?.id;
          if (!isNonEmptyString(personId)) {
            continue;
          }

          const assignments = personAssignments.get(personId) ?? [];
          assignments.push(planMember);
          personAssignments.set(personId, assignments);
        }
      }

      return {
        historyIncluded,
        includedByPlanId,
        personAssignments,
        planMembersByPlanId,
        planTimeById,
      };
    }
  );
};

export const getPeopleForPosition = async (
  { serviceTypeId, positionId, teamId, planId, date }: Params,
  dependencies: PeopleForPositionDependencies = defaultDependencies
): Promise<PersonWithAvailability[]> => {
  const planSortAt =
    isNonEmptyString(date) && !Number.isNaN(new Date(date).getTime())
      ? new Date(date)
      : null;
  const referenceDate = planSortAt ?? new Date();
  const orgTimeZonePromise = dependencies.resolveTimeZone();
  const loadSharedHistory =
    async (): Promise<SharedPlanWindowHistorySnapshot | null> => {
      if (planSortAt === null) {
        return null;
      }
      try {
        const orgTimeZone = await orgTimeZonePromise;
        return await getSharedPlanWindowHistorySnapshot(
          serviceTypeId,
          referenceDate,
          orgTimeZone,
          dependencies
        );
      } catch {
        return null;
      }
    };
  const sharedPlanWindowHistoryPromise = loadSharedHistory();

  const [orgTimeZone, assignmentsResponse, sharedPlanWindowHistory] =
    await Promise.all([
      orgTimeZonePromise,
      dependencies.people.getPeopleForTeamPosition(serviceTypeId, positionId),
      sharedPlanWindowHistoryPromise,
    ]);
  const planSchedulingContext = await getSelectedPlanSchedulingContext({
    serviceTypeId,
    planId,
    sharedPlanWindowHistory,
    peopleService: dependencies.people,
  });
  const canUseSharedPlanWindowHistory =
    sharedPlanWindowHistory !== null &&
    sharedPlanWindowHistory.planMembersByPlanId.size > 0;

  const { data: assignmentsData, included: assignmentsIncluded } =
    assignmentsResponse;

  const assignedPeople = getAssignedPeopleFromAssignments(
    assignmentsData,
    assignmentsIncluded
  );
  const selectedMatchContext = buildSelectedPlanMatchContext(
    assignmentsIncluded,
    positionId,
    teamId,
    planId
  );
  const activePeople = mergeAssignedAndSelectedPlanSlotPeople({
    assignedPeople,
    planSchedulingContext,
    selectedMatchContext,
  }).filter((person) => !isNonEmptyString(person.attributes.archived_at));
  const peopleWithData = await mapWithConcurrency(
    activePeople,
    PEOPLE_HYDRATION_CONCURRENCY,
    async (rawPerson): Promise<PersonWithAvailability> => {
      const person = createBasePerson(rawPerson);
      const blockoutsPromise = buildBlockoutsPromise(
        rawPerson.id,
        planSortAt,
        dependencies.people
      );
      const rosterOverlay = getSelectedPlanRosterOverlay(
        planSchedulingContext,
        rawPerson.id,
        selectedMatchContext
      );

      try {
        const historySnapshot = canUseSharedPlanWindowHistory
          ? getCandidateHistorySnapshotFromSharedPlanWindow(
              rawPerson.id,
              referenceDate,
              orgTimeZone,
              sharedPlanWindowHistory
            )
          : await getCandidateHistorySnapshot(
              rawPerson.id,
              referenceDate,
              orgTimeZone,
              dependencies.people
            );

        person.frequency = historySnapshot.frequency;
        person.serviceHistory = historySnapshot.serviceHistory;
        const scheduleLabels = getSelectedPlanAssignmentLabels(
          historySnapshot.assignments,
          selectedMatchContext
        );
        const combinedLabels = mergeAssignmentLabels(
          rosterOverlay.assignmentLabels,
          scheduleLabels
        );

        if (rosterOverlay.selectedSlotEntry) {
          applySelectedPlanRosterStatus(person, rosterOverlay, combinedLabels);
        } else {
          applySelectedPlanStatus(
            person,
            findMatchingScheduleForSelectedPosition(
              historySnapshot.assignments,
              selectedMatchContext
            ),
            combinedLabels
          );
        }
      } catch {
        person.frequency = getDefaultFrequency();
        person.serviceHistory = [];
        applySelectedPlanRosterStatus(person, rosterOverlay);
      }

      const blockouts = await blockoutsPromise;
      applyAvailability(person, blockouts, planSortAt);

      return person;
    }
  );

  scoreAndNormalizePeople(peopleWithData, referenceDate, orgTimeZone);
  sortPeopleForSelection(peopleWithData);
  return peopleWithData;
};

export const warmPeopleHistoryForPlan = async (
  {
    serviceTypeId,
    date,
  }: {
    serviceTypeId: string;
    date: string;
  },
  dependencies: PeopleForPositionDependencies = defaultDependencies
): Promise<void> => {
  const referenceDate = new Date(date);
  if (Number.isNaN(referenceDate.getTime())) {
    return;
  }

  const orgTimeZone = await dependencies.resolveTimeZone();
  await getSharedPlanWindowHistorySnapshot(
    serviceTypeId,
    referenceDate,
    orgTimeZone,
    dependencies
  );
};

export const invalidateCandidateHistoryForPerson = (personId: string) => {
  const scope = planningCenterPeopleService.getCacheScope();
  const prefix = [
    scope,
    "candidate-history",
    encodeURIComponent(personId),
    "",
  ].join(":");

  candidateHistoryCache.deleteWhere((key) => key.startsWith(prefix));
  const planWindowPrefix = [scope, "plan-window-history"].join(":");
  planWindowHistoryCache.deleteWhere((key) => key.startsWith(planWindowPrefix));
};

export const invalidatePlanWindowHistory = () => {
  const scope = planningCenterPeopleService.getCacheScope();
  const planWindowPrefix = [scope, "plan-window-history"].join(":");
  planWindowHistoryCache.deleteWhere((key) => key.startsWith(planWindowPrefix));
};
