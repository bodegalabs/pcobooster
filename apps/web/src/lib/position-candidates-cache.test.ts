import type { PlanWindowHistoryBatch } from "@pcobooster/contracts/people-schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearCachedCandidateSchedules,
  clearCachedPositionCandidates,
  readCachedCandidateAvailability,
  readCachedPlanWindowHistory,
  writeCachedCandidateAvailability,
  writeCachedPlanWindowHistory,
} from "@/lib/position-candidates-cache";

const history: PlanWindowHistoryBatch = {
  generatedAt: "2026-09-20T00:30:00-07:00",
  loadedPlanCount: 0,
  plans: [],
  planTimes: [],
  people: [],
  deferredPlans: [
    { serviceTypeId: "service-1", planId: "plan-1", rosterRequests: 2 },
  ],
  deferredServiceTypeIds: ["service-2"],
  requestBudget: {
    limit: 36,
    planningCenterRequests: 1,
    planRangeRequests: 1,
    rosterRequests: 0,
  },
};

const setScope = (scope: string): void => {
  vi.stubGlobal("document", {
    documentElement: { dataset: { presentationScope: scope } },
  });
};

describe("progressive candidate persistence", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
    vi.spyOn(Date, "now").mockReturnValue(123_456);
  });

  it("persists continuation counts and returns explicit false availability", () => {
    writeCachedPlanWindowHistory(history.generatedAt, [history]);
    writeCachedCandidateAvailability(history.generatedAt, [
      { personId: "person-1", isBlockedForDate: false },
    ]);
    expect(readCachedPlanWindowHistory(history.generatedAt)).toStrictEqual({
      savedAt: 123_456,
      data: [history],
    });
    expect(
      readCachedCandidateAvailability(history.generatedAt, ["person-1"])
    ).toStrictEqual({
      savedAt: 123_456,
      data: [{ personId: "person-1", isBlockedForDate: false }],
    });
    expect(
      readCachedCandidateAvailability(history.generatedAt, [
        "person-1",
        "person-2",
      ])
    ).toBeUndefined();
  });

  it("isolates presentation scopes and preserves availability across schedule invalidation", () => {
    setScope("demo-one");
    writeCachedPlanWindowHistory(history.generatedAt, [history]);
    writeCachedCandidateAvailability(history.generatedAt, [
      { personId: "person-1", isBlockedForDate: true },
    ]);
    setScope("demo-two");
    expect(readCachedPlanWindowHistory(history.generatedAt)).toBeUndefined();
    expect(
      readCachedCandidateAvailability(history.generatedAt, ["person-1"])
    ).toBeUndefined();
    setScope("demo-one");
    clearCachedCandidateSchedules();
    expect(readCachedPlanWindowHistory(history.generatedAt)).toBeUndefined();
    expect(
      readCachedCandidateAvailability(history.generatedAt, ["person-1"])
        ?.data[0]?.isBlockedForDate
    ).toBeTruthy();
    clearCachedPositionCandidates();
    expect(
      readCachedCandidateAvailability(history.generatedAt, ["person-1"])
    ).toBeUndefined();
  });

  it("rejects a missing availability answer instead of turning it into false", () => {
    window.localStorage.setItem(
      "pcobooster:people:v4:availability",
      JSON.stringify({ "day|person-1": { savedAt: 123_456 } })
    );
    expect(
      readCachedCandidateAvailability("day", ["person-1"])
    ).toBeUndefined();
  });
});
