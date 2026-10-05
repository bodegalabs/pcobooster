import { applyLineupColumnOrder } from "@pcobooster/client/lineup-column-order";
import { findNextOpenPosition } from "@pcobooster/client/open-positions";
import type { TeamPositionGroup } from "@pcobooster/contracts/catalog";
import { describe, expect, it, vi } from "vitest";

import { LineupPreferencesStore } from "./lineup-preferences";

const makeStorage = () => {
  const records = new Map<string, string>();
  return {
    records,
    getItem: async (key: string): Promise<string | null> => {
      await Promise.resolve();
      return records.get(key) ?? null;
    },
    setItem: async (key: string, value: string): Promise<void> => {
      await Promise.resolve();
      records.set(key, value);
    },
  };
};
const groups: TeamPositionGroup[] = [
  {
    teamId: "band",
    teamName: "Band",
    positions: [{ id: "drums", name: "Drums", teamId: "band", neededCount: 1 }],
  },
  {
    teamId: "av",
    teamName: "AV",
    positions: [{ id: "camera", name: "Camera", teamId: "av", neededCount: 1 }],
  },
];

describe("native lineup device preferences", () => {
  it("shares the saved order across a service type's plans while collapse stays on its plan", async () => {
    const storage = makeStorage();
    const first = new LineupPreferencesStore(
      "account-a",
      "service",
      "plan-1",
      storage
    );
    await first.restore();
    await first.setCollapsed(["band"]);
    await first.setOrder(["av", "band"]);
    const anotherPlan = new LineupPreferencesStore(
      "account-a",
      "service",
      "plan-2",
      storage
    );
    await anotherPlan.restore();
    expect(anotherPlan.getSnapshot()).toMatchObject({
      collapsed: [],
      order: ["av", "band"],
    });
    const originalPlan = new LineupPreferencesStore(
      "account-a",
      "service",
      "plan-1",
      storage
    );
    await originalPlan.restore();
    expect(originalPlan.getSnapshot().collapsed).toStrictEqual(["band"]);
  });

  it("keeps preferences isolated by account and service type", async () => {
    const storage = makeStorage();
    const original = new LineupPreferencesStore(
      "account-a",
      "service",
      "plan",
      storage
    );
    await original.restore();
    await original.setOrder(["av"]);
    const otherAccount = new LineupPreferencesStore(
      "account-b",
      "service",
      "plan",
      storage
    );
    const otherService = new LineupPreferencesStore(
      "account-a",
      "other-service",
      "plan",
      storage
    );
    await Promise.all([otherAccount.restore(), otherService.restore()]);
    expect(otherAccount.getSnapshot().order).toStrictEqual([]);
    expect(otherService.getSnapshot().order).toStrictEqual([]);
  });

  it("fills the first open slot in saved team order and resets to Planning Center order", async () => {
    const store = new LineupPreferencesStore(
      "account",
      "service",
      "plan",
      makeStorage()
    );
    await store.restore();
    await store.setOrder(["av", "missing", "band"]);
    expect(
      findNextOpenPosition(
        applyLineupColumnOrder(groups, [...store.getSnapshot().order]),
        null
      )?.positionId
    ).toBe("camera");
    await store.setOrder([]);
    expect(
      findNextOpenPosition(
        applyLineupColumnOrder(groups, [...store.getSnapshot().order]),
        null
      )?.positionId
    ).toBe("drums");
  });

  it("keeps the previous preference when device persistence fails", async () => {
    const storage = makeStorage();
    const setItem = vi
      .fn<typeof storage.setItem>()
      .mockRejectedValue(new Error("Storage full"));
    const store = new LineupPreferencesStore("account", "service", "plan", {
      ...storage,
      setItem,
    });
    await store.restore();
    await expect(store.setOrder(["av"])).rejects.toThrow("Storage full");
    expect(store.getSnapshot()).toMatchObject({ order: [], busy: false });
  });
});
