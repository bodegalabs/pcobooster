import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCachedPeopleSearch,
  normalizePeopleSearchQuery,
  readCachedPeopleSearch,
  writeCachedPeopleSearch,
} from "@/lib/people-search-cache";
import type { PeopleSearchResult } from "@/hooks/use-people-search";

function installLocalStorageMock() {
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
}

function people(): PeopleSearchResult[] {
  return [
    {
      id: "person-1",
      firstName: "Andrew",
      lastName: "Hinea",
      fullName: "Andrew Hinea",
      photoThumbnailUrl: "https://example.com/andrew.jpg",
    },
    {
      id: "person-2",
      firstName: "Mina",
      lastName: "Lee",
      fullName: "Mina Lee",
      photoThumbnailUrl: null,
    },
  ];
}

describe("people search cache", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    installLocalStorageMock();
  });

  it("normalizes query casing and whitespace", () => {
    expect(normalizePeopleSearchQuery("  Andrew H  ")).toBe("andrew h");
  });

  it("round-trips people search results with the saved timestamp", () => {
    const savedAt = new Date("2026-05-23T17:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(savedAt);

    writeCachedPeopleSearch("Andrew H", people());

    expect(readCachedPeopleSearch(" andrew h ")).toEqual({
      savedAt,
      data: people(),
    });
  });

  it("does not read a different query snapshot", () => {
    writeCachedPeopleSearch("andrew", people());

    expect(readCachedPeopleSearch("mina")).toBeUndefined();
  });

  it("does not read or write too-short queries", () => {
    writeCachedPeopleSearch("a", people());

    expect(readCachedPeopleSearch("a")).toBeUndefined();
  });

  it("ignores invalid cache payloads", () => {
    window.localStorage.setItem(
      "worshipadmin:people-search:v1:andrew",
      JSON.stringify({ savedAt: Date.now(), data: [{ id: "person-1" }] })
    );

    expect(readCachedPeopleSearch("andrew")).toBeUndefined();
  });

  it("clears people search snapshots without touching unrelated storage", () => {
    writeCachedPeopleSearch("andrew", people());
    writeCachedPeopleSearch("mina", people());
    window.localStorage.setItem("unrelated", "keep");

    clearCachedPeopleSearch();

    expect(readCachedPeopleSearch("andrew")).toBeUndefined();
    expect(readCachedPeopleSearch("mina")).toBeUndefined();
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
  });
  it("isolates presentation storage from live data and other seeds (readCachedPeopleSearch)", () => {
    const dataset = { presentationScope: "live" };
    vi.stubGlobal("document", { documentElement: { dataset } });
    writeCachedPeopleSearch("andrew", people());
    expect(readCachedPeopleSearch("andrew")).toBeDefined();
    dataset.presentationScope = "present-v1-seed-a";
    expect(readCachedPeopleSearch("andrew")).toBeUndefined();
    writeCachedPeopleSearch("andrew", people());
    expect(readCachedPeopleSearch("andrew")).toBeDefined();
    dataset.presentationScope = "present-v1-seed-b";
    expect(readCachedPeopleSearch("andrew")).toBeUndefined();
    dataset.presentationScope = "live";
    expect(readCachedPeopleSearch("andrew")).toBeDefined();
    vi.unstubAllGlobals();
  });

});
