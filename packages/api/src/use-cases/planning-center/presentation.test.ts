import type { planningCenterCatalogService } from "@worship-admin/api/planning-center/services/catalog-service";
import type { planningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import {
  getPresentationCacheScope,
  isPresentationMode,
} from "@worship-admin/api/presentation-mode";
import type {
  Blockout,
  PersonWithAvailability,
  TeamPositionGroup,
} from "@worship-admin/planning-center-models/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const createDependencies = () => {
  const catalog = {
    getOrganization: vi
      .fn<typeof planningCenterCatalogService.getOrganization>()
      .mockResolvedValue({
        id: "org-1",
        type: "Organization",
        attributes: { name: "My Organization" },
      }),
  };
  const people = {
    getCacheScope: () => "presentation-test",
    getAllPeople: vi.fn<typeof planningCenterPeopleService.getAllPeople>(),
    searchPeopleByName:
      vi.fn<typeof planningCenterPeopleService.searchPeopleByName>(),
  };
  const presentation = { catalog, people };
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
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("PRESENTATION_MODE", "1");
  vi.stubEnv("PRESENTATION_SEED", "test-seed");
  dependencies = createDependencies();
};

describe("presentation mode", () => {
  beforeEach(setupPresentationEnvironment);
  afterEach(() => vi.unstubAllEnvs());

  it.each(["production", "test"])(
    "ignores the flag in %s",
    async (environment) => {
      vi.stubEnv("NODE_ENV", environment);
      expect(isPresentationMode()).toBeFalsy();
      expect(getPresentationCacheScope()).toBe("live");
      await expect(
        presentPeople(people, dependencies.presentation)
      ).resolves.toBe(people);
      expect(dependencies.catalog.getOrganization).not.toHaveBeenCalled();
    }
  );

  it("does not enable on Vercel or without the flag", () => {
    vi.stubEnv("VERCEL", "1");
    expect(isPresentationMode()).toBeFalsy();
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("PRESENTATION_MODE", "0");
    expect(isPresentationMode()).toBeFalsy();
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
    const cacheScope = getPresentationCacheScope();
    vi.stubEnv("PRESENTATION_SEED", "other-seed");
    expect(getPresentationCacheScope()).not.toBe(cacheScope);
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
      presentBlockouts([blockout]),
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
    vi.stubEnv("PRESENTATION_MODE", "0");
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
    expect(presentBlockouts(blockouts)).toBe(blockouts);
  });
});

describe("people search", () => {
  beforeEach(setupPresentationEnvironment);
  afterEach(() => vi.unstubAllEnvs());
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
    vi.stubEnv("PRESENTATION_MODE", "0");
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
      15
    );
    expect(dependencies.people.getAllPeople).not.toHaveBeenCalled();
  });
});
