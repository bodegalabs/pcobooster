import {
  buildHistoryAndFrequencyForPlanPeople,
  buildHistoryAndFrequencyForPerson,
} from "@pcobooster/api/modules/planning-center/people/history";
import {
  applySelectedPlanStatus,
  findMatchingScheduleForSelectedPosition,
  getSelectedPlanAssignmentLabels,
} from "@pcobooster/api/modules/planning-center/people/matching";
import {
  planPersonResourceSchema,
  planTimeResourceSchema,
  scheduleResourceSchema,
} from "@pcobooster/api/modules/planning-center/people/resource-schemas";
import {
  applySelectedPlanRosterStatus,
  getSelectedPlanRosterOverlay,
  mergeAssignedAndSelectedPlanSlotPeople,
  mergeAssignmentLabels,
} from "@pcobooster/api/modules/planning-center/people/roster-overlay";
import {
  scoreAndNormalizePeople,
  sortPeopleForSelection,
} from "@pcobooster/api/modules/planning-center/people/scoring";
import {
  applyAvailability,
  buildSelectedPlanMatchContext,
  createBasePerson,
  getAssignedPeopleFromAssignments,
  getDefaultFrequency,
  loadPersonBlockouts,
} from "@pcobooster/api/modules/planning-center/people/transforms";
import type { SelectedPlanMatchContext } from "@pcobooster/api/modules/planning-center/people/types";
import {
  buildPlanSchedulingContext,
  emptyPlanSchedulingContext,
  getPlanSchedulingContext,
} from "@pcobooster/api/modules/planning-center/plan-scheduling-context";
import type { PlanSchedulingContext } from "@pcobooster/api/modules/planning-center/plan-scheduling-context";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import { recoverUnlessInterrupted } from "@pcobooster/api/planning-center/recover-unless-interrupted";
import { cachedRead } from "@pcobooster/api/planning-center/services/cached-read";
import type { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import type { PlanningCenterPlansService } from "@pcobooster/api/planning-center/services/plans-service";
import { PlanningCenterReadCache } from "@pcobooster/api/planning-center/services/read-cache";
import {
  addCalendarDaysToDayKey,
  formatCalendarDayInTimeZone,
} from "@pcobooster/planning-center-models/calendar";
import {
  isNonEmptyString,
  isNumber,
} from "@pcobooster/planning-center-models/json";
import { PLAN_HISTORY_HALF_RANGE_DAYS } from "@pcobooster/planning-center-models/schedule-constants";
import type {
  PCResource,
  PersonWithAvailability,
  RawPerson,
  RawPlanPerson,
  RawPlanTime,
  RawSchedule,
  ScheduleFrequency,
  ServiceHistoryItem,
} from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

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

export interface PeopleForPositionDependencies {
  catalog: Pick<PlanningCenterCatalogService, "getServiceTypesCached">;
  people: Pick<
    PlanningCenterPeopleService,
    | "getCacheScope"
    | "getPeopleForTeamPosition"
    | "getPersonBlockouts"
    | "getPersonBlockoutDates"
    | "getPersonSchedules"
    | "getPlanTeamMembers"
  >;
  plans: Pick<PlanningCenterPlansService, "getPlansWithIncludedInDateRange">;
  resolveTimeZone: Effect.Effect<string>;
}

/** A roster we cannot read leaves the selected plan without roster context. */
const getSelectedPlanSchedulingContext = ({
  serviceTypeId,
  planId,
  sharedPlanWindowHistory,
  peopleService,
}: {
  serviceTypeId: string;
  planId?: string;
  sharedPlanWindowHistory: SharedPlanWindowHistorySnapshot | null;
  peopleService: PeopleForPositionDependencies["people"];
}): Effect.Effect<PlanSchedulingContext> => {
  if (!isNonEmptyString(planId)) {
    return Effect.succeed(emptyPlanSchedulingContext(serviceTypeId, ""));
  }

  if (
    sharedPlanWindowHistory !== null &&
    sharedPlanWindowHistory.planMembersByPlanId.has(planId)
  ) {
    return Effect.succeed(
      buildPlanSchedulingContext({
        serviceTypeId,
        planId,
        planTeamMembers:
          sharedPlanWindowHistory.planMembersByPlanId.get(planId) ?? [],
        included: sharedPlanWindowHistory.includedByPlanId.get(planId) ?? [],
      })
    );
  }

  return getPlanSchedulingContext(
    { serviceTypeId, planId },
    peopleService
  ).pipe(
    recoverUnlessInterrupted(() =>
      emptyPlanSchedulingContext(serviceTypeId, planId)
    )
  );
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

const getActiveServiceTypes = (
  catalog: PeopleForPositionDependencies["catalog"]
): Effect.Effect<PCResource[], PlanningCenterError> =>
  Effect.map(catalog.getServiceTypesCached(), (serviceTypes) =>
    serviceTypes.filter(
      (resource) => !isNonEmptyString(resource.attributes.archived_at)
    )
  );

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

const getCandidateHistorySnapshot = (
  personId: string,
  referenceDate: Date,
  orgTimeZone: string,
  peopleService: PeopleForPositionDependencies["people"]
): Effect.Effect<CandidateHistorySnapshot, PlanningCenterError> => {
  const refDayKey = formatCalendarDayInTimeZone(referenceDate, orgTimeZone);
  const cacheKey = [
    peopleService.getCacheScope(),
    "candidate-history",
    encodeURIComponent(personId),
    encodeURIComponent(orgTimeZone),
    refDayKey,
  ].join(":");

  const load = () =>
    Effect.map(
      peopleService.getPersonSchedules(
        personId,
        { order: "-starts_at" },
        CANDIDATE_HISTORY_MAX_PAGES
      ),
      (scheduleResponse): CandidateHistorySnapshot => {
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
  return cachedRead(
    candidateHistoryCache,
    cacheKey,
    CANDIDATE_HISTORY_CACHE_TTL_MS,
    load
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

interface LoadedPlan {
  included: PCResource[];
  planId: string;
  planMembers: RawPlanPerson[];
  planTimes: RawPlanTime[];
}

const loadPlanWindowMembers = (
  {
    included,
    plan,
    serviceTypeId,
  }: { included: PCResource[]; plan: PCResource; serviceTypeId: string },
  people: PeopleForPositionDependencies["people"]
): Effect.Effect<LoadedPlan, PlanningCenterError> => {
  const planTimes = getIncludedPlanTimesForPlan(plan, included);
  const planPeopleCount = isNumber(plan.attributes.plan_people_count)
    ? plan.attributes.plan_people_count
    : null;
  const teamMembers =
    planPeopleCount === 0
      ? Effect.succeed({ data: [], included: [] })
      : people.getPlanTeamMembers(serviceTypeId, plan.id);
  return teamMembers.pipe(
    Effect.map((teamMembersResponse) => ({
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
    }))
  );
};

const buildSharedPlanWindowHistory = (
  activeServiceTypes: PCResource[],
  loadedPlans: LoadedPlan[]
): SharedPlanWindowHistorySnapshot => {
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
};

const getSharedPlanWindowHistorySnapshot = (
  serviceTypeId: string,
  referenceDate: Date,
  orgTimeZone: string,
  dependencies: PeopleForPositionDependencies
): Effect.Effect<SharedPlanWindowHistorySnapshot, PlanningCenterError> => {
  const refDayKey = formatCalendarDayInTimeZone(referenceDate, orgTimeZone);
  const cacheKey = [
    dependencies.people.getCacheScope(),
    "plan-window-history",
    encodeURIComponent(serviceTypeId),
    encodeURIComponent(orgTimeZone),
    refDayKey,
  ].join(":");

  const load = Effect.gen(function* loadPlanWindowHistory() {
    const activeServiceTypes = yield* getActiveServiceTypes(
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
    const plansByServiceType = yield* Effect.forEach(
      activeServiceTypes,
      (serviceType) =>
        Effect.map(
          dependencies.plans.getPlansWithIncludedInDateRange(
            serviceType.id,
            afterDayKey,
            beforeDayKey,
            "plan_times",
            orgTimeZone
          ),
          (response) => ({
            included: response.included,
            plans: response.data,
            serviceTypeId: serviceType.id,
          })
        ),
      { concurrency: SERVICE_TYPE_HISTORY_CONCURRENCY }
    );
    const loadedPlans = yield* Effect.forEach(
      plansByServiceType.flatMap(
        ({ included, plans, serviceTypeId: currentServiceTypeId }) =>
          plans.map((plan) => ({
            included,
            plan,
            serviceTypeId: currentServiceTypeId,
          }))
      ),
      (planToLoad) => loadPlanWindowMembers(planToLoad, dependencies.people),
      { concurrency: PLAN_HISTORY_CONCURRENCY }
    );

    return buildSharedPlanWindowHistory(activeServiceTypes, loadedPlans);
  });

  return cachedRead(
    planWindowHistoryCache,
    cacheKey,
    PLAN_WINDOW_HISTORY_CACHE_TTL_MS,
    () => load
  );
};

interface CandidateHydration {
  readonly dependencies: PeopleForPositionDependencies;
  readonly orgTimeZone: string;
  readonly planSchedulingContext: PlanSchedulingContext;
  readonly planSortAt: Date | null;
  readonly referenceDate: Date;
  readonly selectedMatchContext: SelectedPlanMatchContext;
  readonly sharedPlanWindowHistory: SharedPlanWindowHistorySnapshot | null;
}

/** Candidate history is best effort; without it the person keeps default scores. */
const hydrateCandidate = (
  rawPerson: RawPerson,
  {
    dependencies,
    orgTimeZone,
    planSchedulingContext,
    planSortAt,
    referenceDate,
    selectedMatchContext,
    sharedPlanWindowHistory,
  }: CandidateHydration
): Effect.Effect<PersonWithAvailability> => {
  const person = createBasePerson(rawPerson);
  const rosterOverlay = getSelectedPlanRosterOverlay(
    planSchedulingContext,
    rawPerson.id,
    selectedMatchContext
  );
  const historySnapshot =
    sharedPlanWindowHistory !== null &&
    sharedPlanWindowHistory.planMembersByPlanId.size > 0
      ? Effect.succeed(
          getCandidateHistorySnapshotFromSharedPlanWindow(
            rawPerson.id,
            referenceDate,
            orgTimeZone,
            sharedPlanWindowHistory
          )
        )
      : getCandidateHistorySnapshot(
          rawPerson.id,
          referenceDate,
          orgTimeZone,
          dependencies.people
        );
  const applyHistory = historySnapshot.pipe(
    Effect.map((snapshot) => {
      person.frequency = snapshot.frequency;
      person.serviceHistory = snapshot.serviceHistory;
      const scheduleLabels = getSelectedPlanAssignmentLabels(
        snapshot.assignments,
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
            snapshot.assignments,
            selectedMatchContext
          ),
          combinedLabels
        );
      }
      return person;
    }),
    recoverUnlessInterrupted(() => {
      person.frequency = getDefaultFrequency();
      person.serviceHistory = [];
      applySelectedPlanRosterStatus(person, rosterOverlay);
      return person;
    })
  );

  return Effect.all(
    [
      applyHistory,
      loadPersonBlockouts(rawPerson.id, planSortAt, dependencies.people),
    ],
    { concurrency: "unbounded" }
  ).pipe(
    Effect.map(([hydratedPerson, blockouts]) => {
      applyAvailability(hydratedPerson, blockouts, planSortAt);
      return hydratedPerson;
    })
  );
};

export const getPeopleForPosition = (
  { serviceTypeId, positionId, teamId, planId, date }: Params,
  dependencies: PeopleForPositionDependencies
): Effect.Effect<PersonWithAvailability[], PlanningCenterError> =>
  Effect.gen(function* readPeopleForPosition() {
    const planSortAt =
      isNonEmptyString(date) && !Number.isNaN(new Date(date).getTime())
        ? new Date(date)
        : null;
    const referenceDate = planSortAt ?? new Date();
    const resolveTimeZone = yield* Effect.cached(dependencies.resolveTimeZone);
    const loadSharedHistory: Effect.Effect<SharedPlanWindowHistorySnapshot | null> =
      planSortAt === null
        ? Effect.succeed(null)
        : resolveTimeZone.pipe(
            Effect.flatMap((orgTimeZone) =>
              getSharedPlanWindowHistorySnapshot(
                serviceTypeId,
                referenceDate,
                orgTimeZone,
                dependencies
              )
            ),
            recoverUnlessInterrupted(() => null)
          );

    const [orgTimeZone, assignmentsResponse, sharedPlanWindowHistory] =
      yield* Effect.all(
        [
          resolveTimeZone,
          dependencies.people.getPeopleForTeamPosition(
            serviceTypeId,
            positionId
          ),
          loadSharedHistory,
        ],
        { concurrency: "unbounded" }
      );
    const planSchedulingContext = yield* getSelectedPlanSchedulingContext({
      serviceTypeId,
      planId,
      sharedPlanWindowHistory,
      peopleService: dependencies.people,
    });

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
    const peopleWithData = yield* Effect.forEach(
      activePeople,
      (rawPerson) =>
        hydrateCandidate(rawPerson, {
          dependencies,
          orgTimeZone,
          planSchedulingContext,
          planSortAt,
          referenceDate,
          selectedMatchContext,
          sharedPlanWindowHistory,
        }),
      { concurrency: PEOPLE_HYDRATION_CONCURRENCY }
    );

    scoreAndNormalizePeople(peopleWithData, referenceDate, orgTimeZone);
    sortPeopleForSelection(peopleWithData);
    return peopleWithData;
  });

export const warmPeopleHistoryForPlan = (
  {
    serviceTypeId,
    date,
  }: {
    serviceTypeId: string;
    date: string;
  },
  dependencies: PeopleForPositionDependencies
): Effect.Effect<void, PlanningCenterError> =>
  Effect.gen(function* warmPlanHistory() {
    const referenceDate = new Date(date);
    if (Number.isNaN(referenceDate.getTime())) {
      return;
    }

    const orgTimeZone = yield* dependencies.resolveTimeZone;
    yield* getSharedPlanWindowHistorySnapshot(
      serviceTypeId,
      referenceDate,
      orgTimeZone,
      dependencies
    );
  });

export const invalidateCandidateHistoryForPerson = (
  personId: string,
  cacheScope: string
) => {
  const prefix = [
    cacheScope,
    "candidate-history",
    encodeURIComponent(personId),
    "",
  ].join(":");

  candidateHistoryCache.deleteWhere((key) => key.startsWith(prefix));
  const planWindowPrefix = [cacheScope, "plan-window-history"].join(":");
  planWindowHistoryCache.deleteWhere((key) => key.startsWith(planWindowPrefix));
};

export const invalidatePlanWindowHistory = (cacheScope: string) => {
  const planWindowPrefix = [cacheScope, "plan-window-history"].join(":");
  planWindowHistoryCache.deleteWhere((key) => key.startsWith(planWindowPrefix));
};
