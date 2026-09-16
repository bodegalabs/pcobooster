import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearCachedMyScheduledPlans,
  readCachedMyScheduledPlans,
  writeCachedMyScheduledPlans,
} from "@/lib/my-scheduled-plans-cache";

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

describe("my scheduled plans cache", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    installLocalStorageMock();
  });

  it("round-trips scheduled plan ids with the saved timestamp", () => {
    const savedAt = new Date("2026-05-23T18:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(savedAt);

    writeCachedMyScheduledPlans("plan-1,plan-2", { planIds: ["plan-2"] });

    expect(readCachedMyScheduledPlans("plan-1,plan-2")).toStrictEqual({
      savedAt,
      data: { planIds: ["plan-2"] },
    });
  });

  it("does not read a different plan lookup snapshot", () => {
    writeCachedMyScheduledPlans("plan-1,plan-2", { planIds: ["plan-2"] });

    expect(readCachedMyScheduledPlans("plan-1,plan-3")).toBeUndefined();
  });

  it("ignores invalid cache payloads", () => {
    window.localStorage.setItem(
      "worshipadmin:my-scheduled-plans:v1:plan-1%2Cplan-2",
      JSON.stringify({ savedAt: Date.now(), data: { planIds: [2] } })
    );

    expect(readCachedMyScheduledPlans("plan-1,plan-2")).toBeUndefined();
  });

  it("clears scheduled-plan snapshots without touching unrelated storage", () => {
    writeCachedMyScheduledPlans("plan-1,plan-2", { planIds: ["plan-2"] });
    writeCachedMyScheduledPlans("plan-3,plan-4", { planIds: ["plan-3"] });
    window.localStorage.setItem("unrelated", "keep");

    clearCachedMyScheduledPlans();

    expect(readCachedMyScheduledPlans("plan-1,plan-2")).toBeUndefined();
    expect(readCachedMyScheduledPlans("plan-3,plan-4")).toBeUndefined();
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
  });
});
