import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getOrganization: vi.fn(), getCacheScope: vi.fn(), getAllPeople: vi.fn(), searchPeopleByName: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/planning-center/services/catalog-service", () => ({
  planningCenterCatalogService: { getOrganization: mocks.getOrganization },
}));
vi.mock("@/lib/planning-center/services/people-service", () => ({ planningCenterPeopleService: mocks }));

import { getPresentationCacheScope, isPresentationMode } from "@/lib/presentation-mode";
import type { Blockout, PersonWithAvailability, TeamPositionGroup } from "@/lib/types";
import type { PeopleDashboardData, PeopleDashboardPerson, PeopleDashboardPersonDetail } from "./people-dashboard-types";
import { presentBlockouts, presentDashboard, presentDashboardPerson, presentPeople, presentTeamPositions, presentationIdentity } from "./presentation";
import { searchPeople } from "./search-people";

const blockout: Blockout = {
  id: "blockout-1", reason: "Private Reason", description: "Private Description",
  startsAt: new Date("2026-09-16"), endsAt: new Date("2026-09-17"), share: true, timeZone: "America/Los_Angeles",
};
const groups: TeamPositionGroup[] = [{
  teamId: "band", teamName: "Band", positions: [{
    id: "vocals", name: "Vocals", teamId: "band", filledPeople: [{
      id: "plan-person-1", planPersonId: "plan-person-1", personId: "person-1",
      name: "Private Name", status: "confirmed", rawStatus: "C", photoThumbnailUrl: "https://private/photo",
    }],
  }],
}];
const people: PersonWithAvailability[] = [{
  id: "person-1", firstName: "Private", lastName: "Name", fullName: "Private Name",
  photoUrl: "https://private/full", photoThumbnailUrl: "https://private/photo", archived: false,
  positions: groups[0].positions, blockouts: [blockout], selectedPlanDeclineReason: "Private Reason",
  availability: "blocked", recommendationScore: 42,
}];
const dashboardPerson: PeopleDashboardPerson = {
  id: "person-1", name: "Private Name", initials: "PN", photoThumbnailUrl: "https://private/photo",
  teams: ["Band"], roles: "Vocals", status: "Scheduled", load: "normal", lastServed: "Sep 9",
  nextScheduled: "Sep 23", monthCount: 1, thirtyDayCount: 1, ninetyDayCount: 3, upcomingCount: 1,
  streak: "1 this month", highlight: "Healthy cadence", monthDays: [],
};
const dashboard: PeopleDashboardData = {
  range: "month", generatedAt: "2026-09-16", people: [dashboardPerson],
  month: { year: 2026, monthIndex: 8, label: "September", daysInMonth: 30, startsOnWeekday: 2 },
  stats: { scheduledPeople: 1, highLoadPeople: 0, availableSoonPeople: 0 }, monthDays: [], matrixDays: [],
  requestBudget: { teamRequests: 1, scheduleRequests: 1, blockoutRequests: 1, rosterPeopleCount: 1, hydratedPeopleCount: 1, sampled: false },
};
const detail: PeopleDashboardPersonDetail = {
  generatedAt: "2026-09-16", month: dashboard.month, previousMonth: "2026-08", nextMonth: "2026-10",
  person: dashboardPerson, trend: [], requestBudget: { scheduleRequests: 1, blockoutRequests: 1 },
};
let scope = 0;

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("PRESENTATION_MODE", "1");
  vi.stubEnv("PRESENTATION_SEED", "test-seed");
  mocks.getCacheScope.mockReturnValue(`scope-${scope++}`);
  mocks.getOrganization.mockResolvedValue({ id: "org-1", type: "Organization", attributes: { name: "My Organization" } });
});
afterEach(() => vi.unstubAllEnvs());

