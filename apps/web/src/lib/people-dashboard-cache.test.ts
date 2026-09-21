import type {
  PeopleDashboardData,
  PeopleDashboardPersonDetail,
} from "@worship-admin/contracts/people-schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearCachedPeopleDashboards,
  readCachedPeopleDashboard,
  readCachedPeopleDashboardPerson,
  writeCachedPeopleDashboard,
  writeCachedPeopleDashboardPerson,
} from "@/lib/people-dashboard-cache";

const installLocalStorageMock = () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      get length() {
        return storage.size;
      },
      getItem: (key: string) => storage.get(key) ?? null,
      key: (index: number) => [...storage.keys()][index] ?? null,
      removeItem: (key: string) => {
        storage.delete(key);
      },
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
  });
};

const dashboard = (
  overrides: Partial<PeopleDashboardData> = {}
): PeopleDashboardData => ({
  range: "month",
  generatedAt: "2026-05-23T12:00:00.000Z",
  month: {
    year: 2026,
    monthIndex: 4,
    label: "May 2026",
    daysInMonth: 31,
    startsOnWeekday: 5,
  },
  people: [
    {
      id: "person-1",
      name: "Andrew Hinea",
      initials: "AH",
      photoThumbnailUrl: null,
      teams: ["Band"],
      roles: "Acoustic Guitar",
      status: "Available soon",
      load: "normal",
      lastServed: "May 17",
      nextScheduled: "May 31",
      monthCount: 2,
      thirtyDayCount: 2,
      ninetyDayCount: 5,
      upcomingCount: 1,
      streak: "2 this month",
      highlight: "Available soon",
      monthDays: [
        {
          day: 31,
          kind: "service",
          positionName: "Acoustic Guitar",
          serviceTypeName: "Agape Worship Services",
          status: "U",
          planUrl: "/services/service-type-1/plans/plan-1/lineup",
        },
      ],
    },
  ],
  stats: {
    scheduledPeople: 1,
    highLoadPeople: 0,
    availableSoonPeople: 1,
  },
  monthDays: [
    {
      day: 31,
      serviceCount: 1,
      confirmedServiceCount: 0,
      potentialServiceCount: 1,
      rehearsalCount: 0,
      blockoutCount: 0,
    },
  ],
  matrixDays: [31],
  requestBudget: {
    teamRequests: 1,
    scheduleRequests: 1,
    blockoutRequests: 1,
    rosterPeopleCount: 1,
    hydratedPeopleCount: 1,
    sampled: false,
  },
  ...overrides,
});

const personDetail = (): PeopleDashboardPersonDetail => ({
  generatedAt: "2026-05-23T12:10:00.000Z",
  month: dashboard().month,
  previousMonth: "2026-04",
  nextMonth: "2026-06",
  person: dashboard().people[0],
  trend: [
    {
      month: "2026-05",
      label: "May",
      services: 2,
      rehearsals: 1,
    },
  ],
  requestBudget: {
    scheduleRequests: 1,
    blockoutRequests: 1,
  },
});

describe("people dashboard cache", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    installLocalStorageMock();
  });

  it("round-trips dashboard data with the original saved timestamp", () => {
    const savedAt = new Date("2026-05-23T12:05:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(savedAt);

    writeCachedPeopleDashboard(dashboard());

    expect(readCachedPeopleDashboard("month")).toStrictEqual({
      savedAt,
      data: dashboard(),
    });
  });

  it("ignores cache entries for a different range", () => {
    writeCachedPeopleDashboard(dashboard({ range: "30" }));

    expect(readCachedPeopleDashboard("month")).toBeUndefined();
    expect(readCachedPeopleDashboard("30")?.data.range).toBe("30");
  });

  it("clears all people dashboard snapshots without touching unrelated storage", () => {
    writeCachedPeopleDashboard(dashboard());
    writeCachedPeopleDashboard(dashboard({ range: "90" }));
    writeCachedPeopleDashboardPerson("person-1", "2026-05", personDetail());
    window.localStorage.setItem("unrelated", "keep");

    clearCachedPeopleDashboards();

    expect(readCachedPeopleDashboard("month")).toBeUndefined();
    expect(readCachedPeopleDashboard("90")).toBeUndefined();
    expect(
      readCachedPeopleDashboardPerson("person-1", "2026-05")
    ).toBeUndefined();
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
  });

  it("round-trips person detail snapshots with the saved timestamp", () => {
    const savedAt = new Date("2026-05-23T12:15:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(savedAt);

    writeCachedPeopleDashboardPerson("person-1", "2026-05", personDetail());

    expect(
      readCachedPeopleDashboardPerson("person-1", "2026-05")
    ).toStrictEqual({
      savedAt,
      data: personDetail(),
    });
  });

  it("does not read a different person or month detail snapshot", () => {
    writeCachedPeopleDashboardPerson("person-1", "2026-05", personDetail());

    expect(
      readCachedPeopleDashboardPerson("person-2", "2026-05")
    ).toBeUndefined();
    expect(
      readCachedPeopleDashboardPerson("person-1", "2026-06")
    ).toBeUndefined();
  });

  it("ignores invalid person detail snapshots", () => {
    window.localStorage.setItem(
      "worshipadmin:people-dashboard:v1:person:person-1:2026-05",
      JSON.stringify({
        savedAt: Date.now(),
        data: { person: { id: "person-1" } },
      })
    );

    expect(
      readCachedPeopleDashboardPerson("person-1", "2026-05")
    ).toBeUndefined();
  });

  it("isolates presentation storage from live data and other seeds (readCachedPeopleDashboard)", () => {
    const dataset = { presentationScope: "live" };
    vi.stubGlobal("document", { documentElement: { dataset } });
    writeCachedPeopleDashboard(dashboard());
    expect(readCachedPeopleDashboard("month")).toBeDefined();
    dataset.presentationScope = "present-v1-seed-a";
    expect(readCachedPeopleDashboard("month")).toBeUndefined();
    writeCachedPeopleDashboard(dashboard());
    expect(readCachedPeopleDashboard("month")).toBeDefined();
    dataset.presentationScope = "present-v1-seed-b";
    expect(readCachedPeopleDashboard("month")).toBeUndefined();
    dataset.presentationScope = "live";
    expect(readCachedPeopleDashboard("month")).toBeDefined();
    vi.unstubAllGlobals();
  });

  it("isolates presentation storage from live data and other seeds (readCachedPeopleDashboardPerson)", () => {
    const dataset = { presentationScope: "live" };
    vi.stubGlobal("document", { documentElement: { dataset } });
    writeCachedPeopleDashboardPerson("person-1", "2026-05", personDetail());
    expect(
      readCachedPeopleDashboardPerson("person-1", "2026-05")
    ).toBeDefined();
    dataset.presentationScope = "present-v1-seed-a";
    expect(
      readCachedPeopleDashboardPerson("person-1", "2026-05")
    ).toBeUndefined();
    writeCachedPeopleDashboardPerson("person-1", "2026-05", personDetail());
    expect(
      readCachedPeopleDashboardPerson("person-1", "2026-05")
    ).toBeDefined();
    dataset.presentationScope = "present-v1-seed-b";
    expect(
      readCachedPeopleDashboardPerson("person-1", "2026-05")
    ).toBeUndefined();
    dataset.presentationScope = "live";
    expect(
      readCachedPeopleDashboardPerson("person-1", "2026-05")
    ).toBeDefined();
    vi.unstubAllGlobals();
  });
});
