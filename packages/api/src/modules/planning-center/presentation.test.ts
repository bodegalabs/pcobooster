import type { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import type {
  Blockout,
  PersonWithAvailability,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import {
  getPresentationSeed,
  getPresentationCacheScope,
  isPresentationMode,
} from "@pcobooster/presentation-mode";
import type { PresentationEnvironment } from "@pcobooster/presentation-mode";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PeopleDashboardData,
  PeopleDashboardPerson,
  PeopleDashboardPersonDetail,
} from "./people-dashboard-types";
import {
  getPresentationIdentityMapper,
  presentBlockouts,
  presentDashboard,
  presentDashboardPerson,
  presentPeople,
  presentTeamPositions,
  presentationIdentity,
} from "./presentation";
import { searchPeople } from "./search-people";

let environment: PresentationEnvironment = {};
const setEnvironment = (key: keyof PresentationEnvironment, value?: string) => {
  environment = { ...environment, [key]: value };
};

const createDependencies = () => {
  const catalog = {
    getOrganization: vi
      .fn<PlanningCenterCatalogService["getOrganization"]>()
      .mockResolvedValue({
        id: "org-1",
        type: "Organization",
        attributes: { name: "My Organization" },
      }),
  };
  const people = {
    getCacheScope: () => "presentation-test",
    getAllPeople: vi.fn<PlanningCenterPeopleService["getAllPeople"]>(),
    searchPeopleByName:
      vi.fn<PlanningCenterPeopleService["searchPeopleByName"]>(),
  };
  const presentation = {
    catalog,
    people,
    getPresentationSeed: () => getPresentationSeed(environment),
    isPresentationMode: () => isPresentationMode(environment),
  };
  const search = {
    people,
    getIdentityMapper: async () =>
      await getPresentationIdentityMapper(presentation),
  };
  return { catalog, people, presentation, search };
};
let dependencies = createDependencies();

const blockout: Blockout = {
  id: "blockout-1",
  reason: "Private Reason",
  description: "Private Description",
  startsAt: new Date("2026-09-16"),
  endsAt: new Date("2026-09-17"),
  share: true,
  timeZone: "America/Los_Angeles",
};
const groups: TeamPositionGroup[] = [
  {
    teamId: "band",
    teamName: "Band",
    positions: [
      {
        id: "vocals",
        name: "Vocals",
        teamId: "band",
        filledPeople: [
          {
            id: "plan-person-1",
            planPersonId: "plan-person-1",
            personId: "person-1",
            name: "Private Name",
            status: "confirmed",
            rawStatus: "C",
            photoThumbnailUrl: "https://private/photo",
          },
        ],
      },
    ],
  },
];
const people: PersonWithAvailability[] = [
  {
    id: "person-1",
    firstName: "Private",
    lastName: "Name",
    fullName: "Private Name",
    photoUrl: "https://private/full",
    photoThumbnailUrl: "https://private/photo",
    archived: false,
    positions: groups[0].positions,
    blockouts: [blockout],
    selectedPlanDeclineReason: "Private Reason",
    availability: "blocked",
    recommendationScore: 42,
  },
];
const dashboardPerson: PeopleDashboardPerson = {
  id: "person-1",
  name: "Private Name",
  initials: "PN",
  photoThumbnailUrl: "https://private/photo",
  teams: ["Band"],
  roles: "Vocals",
  status: "Scheduled",
  load: "normal",
  lastServed: "Sep 9",
  nextScheduled: "Sep 23",
  monthCount: 1,
  thirtyDayCount: 1,
  ninetyDayCount: 3,
  upcomingCount: 1,
  streak: "1 this month",
  highlight: "Healthy cadence",
  monthDays: [],
};
const dashboard: PeopleDashboardData = {
  range: "month",
  generatedAt: "2026-09-16",
  people: [dashboardPerson],
  month: {
    year: 2026,
    monthIndex: 8,
    label: "September",
    daysInMonth: 30,
    startsOnWeekday: 2,
  },
  stats: { scheduledPeople: 1, highLoadPeople: 0, availableSoonPeople: 0 },
  monthDays: [],
  matrixDays: [],
  requestBudget: {
    teamRequests: 1,
    scheduleRequests: 1,
    blockoutRequests: 1,
    rosterPeopleCount: 1,
    hydratedPeopleCount: 1,
    sampled: false,
  },
};
const detail: PeopleDashboardPersonDetail = {
  generatedAt: "2026-09-16",
  month: dashboard.month,
  previousMonth: "2026-08",
  nextMonth: "2026-10",
  person: dashboardPerson,
  trend: [],
  requestBudget: { scheduleRequests: 1, blockoutRequests: 1 },
};

const setupPresentationEnvironment = () => {
  environment = {
    NODE_ENV: "development",
    PRESENTATION_MODE: "1",
    PRESENTATION_SEED: "test-seed",
  };
  dependencies = createDependencies();
};

describe("presentation mode", () => {
  beforeEach(setupPresentationEnvironment);

  it("ignores the flag in production", async () => {
    setEnvironment("NODE_ENV", "production");
    expect(isPresentationMode(environment)).toBeFalsy();
    expect(getPresentationCacheScope(environment)).toBe("live");
    await expect(
      presentPeople(people, dependencies.presentation)
    ).resolves.toBe(people);
    expect(dependencies.catalog.getOrganization).not.toHaveBeenCalled();
  });

  it.each(["development", "test", undefined])(
    "enables the flag outside production (NODE_ENV=%s)",
    (nodeEnvironment) => {
      setEnvironment("NODE_ENV", nodeEnvironment);
      expect(isPresentationMode(environment)).toBeTruthy();
      expect(getPresentationCacheScope(environment)).toMatch(/^present-v1-/u);
    }
  );

  it("does not enable without the flag", () => {
    setEnvironment("PRESENTATION_MODE", "0");
    expect(isPresentationMode(environment)).toBeFalsy();
  });

  it("keeps aliases deterministic, scoped by organization, person, and seed", () => {
    const alias = presentationIdentity("org-1", "person-1", "test-seed");
    expect(alias).toStrictEqual(
      presentationIdentity("org-1", "person-1", "test-seed")
    );
    expect(alias).not.toStrictEqual(
      presentationIdentity("org-2", "person-1", "test-seed")
    );
    expect(alias).not.toStrictEqual(
      presentationIdentity("org-1", "person-2", "test-seed")
    );
    expect(alias).not.toStrictEqual(
      presentationIdentity("org-1", "person-1", "other-seed")
    );
    const cacheScope = getPresentationCacheScope(environment);
    setEnvironment("PRESENTATION_SEED", "other-seed");
    expect(getPresentationCacheScope(environment)).not.toBe(cacheScope);
  });

  it("isolates organization caches for independent services sharing a scope", async () => {
    const otherDependencies = createDependencies();
    otherDependencies.catalog.getOrganization.mockResolvedValue({
      id: "org-2",
      type: "Organization",
      attributes: { name: "Another Organization" },
    });
    const [first, second] = await Promise.all([
      presentPeople(people, dependencies.presentation),
      presentPeople(people, otherDependencies.presentation),
    ]);
    expect(first[0]).toMatchObject(
      presentationIdentity("org-1", "person-1", "test-seed")
    );
    expect(second[0]).toMatchObject(
      presentationIdentity("org-2", "person-1", "test-seed")
    );
  });

  it("masks every person view consistently without changing source data or scheduling fields", async () => {
    const original = structuredClone({
      people,
      groups,
      dashboard,
      detail,
      blockout,
    });
    const [candidates, roster, overview, personDetail] = await Promise.all([
      presentPeople(people, dependencies.presentation),
      presentTeamPositions(groups, dependencies.presentation),
      presentDashboard(dashboard, dependencies.presentation),
      presentDashboardPerson(detail, dependencies.presentation),
    ]);
    const alias = candidates[0].fullName;
    expect({
      names: [
        roster[0].positions[0].filledPeople?.[0]?.name,
        overview.people[0].name,
        personDetail.person.name,
      ],
      initials: personDetail.person.initials,
      candidate: candidates[0],
      roster: roster[0],
    }).toMatchObject({
      names: [alias, alias, alias],
      initials: candidates[0].firstName[0] + candidates[0].lastName[0],
      candidate: {
        id: "person-1",
        photoUrl: null,
        photoThumbnailUrl: null,
        availability: "blocked",
        recommendationScore: 42,
      },
      roster: { teamId: "band", teamName: "Band" },
    });
    const serialized = JSON.stringify([
      candidates,
      roster,
      overview,
      personDetail,
      presentBlockouts([blockout], true),
    ]);
    expect(serialized).not.toContain("Private");
    expect(serialized).not.toContain("https://private");
    expect({ people, groups, dashboard, detail, blockout }).toStrictEqual(
      original
    );
    expect(dependencies.catalog.getOrganization).toHaveBeenCalledOnce();
  });

  it("masks guest roster names and photos even without a person relationship", async () => {
    const guests = structuredClone(groups);
    const guest = guests[0].positions[0].filledPeople?.[0];
    if (!guest) {
      throw new Error("Expected a filled guest position");
    }
    guest.personId = null;
    const result = await presentTeamPositions(
      guests,
      dependencies.presentation
    );
    expect(result[0].positions[0].filledPeople?.[0]).toMatchObject({
      name: "Guest volunteer",
      photoThumbnailUrl: null,
    });
  });

  it("fails closed when organization identity cannot be resolved", async () => {
    dependencies.catalog.getOrganization.mockRejectedValueOnce(
      new Error("Unavailable")
    );
    await expect(
      presentPeople(people, dependencies.presentation)
    ).rejects.toThrow("Unavailable");
  });

  it("preserves normal-mode data, including notes and photos", async () => {
    setEnvironment("PRESENTATION_MODE", "0");
    await expect(
      presentPeople(people, dependencies.presentation)
    ).resolves.toBe(people);
    await expect(
      presentTeamPositions(groups, dependencies.presentation)
    ).resolves.toBe(groups);
    await expect(
      presentDashboard(dashboard, dependencies.presentation)
    ).resolves.toBe(dashboard);
    await expect(
      presentDashboardPerson(detail, dependencies.presentation)
    ).resolves.toBe(detail);
    const blockouts = [blockout];
    expect(presentBlockouts(blockouts, false)).toBe(blockouts);
  });
});

describe("people search", () => {
  beforeEach(setupPresentationEnvironment);
  const resources = [
    {
      id: "person-1",
      type: "Person",
      attributes: {
        first_name: "Private",
        last_name: "Name",
        avatar: "https://private/photo",
      },
    },
  ];

  it("searches the displayed aliases, never real names or upstream name search", async () => {
    dependencies.people.getAllPeople.mockResolvedValue(resources);
    const presentedPeople = await presentPeople(
      people,
      dependencies.presentation
    );
    const alias = presentedPeople[0].fullName;
    const results = await searchPeople(
      alias.toLowerCase(),
      15,
      dependencies.search
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "person-1",
      fullName: alias,
      photoThumbnailUrl: null,
    });
    await expect(
      searchPeople("Private Name", 15, dependencies.search)
    ).resolves.toStrictEqual([]);
    expect(dependencies.people.searchPeopleByName).not.toHaveBeenCalled();
    expect(JSON.stringify(results)).not.toContain("Private");
  });

  it("keeps the existing upstream search and real avatar in normal mode", async () => {
    setEnvironment("PRESENTATION_MODE", "0");
    dependencies.people.searchPeopleByName.mockResolvedValue(resources);
    await expect(
      searchPeople("Private", 15, dependencies.search)
    ).resolves.toStrictEqual([
      {
        id: "person-1",
        firstName: "Private",
        lastName: "Name",
        fullName: "Private Name",
        photoThumbnailUrl: "https://private/photo",
      },
    ]);
    expect(dependencies.people.searchPeopleByName).toHaveBeenCalledWith(
      "Private",
      15,
      undefined
    );
    expect(dependencies.people.getAllPeople).not.toHaveBeenCalled();
  });
});

describe(getPresentationIdentityMapper, () => {
  beforeEach(setupPresentationEnvironment);

  it("passes its request signal through the organization cache loader", async () => {
    const controller = new AbortController();

    await getPresentationIdentityMapper(
      dependencies.presentation,
      controller.signal
    );

    expect(dependencies.catalog.getOrganization).toHaveBeenCalledWith(
      expect.any(AbortSignal)
    );
  });
});
