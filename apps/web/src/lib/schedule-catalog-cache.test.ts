import type {
  Plan,
  ServiceType,
} from "@worship-admin/planning-center-models/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearCachedScheduleCatalog,
  readCachedPlans,
  readCachedPlansEntry,
  readCachedServiceTypes,
  readCachedServiceTypesEntry,
  writeCachedPlans,
  writeCachedServiceTypes,
} from "@/lib/schedule-catalog-cache";

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

const serviceTypes = (): ServiceType[] => [
  { id: "st-1", name: "Agape Worship Services", sequence: 1 },
  { id: "st-2", name: "Children's Ministry", sequence: 2 },
];

const plans = (): Plan[] => [
  {
    id: "plan-1",
    title: "May 31",
    seriesTitle: undefined,
    seriesId: "series-1",
    planningCenterUrl: "https://example.com/plan-1",
    createdAt: new Date("2026-05-01T12:00:00.000Z"),
    sortDate: new Date("2026-05-31T16:00:00.000Z"),
  },
];

describe("schedule catalog cache", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    installLocalStorageMock();
  });

  it("round-trips service types", () => {
    const savedAt = new Date("2026-05-23T12:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(savedAt);

    writeCachedServiceTypes(serviceTypes());

    expect(readCachedServiceTypes()).toStrictEqual(serviceTypes());
    expect(readCachedServiceTypesEntry()?.savedAt).toBe(savedAt);
  });

  it("round-trips plans and restores date fields", () => {
    const savedAt = new Date("2026-05-23T12:05:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(savedAt);

    writeCachedPlans("st-1", plans());

    const cached = readCachedPlans("st-1");
    const cachedEntry = readCachedPlansEntry("st-1");

    expect(cachedEntry?.savedAt).toBe(savedAt);
    expect(cached?.[0].id).toBe("plan-1");
    expect(cached?.[0].createdAt).toBeInstanceOf(Date);
    expect(cached?.[0].sortDate).toBeInstanceOf(Date);
    expect(cached?.[0].sortDate?.toISOString()).toBe(
      "2026-05-31T16:00:00.000Z"
    );
  });

  it("does not read plans without a service type id", () => {
    expect(readCachedPlans(null)).toBeUndefined();
  });

  it("clears schedule catalog snapshots without touching unrelated storage", () => {
    writeCachedServiceTypes(serviceTypes());
    writeCachedPlans("st-1", plans());
    window.localStorage.setItem("unrelated", "keep");

    clearCachedScheduleCatalog();

    expect(readCachedServiceTypes()).toBeUndefined();
    expect(readCachedPlans("st-1")).toBeUndefined();
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
  });
});
