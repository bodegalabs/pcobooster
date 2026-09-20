import type { JsonObject } from "@worship-admin/api/json";
import { PlanningCenterCoreClient } from "@worship-admin/api/planning-center/core-client";
import { PlanningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import type { PCResource } from "@worship-admin/api/types";
import { describe, expect, it, vi } from "vitest";

const resource = (
  id: string,
  type: string,
  attributes: JsonObject = {}
): PCResource => ({
  id,
  type,
  attributes,
});

describe("PlanningCenterPeopleService.getAllPeople", () => {
  it("loads every directory page, caches by account, and returns independent copies", async () => {
    let scope = "account-a";
    const core = new PlanningCenterCoreClient();
    const fetchAll = vi
      .spyOn(core, "fetchAll")
      .mockResolvedValue([
        resource("person-1", "Person", { first_name: "Original" }),
      ]);
    vi.spyOn(core, "getCacheScope").mockImplementation(() => scope);
    const service = new PlanningCenterPeopleService(core);
    const first = await service.getAllPeople();
    first[0].attributes.first_name = "Changed";
    const second = await service.getAllPeople();
    expect(second[0].attributes.first_name).toBe("Original");
    expect(fetchAll).toHaveBeenCalledExactlyOnceWith(
      "/people/v2/people",
      {},
      Number.POSITIVE_INFINITY
    );
    scope = "account-b";
    await service.getAllPeople();
    expect(fetchAll).toHaveBeenCalledTimes(2);
  });
});

describe("PlanningCenterPeopleService.getPlanTeamMembers", () => {
  it("uses fetchAllWithIncluded so large rosters are not truncated to the first page", async () => {
    const core = new PlanningCenterCoreClient();
    const fetchAllWithIncluded = vi
      .spyOn(core, "fetchAllWithIncluded")
      .mockResolvedValue({ data: [], included: [] });
    const service = new PlanningCenterPeopleService(core);

    await service.getPlanTeamMembers("st-123", "plan-456");

    expect(fetchAllWithIncluded).toHaveBeenCalledExactlyOnceWith(
      "/services/v2/service_types/st-123/plans/plan-456/team_members",
      { include: "person,team,plan", per_page: "100" },
      25
    );
  });
});

describe("PlanningCenterPeopleService.getPersonTeamPositionAssignments", () => {
  it("caches assignment validation reads used by schedule POST", async () => {
    const core = new PlanningCenterCoreClient();
    const fetch = vi.spyOn(core, "fetchCollection").mockResolvedValue({
      data: [],
      included: [],
    });
    const service = new PlanningCenterPeopleService(core);

    await service.getPersonTeamPositionAssignments("person-123");
    await service.getPersonTeamPositionAssignments("person-123");

    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "/services/v2/people/person-123/person_team_position_assignments?include=team_position,team_position.team"
    );
  });
});

describe("PlanningCenterPeopleService.searchPeopleByName", () => {
  it("caches normalized people search reads and returns mutation-safe copies", async () => {
    const core = new PlanningCenterCoreClient();
    const fetch = vi.spyOn(core, "fetchCollection").mockResolvedValue({
      data: [resource("person-1", "Person", { first_name: "Andrew" })],
    });
    const service = new PlanningCenterPeopleService(core);

    const first = await service.searchPeopleByName("  Andrew  ");
    first[0].attributes.first_name = "Mutated";
    const second = await service.searchPeopleByName("andrew");

    expect(fetch).toHaveBeenCalledOnce();
    const requestedUrl = new URL(fetch.mock.calls[0][0]);
    expect(requestedUrl.pathname).toBe("/people/v2/people");
    expect(Object.fromEntries(requestedUrl.searchParams)).toStrictEqual({
      "where[search_name]": "Andrew",
      order: "last_name,first_name",
      per_page: "15",
    });
    expect(second[0].attributes.first_name).toBe("Andrew");
  });
});

describe("PlanningCenterPeopleService.getAllPeopleFromTeams", () => {
  it("caches team roster reads and returns mutation-safe copies", async () => {
    const core = new PlanningCenterCoreClient();
    const fetchAll = vi
      .spyOn(core, "fetchAll")
      .mockResolvedValue([
        resource("team-1", "Team", { name: "Band" }),
        resource("team-2", "Team", { name: "Hosts" }),
      ]);
    const responseForEndpoint = (endpoint: string) => {
      if (endpoint.includes("/teams/team-1/")) {
        return {
          data: [
            {
              id: "assignment-1",
              type: "PersonTeamPositionAssignment",
              attributes: {},
              relationships: {
                person: { data: { id: "person-1", type: "Person" } },
              },
            },
          ],
          included: [
            resource("person-1", "Person", {
              first_name: "Alex",
              last_name: "Adams",
            }),
          ],
        };
      }

      return {
        data: [
          {
            id: "assignment-2",
            type: "PersonTeamPositionAssignment",
            attributes: {},
            relationships: {
              person: { data: { id: "person-1", type: "Person" } },
            },
          },
        ],
        included: [
          resource("person-1", "Person", {
            first_name: "Alex",
            last_name: "Adams",
          }),
        ],
      };
    };
    const fetch = vi
      .spyOn(core, "fetchCollection")
      .mockImplementation(
        async (endpoint: string) =>
          await Promise.resolve(responseForEndpoint(endpoint))
      );
    const service = new PlanningCenterPeopleService(core);

    const first = await service.getAllPeopleFromTeams();
    first.people[0].attributes.first_name = "Mutated";
    first.teamNamesByPersonId.get("person-1")?.add("Mutated Team");
    const second = await service.getAllPeopleFromTeams();

    expect(fetchAll).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(second.people).toHaveLength(1);
    expect(second.people[0].attributes.first_name).toBe("Alex");
    expect([
      ...(second.teamNamesByPersonId.get("person-1") ?? []),
    ]).toStrictEqual(["Band", "Hosts"]);
  });
});

