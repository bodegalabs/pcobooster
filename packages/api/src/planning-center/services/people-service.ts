import { buildPlanningCenterUrl } from "@pcobooster/api/planning-center/core-client";
import type {
  PlanningCenterCoreClient,
  PlanningCenterError,
} from "@pcobooster/api/planning-center/core-client";
import { recoverUnlessInterrupted } from "@pcobooster/api/planning-center/recover-unless-interrupted";
import { cachedRead } from "@pcobooster/api/planning-center/services/cached-read";
import {
  PlanningCenterReadCache,
  stableParams,
} from "@pcobooster/api/planning-center/services/read-cache";
import {
  isNonEmptyString,
  isString,
} from "@pcobooster/planning-center-models/json";
import type {
  PCApiResponse,
  PCRelationship,
  PCResource,
  PCResourceIdentifier,
} from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

const ASSIGNMENTS_CACHE_TTL_MS = 5 * 60 * 1000;
const PERSON_READ_CACHE_TTL_MS = 60 * 1000;
const PLAN_TEAM_MEMBERS_CACHE_TTL_MS = 30 * 1000;
const PLAN_TIMES_CACHE_TTL_MS = 5 * 60 * 1000;
const PERSON_TEAM_POSITION_ASSIGNMENTS_CACHE_TTL_MS = 5 * 60 * 1000;
const ALL_TEAM_PEOPLE_CACHE_TTL_MS = 5 * 60 * 1000;
const PEOPLE_SEARCH_CACHE_TTL_MS = 60 * 1000;
/** 100 teams per page; an organization with more than 1,000 teams is cut off. */
const TEAM_PAGES_MAX = 10;

interface AllTeamPeopleResponse {
  people: PCResource[];
  included: PCResource[];
  teamNamesByPersonId: Map<string, Set<string>>;
}

interface ResourceCollectionResponse {
  data: PCResource[];
  included: PCResource[];
}

export interface PlanningCenterPeopleServiceCaches {
  readonly people: PlanningCenterReadCache<PCResource>;
  readonly resourceLists: PlanningCenterReadCache<PCResource[]>;
  readonly collections: PlanningCenterReadCache<ResourceCollectionResponse>;
  readonly allTeamPeople: PlanningCenterReadCache<AllTeamPeopleResponse>;
}

export const createPlanningCenterPeopleServiceCaches =
  (): PlanningCenterPeopleServiceCaches => ({
    people: new PlanningCenterReadCache<PCResource>(),
    resourceLists: new PlanningCenterReadCache<PCResource[]>(),
    collections: new PlanningCenterReadCache<ResourceCollectionResponse>(),
    allTeamPeople: new PlanningCenterReadCache<AllTeamPeopleResponse>(),
  });

const getRelationshipIdentifiers = (
  data: PCRelationship["data"]
): PCResourceIdentifier[] => {
  if (data === undefined || data === null) {
    return [];
  }
  return Array.isArray(data) ? data : [data];
};

const cloneAllTeamPeopleResponse = (
  response: AllTeamPeopleResponse
): AllTeamPeopleResponse => ({
  people: structuredClone(response.people),
  included: structuredClone(response.included),
  teamNamesByPersonId: new Map(
    [...response.teamNamesByPersonId.entries()].map(([personId, teamNames]) => [
      personId,
      new Set(teamNames),
    ])
  ),
});

const cloneResourceCollectionResponse = (
  response: ResourceCollectionResponse
): ResourceCollectionResponse => ({
  data: structuredClone(response.data),
  included: structuredClone(response.included),
});

const toResourceCollection = (
  fetched: PCApiResponse<PCResource[]>
): ResourceCollectionResponse => ({
  data: fetched.data,
  included: fetched.included ?? [],
});

/** Plan IDs whose schedules list PlanTimes that `include=plan_times` did not sideload. */
const findMissingPlanTimes = (
  schedules: PCResource[],
  included: PCResource[]
): Map<string, Set<string>> => {
  const sideloadedPlanTimeIds = new Set<string>();
  for (const resource of included) {
    if (resource.type === "PlanTime") {
      sideloadedPlanTimeIds.add(resource.id);
    }
  }

  const missingByPlan = new Map<string, Set<string>>();
  for (const schedule of schedules) {
    const planRel = schedule.relationships?.plan?.data;
    const planId = Array.isArray(planRel) ? planRel[0]?.id : planRel?.id;
    if (!isNonEmptyString(planId)) {
      continue;
    }
    const timesRel = getRelationshipIdentifiers(
      schedule.relationships?.times?.data
    );
    for (const t of timesRel) {
      if (!isNonEmptyString(t.id) || sideloadedPlanTimeIds.has(t.id)) {
        continue;
      }
      const missingTimes = missingByPlan.get(planId) ?? new Set<string>();
      missingTimes.add(t.id);
      missingByPlan.set(planId, missingTimes);
    }
  }
  return missingByPlan;
};

