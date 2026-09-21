import { isNonEmptyString, isString } from "@worship-admin/api/json";
import {
  buildPlanningCenterUrl,
  PlanningCenterCoreClient,
} from "@worship-admin/api/planning-center/core-client";
import {
  PlanningCenterReadCache,
  stableParams,
} from "@worship-admin/api/planning-center/services/read-cache";
import type {
  PCRelationship,
  PCResource,
  PCResourceIdentifier,
} from "@worship-admin/api/types";

const ASSIGNMENTS_CACHE_TTL_MS = 5 * 60 * 1000;
const PERSON_READ_CACHE_TTL_MS = 60 * 1000;
const PLAN_TEAM_MEMBERS_CACHE_TTL_MS = 30 * 1000;
const PLAN_TIMES_CACHE_TTL_MS = 5 * 60 * 1000;
const PERSON_TEAM_POSITION_ASSIGNMENTS_CACHE_TTL_MS = 5 * 60 * 1000;
const ALL_TEAM_PEOPLE_CACHE_TTL_MS = 5 * 60 * 1000;
const PEOPLE_SEARCH_CACHE_TTL_MS = 60 * 1000;
const TEAM_PEOPLE_CONCURRENCY = 8;

interface AllTeamPeopleResponse {
  people: PCResource[];
  included: PCResource[];
  teamNamesByPersonId: Map<string, Set<string>>;
}

const getRelationshipIdentifiers = (
  data: PCRelationship["data"]
): PCResourceIdentifier[] => {
  if (data === undefined || data === null) {
    return [];
  }
  return Array.isArray(data) ? data : [data];
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  if (items.length === 0) {
    return [];
  }

  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length));
  const results = Array.from(
    { length: items.length },
    (): { value: R } | undefined => undefined
  );
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    const current = nextIndex;
    nextIndex += 1;
    if (current >= items.length) {
      return;
    }
    const value = await mapper(items[current], current);
    results[current] = { value };
    await worker();
  };

  const workers = Array.from({ length: safeConcurrency }, async () => {
    await worker();
  });
  await Promise.all(workers);
  return results.map((slot) => {
    if (slot === undefined) {
      throw new Error("Concurrent mapping did not complete every item");
    }
    return slot.value;
  });
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

export class PlanningCenterPeopleService {
  private readonly personCache = new PlanningCenterReadCache<PCResource>();
  private readonly resourceListCache = new PlanningCenterReadCache<
    PCResource[]
  >();
  private readonly collectionCache = new PlanningCenterReadCache<{
    data: PCResource[];
    included: PCResource[];
  }>();
  private readonly allTeamPeopleCache =
    new PlanningCenterReadCache<AllTeamPeopleResponse>();
  private readonly core: PlanningCenterCoreClient;

  constructor(core: PlanningCenterCoreClient) {
    this.core = core;
  }

  async getPeopleFromTeam(teamId: string): Promise<PCResource[]> {
    return await this.core.fetchAll(
      `/services/v2/teams/${teamId}/people?include=person`
    );
  }

  async getPerson(personId: string): Promise<PCResource> {
    return await this.personCache.get(
      this.buildCacheKey("person", personId),
      PERSON_READ_CACHE_TTL_MS,
      async () => {
        const response = await this.core.fetch(
          `/services/v2/people/${personId}`
        );
        return response.data;
      }
    );
  }

  async searchPeopleByName(query: string, limit = 15): Promise<PCResource[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [];
    }

    const data = await this.resourceListCache.get(
      this.buildCacheKey(
        "people-search",
        normalizedQuery.toLowerCase(),
        String(limit)
      ),
      PEOPLE_SEARCH_CACHE_TTL_MS,
      async () => {
        const endpoint = buildPlanningCenterUrl("/people/v2/people", {
          "where[search_name]": normalizedQuery,
          order: "last_name,first_name",
          per_page: String(limit),
        });
        const response = await this.core.fetchCollection(endpoint);
        return response.data.slice(0, limit);
      }
    );