describe("PlanningCenterPeopleService.updatePlanPersonStatus", () => {
  it("invalidates cached plan team members when plan context is available", async () => {
    const core = new PlanningCenterCoreClient();
    const fetchAllWithIncluded = vi
      .spyOn(core, "fetchAllWithIncluded")
      .mockResolvedValue({ data: [], included: [] });
    const fetch = vi.spyOn(core, "fetch").mockResolvedValue({
      data: { id: "pp-123", type: "PlanPerson", attributes: {} },
    });
    const service = new PlanningCenterPeopleService(core);

    await service.getPlanTeamMembers("st-789", "plan-101");
    await service.getPlanTeamMembers("st-789", "plan-101");

    await service.updatePlanPersonStatus("pp-123", "C", {
      personId: "person-456",
      serviceTypeId: "st-789",
      planId: "plan-101",
    });

    await service.getPlanTeamMembers("st-789", "plan-101");

    expect(fetchAllWithIncluded).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith("/services/v2/plan_people/pp-123", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          type: "PlanPerson",
          id: "pp-123",
          attributes: {
            status: "C",
          },
        },
      }),
    });
  });
});

describe("PlanningCenterPeopleService.updatePlanPersonTimes", () => {
  it("patches PlanPerson time relationships and invalidates cached plan members", async () => {
    const core = new PlanningCenterCoreClient();
    const fetchAllWithIncluded = vi
      .spyOn(core, "fetchAllWithIncluded")
      .mockResolvedValue({ data: [], included: [] });
    const fetch = vi.spyOn(core, "fetch").mockResolvedValue({
      data: { id: "pp-123", type: "PlanPerson", attributes: {} },
    });
    const service = new PlanningCenterPeopleService(core);

    await service.getPlanTeamMembers("st-789", "plan-101");
    await service.getPlanTeamMembers("st-789", "plan-101");

    await service.updatePlanPersonTimes({
      personId: "person-456",
      planPersonId: "pp-123",
      serviceTypeId: "st-789",
      planId: "plan-101",
      planTimeIds: ["time-1", "time-2"],
    });

    await service.getPlanTeamMembers("st-789", "plan-101");

    expect(fetchAllWithIncluded).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith(
      "/services/v2/people/person-456/plan_people/pp-123",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: {
            type: "PlanPerson",
            id: "pp-123",
            relationships: {
              times: {
                data: [
                  { type: "PlanTime", id: "time-1" },
                  { type: "PlanTime", id: "time-2" },
                ],
              },
            },
          },
        }),
      }
    );
  });
});

describe("PlanningCenterPeopleService.invalidateScheduleReadCaches", () => {
  it("clears cached plan team members and person schedules for conflict reconciliation", async () => {
    const core = new PlanningCenterCoreClient();
    const fetchAllWithIncluded = vi
      .spyOn(core, "fetchAllWithIncluded")
      .mockResolvedValue({ data: [], included: [] });
    const service = new PlanningCenterPeopleService(core);

    await service.getPlanTeamMembers("st-789", "plan-101");
    await service.getPersonSchedules("person-456");
    await service.getPlanTeamMembers("st-789", "plan-101");
    await service.getPersonSchedules("person-456");

    service.invalidateScheduleReadCaches({
      personId: "person-456",
      serviceTypeId: "st-789",
      planId: "plan-101",
    });

    await service.getPlanTeamMembers("st-789", "plan-101");
    await service.getPersonSchedules("person-456");

    expect(
      fetchAllWithIncluded.mock.calls.filter(([endpoint]) =>
        endpoint.includes("/plans/plan-101/team_members")
      )
    ).toHaveLength(2);
    expect(
      fetchAllWithIncluded.mock.calls.filter(([endpoint]) =>
        endpoint.includes("/people/person-456/schedules")
      )
    ).toHaveLength(2);
  });
});

describe("PlanningCenterPeopleService.getPlanPlanTimes", () => {
  it("fetches all plan times through the shared cache-backed endpoint", async () => {
    const core = new PlanningCenterCoreClient();
    const fetchAll = vi.spyOn(core, "fetchAll").mockResolvedValue([]);
    const service = new PlanningCenterPeopleService(core);

    await service.getPlanPlanTimes("plan-456");

    expect(fetchAll).toHaveBeenCalledExactlyOnceWith(
      "/services/v2/plans/plan-456/plan_times",
      { per_page: "200" }
    );
  });
});

describe("PlanningCenterPeopleService.deletePlanPerson", () => {
  it("uses the plan team_members endpoint when plan context is available", async () => {
    const core = new PlanningCenterCoreClient();
    const request = vi
      .spyOn(core, "request")
      .mockResolvedValue(new Response(null, { status: 204 }));
    const service = new PlanningCenterPeopleService(core);

    await service.deletePlanPerson("pp-123", {
      personId: "person-456",
      serviceTypeId: "st-789",
      planId: "plan-101",
    });

    expect(request).toHaveBeenCalledWith(
      "/services/v2/service_types/st-789/plans/plan-101/team_members/pp-123",
      { method: "DELETE" }
    );
  });

  it("falls back to the person-scoped plan_people endpoint without plan context", async () => {
    const core = new PlanningCenterCoreClient();
    const request = vi
      .spyOn(core, "request")
      .mockResolvedValue(new Response(null, { status: 204 }));
    const service = new PlanningCenterPeopleService(core);

    await service.deletePlanPerson("pp-123", {
      personId: "person-456",
    });

    expect(request).toHaveBeenCalledWith(
      "/services/v2/people/person-456/plan_people/pp-123",
      { method: "DELETE" }
    );
  });
});