/**
 * `teams?include=people` lists every member of each team in one response
 * (measured: a 65-person team arrives whole), unlike `teams/{id}/people`,
 * which needs one request per team and pages at 25.
 */
const collectTeamPeople = ({
  data: teams,
  included,
}: ResourceCollectionResponse): AllTeamPeopleResponse => {
  const peopleById = new Map<string, PCResource>();
  for (const resource of included) {
    if (resource.type === "Person") {
      peopleById.set(resource.id, resource);
    }
  }

  const people: PCResource[] = [];
  const teamNamesByPersonId = new Map<string, Set<string>>();
  for (const team of teams) {
    if (isNonEmptyString(team.attributes.archived_at)) {
      continue;
    }
    const teamName = team.attributes.name;
    for (const { id } of getRelationshipIdentifiers(
      team.relationships?.people?.data
    )) {
      const person = peopleById.get(id);
      if (!person) {
        continue;
      }
      const teamNames = teamNamesByPersonId.get(id);
      if (!teamNames) {
        people.push(person);
      }
      const nextTeamNames = teamNames ?? new Set<string>();
      if (isString(teamName) && teamName.trim()) {
        nextTeamNames.add(teamName);
      }
      teamNamesByPersonId.set(id, nextTeamNames);
    }
  }

  return { people, included: [], teamNamesByPersonId };
};

export class PlanningCenterPeopleService {
  private readonly core: PlanningCenterCoreClient;
  private readonly caches: PlanningCenterPeopleServiceCaches;

  constructor(
    core: PlanningCenterCoreClient,
    caches: PlanningCenterPeopleServiceCaches = createPlanningCenterPeopleServiceCaches()
  ) {
    this.core = core;
    this.caches = caches;
  }

  getPeopleFromTeam(
    teamId: string
  ): Effect.Effect<PCResource[], PlanningCenterError> {
    return this.core.fetchAll(
      `/services/v2/teams/${teamId}/people?include=person`,
      {},
      10
    );
  }

  getPerson(personId: string): Effect.Effect<PCResource, PlanningCenterError> {
    return cachedRead(
      this.caches.people,
      this.buildCacheKey("person", personId),
      PERSON_READ_CACHE_TTL_MS,
      () =>
        Effect.map(
          this.core.fetch(`/services/v2/people/${personId}`),
          (response) => response.data
        )
    ).pipe(Effect.map((person) => structuredClone(person)));
  }

