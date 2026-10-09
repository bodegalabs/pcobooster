import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearCachedPlanningCenterAccess,
  readCachedPlanningCenterAccess,
  writeCachedPlanningCenterAccess,
} from "@/lib/planning-center-access-cache";

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

/** A saved snapshot as JSON, with `services` as given. */
const savedSnapshotJson = (services: { status: string }) =>
  JSON.stringify({
    savedAt: 1,
    data: { services, people: { status: "granted" } },
  });

describe("Planning Center access cache", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    installLocalStorageMock();
  });

  it("keeps each account's permissions apart and forgets them all on clear", () => {
    const savedAt = new Date("2026-10-08T18:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(savedAt);

    writeCachedPlanningCenterAccess("account-a", {
      services: { status: "none" },
      people: { status: "granted" },
    });
    const saved = {
      a: readCachedPlanningCenterAccess("account-a"),
      b: readCachedPlanningCenterAccess("account-b"),
    };
    clearCachedPlanningCenterAccess();

    expect({
      ...saved,
      afterClear: readCachedPlanningCenterAccess("account-a"),
    }).toStrictEqual({
      a: {
        savedAt,
        data: { services: { status: "none" }, people: { status: "granted" } },
      },
      b: undefined,
      afterClear: undefined,
    });
  });

  it("drops a saved snapshot that no longer decodes and keeps one that does", () => {
    window.localStorage.setItem(
      "pcobooster:planning-center-access:v1:account-a",
      savedSnapshotJson({ status: "maybe" })
    );
    window.localStorage.setItem(
      "pcobooster:planning-center-access:v1:account-b",
      savedSnapshotJson({ status: "none" })
    );

    expect({
      a: readCachedPlanningCenterAccess("account-a"),
      b: readCachedPlanningCenterAccess("account-b"),
    }).toStrictEqual({
      a: undefined,
      b: {
        savedAt: 1,
        data: { services: { status: "none" }, people: { status: "granted" } },
      },
    });
  });
});
