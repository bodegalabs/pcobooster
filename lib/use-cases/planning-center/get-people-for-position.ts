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
import {
  type PCResource,
  type PersonWithAvailability,
  type RawPlanPerson,
  type RawPlanTime,
  type RawSchedule,
  type ScheduleFrequency,
  type ServiceHistoryItem,
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
  type PlanSchedulingContext,
} from "@/lib/use-cases/planning-center/plan-scheduling-context";
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
const candidateHistoryCache = new PlanningCenterReadCache();
const planWindowHistoryCache = new PlanningCenterReadCache();

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

export async function getPeopleForPosition({
  serviceTypeId,
  positionId,
  teamId,
  planId,
  date,
}: Params): Promise<PersonWithAvailability[]> {
  const planSortAt =
    date && !Number.isNaN(new Date(date).getTime()) ? new Date(date) : null;
  const referenceDate = planSortAt ?? new Date();
  const orgTimeZonePromise = resolveOrganizationTimeZone();
  const sharedPlanWindowHistoryPromise = planSortAt
    ? orgTimeZonePromise
        .then((orgTimeZone) =>
          getSharedPlanWindowHistorySnapshot(
            serviceTypeId,
            referenceDate,
            orgTimeZone
          )
        )
        .catch(() => null)
    : Promise.resolve(null);

  const [orgTimeZone, assignmentsResponse, sharedPlanWindowHistory] =
    await Promise.all([
      orgTimeZonePromise,
      planningCenterPeopleService.getPeopleForTeamPosition(
        serviceTypeId,
        positionId
      ),
      sharedPlanWindowHistoryPromise,
    ]);
  const planSchedulingContext = await getSelectedPlanSchedulingContext({
    serviceTypeId,
    planId,
    sharedPlanWindowHistory,
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
  }).filter((person) => !person.attributes.archived_at);
  const peopleWithData = await mapWithConcurrency(
    activePeople,
    PEOPLE_HYDRATION_CONCURRENCY,
    async (rawPerson): Promise<PersonWithAvailability> => {
      const person = createBasePerson(rawPerson);
      const blockoutsPromise = buildBlockoutsPromise(rawPerson.id, planSortAt);
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
              orgTimeZone
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
}

export async function warmPeopleHistoryForPlan({
  serviceTypeId,
  date,
}: {
  serviceTypeId: string;
  date: string;
}): Promise<void> {
  const referenceDate = new Date(date);
  if (Number.isNaN(referenceDate.getTime())) {
    return;
  }

  const orgTimeZone = await resolveOrganizationTimeZone();
  await getSharedPlanWindowHistorySnapshot(
    serviceTypeId,
    referenceDate,
    orgTimeZone
  );
}

async function getSelectedPlanSchedulingContext({
  serviceTypeId,
  planId,
  sharedPlanWindowHistory,
}: {
  serviceTypeId: string;
  planId?: string;
  sharedPlanWindowHistory: SharedPlanWindowHistorySnapshot | null;
}): Promise<PlanSchedulingContext> {
  if (!planId) {
    return emptyPlanSchedulingContext(serviceTypeId, "");
  }

  if (sharedPlanWindowHistory?.planMembersByPlanId.has(planId)) {
    return buildPlanSchedulingContext({
      serviceTypeId,
      planId,
      planTeamMembers:
        sharedPlanWindowHistory.planMembersByPlanId.get(planId) ?? [],
      included: sharedPlanWindowHistory.includedByPlanId.get(planId) ?? [],
    });
  }

  return getPlanSchedulingContext({ serviceTypeId, planId }).catch(() =>
    emptyPlanSchedulingContext(serviceTypeId, planId)
  );
}

async function getSharedPlanWindowHistorySnapshot(
  serviceTypeId: string,
  referenceDate: Date,
  orgTimeZone: string
): Promise<SharedPlanWindowHistorySnapshot> {
  const refDayKey = formatCalendarDayInTimeZone(referenceDate, orgTimeZone);
  const cacheKey = [
    planningCenterPeopleService.getCacheScope(),
    "plan-window-history",
    encodeURIComponent(serviceTypeId),
    encodeURIComponent(orgTimeZone),
    refDayKey,
  ].join(":");

  return planWindowHistoryCache.get(
    cacheKey,
    PLAN_WINDOW_HISTORY_CACHE_TTL_MS,
    async () => {
      const activeServiceTypes = await getActiveServiceTypes();
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
            await planningCenterPlansService.getPlansWithIncludedInDateRange(
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
          const planPeopleCount =
            typeof plan.attributes.plan_people_count === "number"
              ? plan.attributes.plan_people_count
              : null;
          const teamMembersResponse =
            planPeopleCount === 0
              ? { data: [], included: [] }
              : await planningCenterPeopleService.getPlanTeamMembers(
                  currentServiceTypeId,
                  plan.id
                );

          return {
            included: mergeIncludedResources(
              teamMembersResponse.included || [],
              planTimes
            ),
            planId: plan.id,
            planMembers: teamMembersResponse.data as RawPlanPerson[],
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
          planTimeById.set(planTime.id, planTime as RawPlanTime);
        }

        for (const planMember of loadedPlan.planMembers) {
          const personRel = planMember.relationships?.person?.data;
          const personId = Array.isArray(personRel)
            ? personRel[0]?.id
            : personRel?.id;
          if (!personId) continue;

          const assignments = personAssignments.get(personId) || [];
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
}

function getIncludedPlanTimesForPlan(
  plan: PCResource,
  included: PCResource[]
): RawPlanTime[] {
  const relationshipIds = new Set(
    ((plan.relationships?.plan_times?.data ?? []) as { id?: string }[])
      .map((resource) => resource.id)
      .filter((id): id is string => typeof id === "string")
  );

  return included.filter((resource): resource is RawPlanTime => {
    if (resource.type !== "PlanTime") return false;
    if (relationshipIds.size > 0) return relationshipIds.has(resource.id);

    const planRel = resource.relationships?.plan?.data;
    const planId = Array.isArray(planRel) ? planRel[0]?.id : planRel?.id;
    return planId === plan.id;
  });
}

async function getActiveServiceTypes(): Promise<PCResource[]> {
  const serviceTypes =
    await planningCenterCatalogService.getServiceTypesCached();
  return serviceTypes.filter((resource) => !resource.attributes.archived_at);
}

function getCandidateHistorySnapshotFromSharedPlanWindow(
  personId: string,
  referenceDate: Date,
  orgTimeZone: string,
  sharedPlanWindowHistory: SharedPlanWindowHistorySnapshot
): CandidateHistorySnapshot {
  const assignments =
    sharedPlanWindowHistory.personAssignments.get(personId) || [];
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
}

async function getCandidateHistorySnapshot(
  personId: string,
  referenceDate: Date,
  orgTimeZone: string
): Promise<CandidateHistorySnapshot> {
  const refDayKey = formatCalendarDayInTimeZone(referenceDate, orgTimeZone);
  const cacheKey = [
    planningCenterPeopleService.getCacheScope(),
    "candidate-history",
    encodeURIComponent(personId),
    encodeURIComponent(orgTimeZone),
    refDayKey,
  ].join(":");

  return candidateHistoryCache.get(
    cacheKey,
    CANDIDATE_HISTORY_CACHE_TTL_MS,
    async () => {
      const scheduleResponse =
        await planningCenterPeopleService.getPersonSchedules(
          personId,
          { order: "-starts_at" },
          CANDIDATE_HISTORY_MAX_PAGES
        );
      const schedules = scheduleResponse.data as unknown as RawSchedule[];
      const historyResult = buildHistoryAndFrequencyForPerson(
        schedules,
        scheduleResponse.included || [],
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
}

function appendIncludedResources(
  target: PCResource[],
  additions: PCResource[]
) {
  const seen = new Set(
    target.map((resource) => `${resource.type}:${resource.id}`)
  );

  for (const resource of additions) {
    const key = `${resource.type}:${resource.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    target.push(resource);
  }
}

function mergeIncludedResources(
  base: PCResource[],
  additions: PCResource[]
): PCResource[] {
  const merged = [...base];
  appendIncludedResources(merged, additions);
  return merged;
}

export function invalidateCandidateHistoryForPerson(personId: string) {
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
}

export function invalidatePlanWindowHistory() {
  const scope = planningCenterPeopleService.getCacheScope();
  const planWindowPrefix = [scope, "plan-window-history"].join(":");
  planWindowHistoryCache.deleteWhere((key) => key.startsWith(planWindowPrefix));
}