  searchPeopleByName(
    query: string,
    limit = 15
  ): Effect.Effect<PCResource[], PlanningCenterError> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return Effect.succeed([]);
    }

    const endpoint = buildPlanningCenterUrl("/people/v2/people", {
      "where[search_name]": normalizedQuery,
      order: "last_name,first_name",
      per_page: String(limit),
    });
    return cachedRead(
      this.caches.resourceLists,
      this.buildCacheKey(
        "people-search",
        normalizedQuery.toLowerCase(),
        String(limit)
      ),
      PEOPLE_SEARCH_CACHE_TTL_MS,
      () =>
        Effect.map(this.core.fetchCollection(endpoint), (response) =>
          response.data.slice(0, limit)
        )
    ).pipe(Effect.map((data) => structuredClone(data)));
  }

  getAllPeople(): Effect.Effect<PCResource[], PlanningCenterError> {
    return cachedRead(
      this.caches.resourceLists,
      this.buildCacheKey("all-people"),
      ALL_TEAM_PEOPLE_CACHE_TTL_MS,
      () =>
        this.core.fetchAll("/people/v2/people", {}, Number.POSITIVE_INFINITY)
    ).pipe(Effect.map((people) => structuredClone(people)));
  }

  getPersonTeamPositions(
    personId: string
  ): Effect.Effect<PCResource[], PlanningCenterError> {
    return this.core.fetchAll(
      `/services/v2/people/${personId}/person_team_position_assignments?include=team_position`,
      {},
      10
    );
  }

  getAllPeopleFromTeams(): Effect.Effect<
    AllTeamPeopleResponse,
    PlanningCenterError
  > {
    return cachedRead(
      this.caches.allTeamPeople,
      this.buildCacheKey("all-team-people"),
      ALL_TEAM_PEOPLE_CACHE_TTL_MS,
      () => this.loadAllPeopleFromTeams()
    ).pipe(Effect.map(cloneAllTeamPeopleResponse));
  }

  getPersonBlockouts(
    personId: string,
    params: Record<string, string> = {}
  ): Effect.Effect<PCResource[], PlanningCenterError> {
    return cachedRead(
      this.caches.resourceLists,
      this.buildCacheKey("person-blockouts", personId, stableParams(params)),
      PERSON_READ_CACHE_TTL_MS,
      () =>
        this.core.fetchAll(
          `/services/v2/people/${personId}/blockouts`,
          params,
          10
        )
    ).pipe(Effect.map((blockouts) => structuredClone(blockouts)));
  }

  getPersonBlockoutDates(
    personId: string,
    blockoutId: string
  ): Effect.Effect<PCResource[], PlanningCenterError> {
    return cachedRead(
      this.caches.resourceLists,
      this.buildCacheKey("person-blockout-dates", personId, blockoutId),
      PERSON_READ_CACHE_TTL_MS,
      () =>
        this.core.fetchAll(
          `/services/v2/people/${personId}/blockouts/${blockoutId}/blockout_dates`,
          {},
          10
        )
    ).pipe(Effect.map((dates) => structuredClone(dates)));
  }

  getPersonSchedules(
    personId: string,
    params: Record<string, string> = {},
    maxPages = 2
  ): Effect.Effect<ResourceCollectionResponse, PlanningCenterError> {
    const load = () =>
      this.core
        .fetchAllWithIncluded(
          `/services/v2/people/${personId}/schedules`,
          { include: "plan_times", ...params },
          maxPages
        )
        .pipe(
          Effect.flatMap(({ data, included }) =>
            Effect.map(
              this.enrichSchedulesWithRehearsalTimes(data, included),
              (enrichedIncluded) => ({ data, included: enrichedIncluded })
            )
          )
        );
    return cachedRead(
      this.caches.collections,
      this.buildCacheKey(
        "person-schedules",
        personId,
        stableParams(params),
        String(maxPages)
      ),
      PERSON_READ_CACHE_TTL_MS,
      load
    ).pipe(Effect.map(cloneResourceCollectionResponse));
  }

  /**
   * A person's schedules on or after `afterDayKey` (YYYY-MM-DD), past and
   * future; without a filter Planning Center returns only upcoming ones.
   * Unlike `getPersonSchedules`, rehearsal PlanTimes that `include=plan_times`
   * leaves out are not fetched per plan here: callers resolve them within
   * their own request budget.
   */
  getPersonSchedulesAfter(
    personId: string,
    afterDayKey: string,
    maxPages: number
  ): Effect.Effect<ResourceCollectionResponse, PlanningCenterError> {
    const params = {
      include: "plan_times",
      filter: "after",
      after: afterDayKey,
    };
    return cachedRead(
      this.caches.collections,
      this.buildCacheKey(
        "person-schedules",
        personId,
        stableParams(params),
        String(maxPages)
      ),
      PERSON_READ_CACHE_TTL_MS,
      () =>
        this.core.fetchAllWithIncluded(
          `/services/v2/people/${personId}/schedules`,
          params,
          maxPages
        )
    ).pipe(Effect.map(cloneResourceCollectionResponse));
  }

  /**
   * `include=plan_times` only sideloads service-typed PlanTimes. Rehearsal PlanTime IDs are
   * listed in `schedule.relationships.times` but their resources aren't included. Fetch them
   * per-plan and merge into `included` so downstream history processing can classify them.
   */
  private enrichSchedulesWithRehearsalTimes(
    schedules: PCResource[],
    included: PCResource[]
  ): Effect.Effect<PCResource[]> {
    const missingByPlan = findMissingPlanTimes(schedules, included);
    if (missingByPlan.size === 0) {
      return Effect.succeed(included);
    }

    return Effect.forEach(
      [...missingByPlan.entries()],
      ([planId, idSet]) =>
        Effect.map(this.getPlanPlanTimes(planId), (planTimes) =>
          planTimes.filter((pt) => idSet.has(pt.id))
        ),
      { concurrency: "unbounded" }
    ).pipe(Effect.map((fetched) => [...included, ...fetched.flat()]));
  }

  /**
   * Cached fetch of all PlanTimes for a plan. Shared across candidates so a position page with
   * 30 candidates serving on the same Sunday plan triggers one fetch, not 30. PlanTimes rarely
   * change, so the TTL is longer than per-person caches. A plan we cannot read has no times.
   */
  getPlanPlanTimes(planId: string): Effect.Effect<PCResource[]> {
    return cachedRead(
      this.caches.resourceLists,
      this.buildCacheKey("plan-plan-times", planId),
      PLAN_TIMES_CACHE_TTL_MS,
      () =>
        this.core
          .fetchAll(
            `/services/v2/plans/${planId}/plan_times`,
            { per_page: "200" },
            10
          )
          .pipe(recoverUnlessInterrupted((): PCResource[] => []))
    ).pipe(
      Effect.map((planTimes) => structuredClone(planTimes)),
      Effect.orDie
    );
  }

  getPeopleForTeamPosition(
    serviceTypeId: string,
    positionId: string
  ): Effect.Effect<ResourceCollectionResponse, PlanningCenterError> {
    return cachedRead(
      this.caches.collections,
      this.buildCacheKey(
        "team-position-assignments",
        serviceTypeId,
        positionId
      ),
      ASSIGNMENTS_CACHE_TTL_MS,
      () =>
        this.core
          .fetchAllWithIncluded(
            `/services/v2/service_types/${serviceTypeId}/team_positions/${positionId}/person_team_position_assignments`,
            { include: "person,team_position" },
            10
          )
          .pipe(Effect.map(toResourceCollection))
    ).pipe(Effect.map(cloneResourceCollectionResponse));
  }

  getPlanTeamMembers(
    serviceTypeId: string,
    planId: string
  ): Effect.Effect<ResourceCollectionResponse, PlanningCenterError> {
    return cachedRead(
      this.caches.collections,
      this.buildCacheKey("plan-team-members", serviceTypeId, planId),
      PLAN_TEAM_MEMBERS_CACHE_TTL_MS,
      () =>
        this.core
          .fetchAllWithIncluded(
            `/services/v2/service_types/${serviceTypeId}/plans/${planId}/team_members`,
            { include: "person,team,plan", per_page: "100" },
            25
          )
          .pipe(Effect.map(toResourceCollection))
    ).pipe(Effect.map(cloneResourceCollectionResponse));
  }

  getPersonTeamPositionAssignments(
    personId: string
  ): Effect.Effect<ResourceCollectionResponse, PlanningCenterError> {
    return cachedRead(
      this.caches.collections,
      this.buildCacheKey("person-team-position-assignments", personId),
      PERSON_TEAM_POSITION_ASSIGNMENTS_CACHE_TTL_MS,
      () =>
        this.core
          .fetchCollection(
            `/services/v2/people/${personId}/person_team_position_assignments?include=team_position,team_position.team`
          )
          .pipe(Effect.map(toResourceCollection))
    ).pipe(Effect.map(cloneResourceCollectionResponse));
  }

  updatePlanPersonStatus(
    planPersonId: string,
    status: "C" | "U" | "D",
    context?: { personId?: string; serviceTypeId?: string; planId?: string }
  ): Effect.Effect<PCResource, PlanningCenterError> {
    return this.core
      .fetch(`/services/v2/plan_people/${planPersonId}`, {
        method: "PATCH",
        body: {
          data: {
            type: "PlanPerson",
            id: planPersonId,
            attributes: { status },
          },
        },
      })
      .pipe(
        Effect.map((response) => {
          if (
            isNonEmptyString(context?.serviceTypeId) &&
            isNonEmptyString(context.planId)
          ) {
            this.invalidateScheduleReadCaches({
              personId: context.personId,
              serviceTypeId: context.serviceTypeId,
              planId: context.planId,
            });
          }
          return response.data;
        })
      );
  }

  updatePlanPersonTimes({
    personId,
    planPersonId,
    serviceTypeId,
    planId,
    planTimeIds,
  }: {
    personId: string;
    planPersonId: string;
    serviceTypeId: string;
    planId: string;
    planTimeIds: string[];
  }): Effect.Effect<PCResource, PlanningCenterError> {
    return this.core
      .fetch(`/services/v2/people/${personId}/plan_people/${planPersonId}`, {
        method: "PATCH",
        body: {
          data: {
            type: "PlanPerson",
            id: planPersonId,
            relationships: {
              times: {
                data: planTimeIds.map((id) => ({ type: "PlanTime", id })),
              },
            },
          },
        },
      })
      .pipe(
        Effect.map((response) => {
          this.invalidateScheduleReadCaches({
            personId,
            serviceTypeId,
            planId,
          });
          return response.data;
        })
      );
  }

  deletePlanPerson(
    planPersonId: string,
    context?: { personId?: string; serviceTypeId?: string; planId?: string }
  ): Effect.Effect<void, PlanningCenterError> {
    let endpoint = `/services/v2/plan_people/${planPersonId}`;
    if (
      isNonEmptyString(context?.serviceTypeId) &&
      isNonEmptyString(context.planId)
    ) {
      endpoint = `/services/v2/service_types/${context.serviceTypeId}/plans/${context.planId}/team_members/${planPersonId}`;
    } else if (isNonEmptyString(context?.personId)) {
      endpoint = `/services/v2/people/${context.personId}/plan_people/${planPersonId}`;
    }

    return this.core.request(endpoint, { method: "DELETE" }).pipe(
      Effect.asVoid,
      Effect.tap(() =>
        Effect.sync(() => {
          if (
            isNonEmptyString(context?.serviceTypeId) &&
            isNonEmptyString(context.planId)
          ) {
            this.invalidateScheduleReadCaches({
              personId: context.personId,
              serviceTypeId: context.serviceTypeId,
              planId: context.planId,
            });
          }
        })
      )
    );
  }

  /**
   * Schedule a person to a plan for a team. Creates a PlanPerson in Planning Center Services.
   */
  createPlanPerson(
    serviceTypeId: string,
    personId: string,
    planId: string,
    teamId: string,
    teamPositionName: string
  ): Effect.Effect<PCResource, PlanningCenterError> {
    return this.core
      .fetch(
        `/services/v2/service_types/${serviceTypeId}/plans/${planId}/team_members`,
        {
          method: "POST",
          body: {
            data: {
              type: "PlanPerson",
              attributes: {
                status: "U",
                person_id: personId,
                team_id: teamId,
                team_position_name: teamPositionName,
              },
            },
          },
        }
      )
      .pipe(
        Effect.map((response) => {
          this.invalidateScheduleReadCaches({
            personId,
            serviceTypeId,
            planId,
          });
          return response.data;
        })
      );
  }

  invalidateScheduleReadCaches({
    personId,
    serviceTypeId,
    planId,
  }: {
    personId?: string;
    serviceTypeId: string;
    planId: string;
  }) {
    const scope = this.core.getCacheScope();
    const personSchedulesPrefix = isNonEmptyString(personId)
      ? [scope, "person-schedules", encodeURIComponent(personId), ""].join(":")
      : null;
    const planTeamMembersKey = this.buildCacheKey(
      "plan-team-members",
      serviceTypeId,
      planId
    );

    this.caches.collections.deleteWhere(
      (key) =>
        (isNonEmptyString(personSchedulesPrefix)
          ? key.startsWith(personSchedulesPrefix)
          : false) || key === planTeamMembersKey
    );
  }

  invalidatePlanTimeSensitiveReadCaches(planId: string) {
    const scope = this.core.getCacheScope();
    const planTimesKey = this.buildCacheKey("plan-plan-times", planId);
    const personSchedulesPrefix = [scope, "person-schedules"].join(":");

    this.caches.resourceLists.deleteWhere((key) => key === planTimesKey);
    this.caches.collections.deleteWhere((key) =>
      key.startsWith(personSchedulesPrefix)
    );
  }

  private buildCacheKey(namespace: string, ...parts: string[]): string {
    return [
      this.core.getCacheScope(),
      namespace,
      ...parts.map((part) => encodeURIComponent(part)),
    ].join(":");
  }

  private loadAllPeopleFromTeams(): Effect.Effect<
    AllTeamPeopleResponse,
    PlanningCenterError
  > {
    return this.core
      .fetchAllWithIncluded(
        "/services/v2/teams",
        { include: "people" },
        TEAM_PAGES_MAX
      )
      .pipe(Effect.map(collectTeamPeople));
  }

  getCacheScope(): string {
    return this.core.getCacheScope();
  }
}
