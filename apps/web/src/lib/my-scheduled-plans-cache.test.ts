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

    writeCachedMyScheduledPlans({ planIds: ["plan-2"] });

    expect(readCachedMyScheduledPlans()).toStrictEqual({
      savedAt,
      data: { planIds: ["plan-2"] },
    });
  });

  it("ignores invalid cache payloads", () => {
    window.localStorage.setItem(
      "pcobooster:my-scheduled-plans:v2",
      JSON.stringify({ savedAt: Date.now(), data: { planIds: [2] } })
    );

    expect(readCachedMyScheduledPlans()).toBeUndefined();
  });

  it("clears scheduled plans and v1 snapshots without touching unrelated storage", () => {
    writeCachedMyScheduledPlans({ planIds: ["plan-2"] });
    window.localStorage.setItem(
      "pcobooster:my-scheduled-plans:v1:plan-1%2Cplan-2",
      JSON.stringify({ savedAt: Date.now(), data: { planIds: ["plan-2"] } })
    );
    window.localStorage.setItem("unrelated", "keep");

    clearCachedMyScheduledPlans();

    expect(readCachedMyScheduledPlans()).toBeUndefined();
    expect(
      window.localStorage.getItem(
        "pcobooster:my-scheduled-plans:v1:plan-1%2Cplan-2"
      )
    ).toBeNull();
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
  });
});