describe("presentation mode", () => {
  it.each(["production", "test"])("ignores the flag in %s", async (environment) => {
    vi.stubEnv("NODE_ENV", environment);
    expect(isPresentationMode()).toBe(false);
    expect(getPresentationCacheScope()).toBe("live");
    expect(await presentPeople(people)).toBe(people);
    expect(mocks.getOrganization).not.toHaveBeenCalled();
  });

  it("does not enable on Vercel or without the flag", () => {
    vi.stubEnv("VERCEL", "1");
    expect(isPresentationMode()).toBe(false);
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("PRESENTATION_MODE", "0");
    expect(isPresentationMode()).toBe(false);
  });

  it("keeps aliases deterministic, scoped by organization, person, and seed", () => {
    const alias = presentationIdentity("org-1", "person-1", "test-seed");
    expect(alias).toEqual(presentationIdentity("org-1", "person-1", "test-seed"));
    expect(alias).not.toEqual(presentationIdentity("org-2", "person-1", "test-seed"));
    expect(alias).not.toEqual(presentationIdentity("org-1", "person-2", "test-seed"));
    expect(alias).not.toEqual(presentationIdentity("org-1", "person-1", "other-seed"));
    const cacheScope = getPresentationCacheScope();
    vi.stubEnv("PRESENTATION_SEED", "other-seed");
    expect(getPresentationCacheScope()).not.toBe(cacheScope);
  });

  it("masks every person view consistently without changing source data or scheduling fields", async () => {
    const original = structuredClone({ people, groups, dashboard, detail, blockout });
    const [candidates, roster, overview, personDetail] = await Promise.all([
      presentPeople(people), presentTeamPositions(groups), presentDashboard(dashboard), presentDashboardPerson(detail),
    ]);
    const alias = candidates[0].fullName;
    expect(roster[0].positions[0].filledPeople![0].name).toBe(alias);
    expect(overview.people[0].name).toBe(alias);
    expect(personDetail.person.name).toBe(alias);
    expect(personDetail.person.initials).toBe(candidates[0].firstName[0] + candidates[0].lastName[0]);
    expect(candidates[0]).toMatchObject({ id: "person-1", photoUrl: null, photoThumbnailUrl: null, availability: "blocked", recommendationScore: 42 });
    expect(roster[0]).toMatchObject({ teamId: "band", teamName: "Band" });
    const serialized = JSON.stringify([candidates, roster, overview, personDetail, presentBlockouts([blockout])]);
    expect(serialized).not.toContain("Private");
    expect(serialized).not.toContain("https://private");
    expect({ people, groups, dashboard, detail, blockout }).toEqual(original);
    expect(mocks.getOrganization).toHaveBeenCalledTimes(1);
  });

  it("masks guest roster names and photos even without a person relationship", async () => {
    const guests = structuredClone(groups);
    guests[0].positions[0].filledPeople![0].personId = null;
    const result = await presentTeamPositions(guests);
    expect(result[0].positions[0].filledPeople![0]).toMatchObject({ name: "Guest volunteer", photoThumbnailUrl: null });
  });

  it("fails closed when organization identity cannot be resolved", async () => {
    mocks.getOrganization.mockRejectedValueOnce(new Error("Unavailable"));
    await expect(presentPeople(people)).rejects.toThrow("Unavailable");
  });

  it("preserves normal-mode data, including notes and photos", async () => {
    vi.stubEnv("PRESENTATION_MODE", "0");
    expect(await presentPeople(people)).toBe(people);
    expect(await presentTeamPositions(groups)).toBe(groups);
    expect(await presentDashboard(dashboard)).toBe(dashboard);
    expect(await presentDashboardPerson(detail)).toBe(detail);
    const blockouts = [blockout];
    expect(presentBlockouts(blockouts)).toBe(blockouts);
  });
});

describe("people search", () => {
  const resources = [{ id: "person-1", type: "Person", attributes: { first_name: "Private", last_name: "Name", avatar: "https://private/photo" } }];

  it("searches the displayed aliases, never real names or upstream name search", async () => {
    mocks.getAllPeople.mockResolvedValue(resources);
    const alias = (await presentPeople(people))[0].fullName;
    const results = await searchPeople(alias.toLowerCase());
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: "person-1", fullName: alias, photoThumbnailUrl: null });
    expect(await searchPeople("Private Name")).toEqual([]);
    expect(mocks.searchPeopleByName).not.toHaveBeenCalled();
    expect(JSON.stringify(results)).not.toContain("Private");
  });

  it("keeps the existing upstream search and real avatar in normal mode", async () => {
    vi.stubEnv("PRESENTATION_MODE", "0");
    mocks.searchPeopleByName.mockResolvedValue(resources);
    expect(await searchPeople("Private")).toEqual([{ id: "person-1", firstName: "Private", lastName: "Name", fullName: "Private Name", photoThumbnailUrl: "https://private/photo" }]);
    expect(mocks.searchPeopleByName).toHaveBeenCalledWith("Private", 15);
    expect(mocks.getAllPeople).not.toHaveBeenCalled();
  });
});
