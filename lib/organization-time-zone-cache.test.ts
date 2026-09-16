import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearCachedOrganizationTimeZone,
  readCachedOrganizationTimeZone,
  writeCachedOrganizationTimeZone,
} from "@/lib/organization-time-zone-cache";

function installLocalStorageMock() {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => {
        storage.delete(key);
      },
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
  });
}

describe("organization time zone cache", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    installLocalStorageMock();
  });

  it("round-trips a valid IANA time zone with the saved timestamp", () => {
    const savedAt = new Date("2026-05-23T20:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(savedAt);

    writeCachedOrganizationTimeZone("America/Los_Angeles");

    expect(readCachedOrganizationTimeZone()).toEqual({
      savedAt,
      timeZone: "America/Los_Angeles",
    });
  });

  it("does not cache invalid time zones", () => {
    writeCachedOrganizationTimeZone("not-a-zone");

    expect(readCachedOrganizationTimeZone()).toBeUndefined();
  });

  it("ignores invalid cache payloads", () => {
    window.localStorage.setItem(
      "worshipadmin:organization-time-zone:v1",
      JSON.stringify({ savedAt: Date.now(), timeZone: "not-a-zone" })
    );

    expect(readCachedOrganizationTimeZone()).toBeUndefined();
  });

  it("clears the cached time zone", () => {
    writeCachedOrganizationTimeZone("America/Los_Angeles");

    clearCachedOrganizationTimeZone();

    expect(readCachedOrganizationTimeZone()).toBeUndefined();
  });
});