    return structuredClone(data);
  }

  async getAllPeople(): Promise<PCResource[]> {
    const people = await this.resourceListCache.get(
      this.buildCacheKey("all-people"),
      ALL_TEAM_PEOPLE_CACHE_TTL_MS,
      async () =>
        await this.core.fetchAll(
          "/people/v2/people",
          {},
          Number.POSITIVE_INFINITY
        )
    );
    return structuredClone(people);
  }

  async getPersonTeamPositions(personId: string): Promise<PCResource[]> {
    return await this.core.fetchAll(
      `/services/v2/people/${personId}/person_team_position_assignments?include=team_position`
    );
  }

  async getAllPeopleFromTeams(): Promise<AllTeamPeopleResponse> {
    const response = await this.allTeamPeopleCache.get(
      this.buildCacheKey("all-team-people"),
      ALL_TEAM_PEOPLE_CACHE_TTL_MS,
      async () => await this.loadAllPeopleFromTeams()
    );

    return cloneAllTeamPeopleResponse(response);
  }

  async getPersonBlockouts(
    personId: string,
    params: Record<string, string> = {}
  ): Promise<PCResource[]> {
    return await this.resourceListCache.get(
      this.buildCacheKey("person-blockouts", personId, stableParams(params)),
      PERSON_READ_CACHE_TTL_MS,
      async () =>
        await this.core.fetchAll(
          `/services/v2/people/${personId}/blockouts`,
          params
        )
    );
  }

  async getPersonBlockoutDates(
    personId: string,
    blockoutId: string
  ): Promise<PCResource[]> {
    return await this.resourceListCache.get(
      this.buildCacheKey("person-blockout-dates", personId, blockoutId),
      PERSON_READ_CACHE_TTL_MS,
      async () =>
        await this.core.fetchAll(
          `/services/v2/people/${personId}/blockouts/${blockoutId}/blockout_dates`
        )
    );
  }

  async getPersonSchedules(
    personId: string,
    params: Record<string, string> = {},
    maxPages = 2
  ): Promise<{ data: PCResource[]; included: PCResource[] }> {
    return await this.collectionCache.get(
      this.buildCacheKey(
        "person-schedules",
        personId,
        stableParams(params),
        String(maxPages)
      ),
      PERSON_READ_CACHE_TTL_MS,
      async () => {
        const response = await this.core.fetchAllWithIncluded(
          `/services/v2/people/${personId}/schedules`,
          { include: "plan_times", ...params },
          maxPages
        );

        const { data } = response;
        const included = response.included ?? [];
        const enrichedIncluded = await this.enrichSchedulesWithRehearsalTimes(
          data,
          included
        );

        return {
          data,
          included: enrichedIncluded,
        };
      }
    );
  }

  /**
   * `include=plan_times` only sideloads service-typed PlanTimes. Rehearsal PlanTime IDs are
   * listed in `schedule.relationships.times` but their resources aren't included. Fetch them
   * per-plan and merge into `included` so downstream history processing can classify them.
   */
  private async enrichSchedulesWithRehearsalTimes(
    schedules: PCResource[],
    included: PCResource[]
  ): Promise<PCResource[]> {
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

    if (missingByPlan.size === 0) {
      return included;
    }

    const fetched = await Promise.all(
      [...missingByPlan.entries()].map(async ([planId, idSet]) => {
        const planTimes = await this.getPlanPlanTimes(planId);
        return planTimes.filter((pt) => idSet.has(pt.id));
      })
    );

    return [...included, ...fetched.flat()];
  }

  /**
   * Cached fetch of all PlanTimes for a plan. Shared across candidates so a position page with
   * 30 candidates serving on the same Sunday plan triggers one fetch, not 30. PlanTimes rarely
   * change, so the TTL is longer than per-person caches.
   */
  async getPlanPlanTimes(planId: string): Promise<PCResource[]> {
    return await this.resourceListCache.get(
      this.buildCacheKey("plan-plan-times", planId),
      PLAN_TIMES_CACHE_TTL_MS,
      async () => {
        try {
          return await this.core.fetchAll(
            `/services/v2/plans/${planId}/plan_times`,
            { per_page: "200" }
          );
        } catch {
          return [];
        }
      }
    );
  }

  async getPeopleForTeamPosition(
    serviceTypeId: string,
    positionId: string
  ): Promise<{ data: PCResource[]; included: PCResource[] }> {
    return await this.collectionCache.get(
      this.buildCacheKey(
        "team-position-assignments",
        serviceTypeId,
        positionId
      ),
      ASSIGNMENTS_CACHE_TTL_MS,
      async () => {
        const response = await this.core.fetchAllWithIncluded(
          `/services/v2/service_types/${serviceTypeId}/team_positions/${positionId}/person_team_position_assignments`,
          { include: "person,team_position" },
          10
        );

        return {
          data: response.data,
          included: response.included ?? [],
        };
      }
    );
  }

  async getPlanTeamMembers(
    serviceTypeId: string,
    planId: string
  ): Promise<{ data: PCResource[]; included: PCResource[] }> {
    return await this.collectionCache.get(
      this.buildCacheKey("plan-team-members", serviceTypeId, planId),
      PLAN_TEAM_MEMBERS_CACHE_TTL_MS,
      async () => {
        const response = await this.core.fetchAllWithIncluded(
          `/services/v2/service_types/${serviceTypeId}/plans/${planId}/team_members`,
          { include: "person,team,plan", per_page: "100" },
          25
        );

        return {
          data: response.data,
          included: response.included ?? [],
        };
      }
    );
  }

  async getPersonTeamPositionAssignments(
    personId: string
  ): Promise<{ data: PCResource[]; included: PCResource[] }> {
    return await this.collectionCache.get(
      this.buildCacheKey("person-team-position-assignments", personId),
      PERSON_TEAM_POSITION_ASSIGNMENTS_CACHE_TTL_MS,
      async () => {
        const response = await this.core.fetchCollection(
          `/services/v2/people/${personId}/person_team_position_assignments?include=team_position,team_position.team`
        );

        return {
          data: response.data,
          included: response.included ?? [],
        };
      }
    );
  }

  async updatePlanPersonStatus(
    planPersonId: string,
    status: "C" | "U" | "D",
    context?: { personId?: string; serviceTypeId?: string; planId?: string }
  ): Promise<PCResource> {
    const response = await this.core.fetch(
      `/services/v2/plan_people/${planPersonId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: {
            type: "PlanPerson",
            id: planPersonId,
            attributes: {
              status,
            },
          },
        }),
      }
    );
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
  }

  async updatePlanPersonTimes({
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
  }): Promise<PCResource> {
    const response = await this.core.fetch(
      `/services/v2/people/${personId}/plan_people/${planPersonId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: {
            type: "PlanPerson",
            id: planPersonId,
            relationships: {
              times: {
                data: planTimeIds.map((id) => ({ type: "PlanTime", id })),
              },
            },
          },
        }),
      }
    );
    this.invalidateScheduleReadCaches({ personId, serviceTypeId, planId });
    return response.data;
  }

  async deletePlanPerson(
    planPersonId: string,
    context?: { personId?: string; serviceTypeId?: string; planId?: string }
  ): Promise<void> {
    let endpoint = `/services/v2/plan_people/${planPersonId}`;
    if (
      isNonEmptyString(context?.serviceTypeId) &&
      isNonEmptyString(context.planId)
    ) {
      endpoint = `/services/v2/service_types/${context.serviceTypeId}/plans/${context.planId}/team_members/${planPersonId}`;
    } else if (isNonEmptyString(context?.personId)) {
      endpoint = `/services/v2/people/${context.personId}/plan_people/${planPersonId}`;
    }

    await this.core.request(endpoint, {
      method: "DELETE",
    });
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
  }

  /**
   * Schedule a person to a plan for a team. Creates a PlanPerson in Planning Center Services.
   */
  async createPlanPerson(
    serviceTypeId: string,
    personId: string,
    planId: string,
    teamId: string,
    teamPositionName: string
  ): Promise<PCResource> {
    const response = await this.core.fetch(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}/team_members`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: {
            type: "PlanPerson",
            attributes: {
              status: "U",
              person_id: personId,
              team_id: teamId,
              team_position_name: teamPositionName,
            },
          },
        }),
      }
    );
    this.invalidateScheduleReadCaches({ personId, serviceTypeId, planId });
    return response.data;
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

    this.collectionCache.deleteWhere(
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

    this.resourceListCache.deleteWhere((key) => key === planTimesKey);
    this.collectionCache.deleteWhere((key) =>
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

  private async loadAllPeopleFromTeams(): Promise<AllTeamPeopleResponse> {
    const teams = await this.core.fetchAll("/services/v2/teams");
    const activeTeams = teams.filter(
      (team) => !isNonEmptyString(team.attributes.archived_at)
    );

    const teamResponses = await mapWithConcurrency(
      activeTeams,
      TEAM_PEOPLE_CONCURRENCY,
      async (team) => {
        try {
          const response = await this.core.fetchCollection(
            `/services/v2/teams/${team.id}/people?include=person`
          );
          return { team, response };
        } catch {
          // Skip teams with partial-access or transient API failures.
          return null;
        }
      }
    );

    const allPeople: PCResource[] = [];
    const allIncluded: PCResource[] = [];
    const teamNamesByPersonId = new Map<string, Set<string>>();
    const seenIds = new Set<string>();

    for (const result of teamResponses) {
      if (!result) {
        continue;
      }

      const { team, response } = result;
      const people = response.data;
      const included = response.included ?? [];

      for (const person of people) {
        let personResource: PCResource | null = null;

        if (person.type === "Person") {
          personResource = person;
        } else if (person.relationships?.person?.data) {
          const personData = person.relationships.person.data;
          const personId = Array.isArray(personData)
            ? personData[0]?.id
            : personData?.id;

          if (personId) {
            personResource =
              included.find((p) => p.type === "Person" && p.id === personId) ??
              null;
          }
        }

        if (personResource && !seenIds.has(personResource.id)) {
          seenIds.add(personResource.id);
          allPeople.push(personResource);
        }

        if (personResource) {
          const teamName = team.attributes.name;
          if (isString(teamName) && teamName.trim()) {
            const teamNames =
              teamNamesByPersonId.get(personResource.id) ?? new Set<string>();
            teamNames.add(teamName);
            teamNamesByPersonId.set(personResource.id, teamNames);
          }
        }
      }

      allIncluded.push(...included);
    }

    return { people: allPeople, included: allIncluded, teamNamesByPersonId };
  }

  getCacheScope(): string {
    return this.core.getCacheScope();
  }
}

export const planningCenterPeopleService = new PlanningCenterPeopleService(
  new PlanningCenterCoreClient()
);
