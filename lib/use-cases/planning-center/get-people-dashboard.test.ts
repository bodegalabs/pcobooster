import { afterEach, describe, expect, it, vi } from "vitest";

import type { PCResource } from "@/lib/types";
import { getPeopleDashboard } from "@/lib/use-cases/planning-center/get-people-dashboard";

vi.mock("@/lib/planning-center/resolve-organization-timezone", () => ({
  resolveOrganizationTimeZone: vi.fn(() => Promise.resolve("UTC")),
}));

function person(id: string, firstName: string, lastName: string): PCResource {
  return {
    id,
    type: "Person",
    attributes: {
      first_name: firstName,
      last_name: lastName,
    },
  };
}

function schedule(id: string, startsAt: string): PCResource {
  return {
    id,
    type: "Schedule",
    attributes: {
      sort_date: startsAt,
      status: "C",
      team_position_name: "Vocals",
      service_type_name: "Sunday",
    },
  };
}

describe("getPeopleDashboard", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hydrates a bounded roster sample for the initial dashboard response", async () => {
    vi.useFakeTimers({ now: new Date("2026-05-23T12:00:00.000Z") });
    const getAllPeopleFromTeams = vi.fn().mockResolvedValue({
      people: [
        person("person-3", "Casey", "Carter"),
        person("person-1", "Alex", "Adams"),
        person("person-2", "Blair", "Baker"),
      ],
      included: [],
      teamNamesByPersonId: new Map([
        ["person-1", new Set(["Band"])],
        ["person-2", new Set(["Band"])],
        ["person-3", new Set(["Band"])],
      ]),
    });
    const getPersonSchedules = vi.fn(async (personId: string) => ({
      data:
        personId === "person-1"
          ? [schedule("schedule-1", "2026-05-31T17:00:00.000Z")]
          : [],
      included: [],
    }));

    const dashboard = await getPeopleDashboard({
      maxHydratedPeople: 2,
      peopleService: {
        getAllPeopleFromTeams,
        getPersonSchedules,
      },
    });

    expect(getPersonSchedules).toHaveBeenCalledTimes(2);
    expect(getPersonSchedules.mock.calls.map(([personId]) => personId)).toEqual(
      ["person-1", "person-2"]
    );
    expect(dashboard.people.map((person) => person.id)).toEqual([
      "person-1",
      "person-2",
    ]);
    expect(dashboard.requestBudget).toMatchObject({
      rosterPeopleCount: 3,
      hydratedPeopleCount: 2,
      scheduleRequests: 2,
      sampled: true,
    });
    expect(dashboard.stats.scheduledPeople).toBe(1);
  });
});
