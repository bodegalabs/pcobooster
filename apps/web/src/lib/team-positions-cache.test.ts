import type { TeamPositionGroup } from "@worship-admin/planning-center-models/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearCachedTeamPositions,
  readCachedTeamPositions,
  writeCachedTeamPositions,
} from "@/lib/team-positions-cache";

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

const teamPositionGroups = (): TeamPositionGroup[] => [
  {
    teamId: "team-1",
    teamName: "Vocals",
    positions: [
      {
        id: "position-1",
        name: "Vocal",
        teamId: "team-1",
        teamName: "Vocals",
        neededCount: 2,
        filledPendingCount: 1,
        filledConfirmedCount: 1,
        filledPeople: [
          {
            id: "person-1",
            planPersonId: "plan-person-1",
            name: "Andrew Hinea",
            status: "confirmed",
            rawStatus: "C",
            photoThumbnailUrl: null,
          },
          {
            id: "person-2",
            planPersonId: "plan-person-2",
            name: "Mina Lee",
            status: "pending",
            rawStatus: "U",
            photoThumbnailUrl: "https://example.com/person-2.jpg",
          },
        ],
      },
    ],
  },
];

describe("team positions cache", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    installLocalStorageMock();
  });

  it("round-trips team position groups with the saved timestamp", () => {
    const savedAt = new Date("2026-05-23T14:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(savedAt);

    writeCachedTeamPositions(
      "st-1",
      "plan-1",
      "series-1",
      teamPositionGroups()
    );

    const cached = readCachedTeamPositions("st-1", "plan-1", "series-1");

    expect(cached).toStrictEqual({
      savedAt,
      data: teamPositionGroups(),
    });
  });

  it("does not read a different plan or series snapshot", () => {
    writeCachedTeamPositions(
      "st-1",
      "plan-1",
      "series-1",
      teamPositionGroups()
    );

    expect(
      readCachedTeamPositions("st-1", "plan-2", "series-1")
    ).toBeUndefined();
    expect(readCachedTeamPositions("st-1", "plan-1", null)).toBeUndefined();
    expect(
      readCachedTeamPositions("st-2", "plan-1", "series-1")
    ).toBeUndefined();
  });

  it("ignores invalid cache payloads", () => {
    window.localStorage.setItem(
      "worshipadmin:team-positions:v1:st-1:plan-1:series-1",
      JSON.stringify({ savedAt: Date.now(), data: [{ teamId: "team-1" }] })
    );

    expect(
      readCachedTeamPositions("st-1", "plan-1", "series-1")
    ).toBeUndefined();
  });

  it("clears team-position snapshots without touching unrelated storage", () => {
    writeCachedTeamPositions(
      "st-1",
      "plan-1",
      "series-1",
      teamPositionGroups()
    );
    writeCachedTeamPositions("st-1", "plan-2", null, teamPositionGroups());
    window.localStorage.setItem("unrelated", "keep");

    clearCachedTeamPositions();

    expect(
      readCachedTeamPositions("st-1", "plan-1", "series-1")
    ).toBeUndefined();
    expect(readCachedTeamPositions("st-1", "plan-2", null)).toBeUndefined();
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
  });

  it("isolates presentation storage from live data and other seeds (readCachedTeamPositions)", () => {
    const dataset = { presentationScope: "live" };
    vi.stubGlobal("document", { documentElement: { dataset } });
    writeCachedTeamPositions("st", "plan", null, teamPositionGroups());
    expect(readCachedTeamPositions("st", "plan", null)).toBeDefined();
    dataset.presentationScope = "present-v1-seed-a";
    expect(readCachedTeamPositions("st", "plan", null)).toBeUndefined();
    writeCachedTeamPositions("st", "plan", null, teamPositionGroups());
    expect(readCachedTeamPositions("st", "plan", null)).toBeDefined();
    dataset.presentationScope = "present-v1-seed-b";
    expect(readCachedTeamPositions("st", "plan", null)).toBeUndefined();
    dataset.presentationScope = "live";
    expect(readCachedTeamPositions("st", "plan", null)).toBeDefined();
    vi.unstubAllGlobals();
  });
});
