import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearCachedPeople,
  readCachedPeople,
  writeCachedPeople,
} from "@/lib/people-cache";
import type { PersonWithAvailability } from "@/lib/types";

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

const people = (): PersonWithAvailability[] => [
  {
    id: "person-1",
    firstName: "Andrew",
    lastName: "Hinea",
    fullName: "Andrew Hinea",
    photoUrl: null,
    photoThumbnailUrl: "https://example.com/andrew.jpg",
    archived: false,
    positions: [
      {
        id: "position-1",
        name: "Vocal",
        teamId: "team-1",
        teamName: "Vocals",
      },
    ],
    availability: "available",
    frequency: {
      recentServedDays: 1,
      last60Days: 2,
      last90Days: 3,
      totalServed: 7,
      recentRehearsalOnlyDays: 1,
      rehearsalLast60Days: 2,
      rehearsalLast90Days: 3,
      totalRehearsals: 4,
      upcomingServices: 1,
      upcomingRehearsals: 1,
      lastServedDate: new Date("2026-05-17T16:00:00.000Z"),
      nextUpcomingDate: new Date("2026-05-31T16:00:00.000Z"),
      lastRehearsalDate: new Date("2026-05-16T16:00:00.000Z"),
      nextRehearsalDate: new Date("2026-05-30T16:00:00.000Z"),
    },
    serviceHistory: [
      {
        id: "history-1",
        sourceScheduleId: "schedule-1",
        date: new Date("2026-05-17T16:00:00.000Z"),
        teamPositionName: "Vocal",
        teamName: "Vocals",
        serviceTypeName: "Agape Worship Services",
        planTitle: "May 17",
        status: "C",
        timeType: "service",
      },
    ],
    isBlockedForDate: false,
    isScheduledForSelectedPlanPosition: false,
    isConfirmedForSelectedPlanPosition: false,
    isDeclinedForSelectedPlanPosition: false,
    selectedPlanDeclineReason: null,
    selectedPlanAssignmentLabels: ["Acoustic Guitar"],
    scheduledPlanPersonId: "plan-person-1",
    recommendationScore: 91,
    recommendationReasoning: ["Light recent schedule"],
  },
];

describe("people cache", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    installLocalStorageMock();
  });

  it("round-trips people snapshots with the saved timestamp", () => {
    const savedAt = new Date("2026-05-23T15:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(savedAt);

    writeCachedPeople(
      "st-1",
      "team-1",
      "position-1",
      "plan-1",
      "2026-05-31",
      people()
    );

    const cached = readCachedPeople(
      "st-1",
      "team-1",
      "position-1",
      "plan-1",
      "2026-05-31"
    );

    expect(cached?.savedAt).toBe(savedAt);
    expect(cached?.data[0].fullName).toBe("Andrew Hinea");
    expect(cached?.data[0].serviceHistory?.[0]?.date).toStrictEqual(
      new Date("2026-05-17T16:00:00.000Z")
    );
    expect(cached?.data[0].frequency?.nextUpcomingDate).toStrictEqual(
      new Date("2026-05-31T16:00:00.000Z")
    );
  });

  it("does not read a different slot or date snapshot", () => {
    writeCachedPeople(
      "st-1",
      "team-1",
      "position-1",
      "plan-1",
      "2026-05-31",
      people()
    );

    expect(
      readCachedPeople("st-1", "team-2", "position-1", "plan-1", "2026-05-31")
    ).toBeUndefined();
    expect(
      readCachedPeople("st-1", "team-1", "position-2", "plan-1", "2026-05-31")
    ).toBeUndefined();
    expect(
      readCachedPeople("st-1", "team-1", "position-1", "plan-1", "2026-06-07")
    ).toBeUndefined();
  });

  it("ignores invalid cache payloads", () => {
    window.localStorage.setItem(
      "worshipadmin:people:v1:st-1:team-1:position-1:plan-1:2026-05-31",
      JSON.stringify({ savedAt: Date.now(), data: [{ id: "person-1" }] })
    );

    expect(
      readCachedPeople("st-1", "team-1", "position-1", "plan-1", "2026-05-31")
    ).toBeUndefined();
  });

  it("clears people snapshots without touching unrelated storage", () => {
    writeCachedPeople(
      "st-1",
      "team-1",
      "position-1",
      "plan-1",
      "2026-05-31",
      people()
    );
    writeCachedPeople(
      "st-1",
      "team-1",
      "position-2",
      "plan-1",
      "2026-05-31",
      people()
    );
    window.localStorage.setItem("unrelated", "keep");

    clearCachedPeople();

    expect(
      readCachedPeople("st-1", "team-1", "position-1", "plan-1", "2026-05-31")
    ).toBeUndefined();
    expect(
      readCachedPeople("st-1", "team-1", "position-2", "plan-1", "2026-05-31")
    ).toBeUndefined();
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
  });

  it("isolates presentation storage from live data and other seeds (readCachedPeople)", () => {
    const dataset = { presentationScope: "live" };
    vi.stubGlobal("document", { documentElement: { dataset } });
    writeCachedPeople("st", "team", "position", "plan", "date", people());
    expect(
      readCachedPeople("st", "team", "position", "plan", "date")
    ).toBeDefined();
    dataset.presentationScope = "present-v1-seed-a";
    expect(
      readCachedPeople("st", "team", "position", "plan", "date")
    ).toBeUndefined();
    writeCachedPeople("st", "team", "position", "plan", "date", people());
    expect(
      readCachedPeople("st", "team", "position", "plan", "date")
    ).toBeDefined();
    dataset.presentationScope = "present-v1-seed-b";
    expect(
      readCachedPeople("st", "team", "position", "plan", "date")
    ).toBeUndefined();
    dataset.presentationScope = "live";
    expect(
      readCachedPeople("st", "team", "position", "plan", "date")
    ).toBeDefined();
    vi.unstubAllGlobals();
  });
});
