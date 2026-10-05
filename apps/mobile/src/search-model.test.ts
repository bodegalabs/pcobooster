import type { Plan, ServiceType } from "@pcobooster/contracts/catalog";
import { describe, expect, it, vi } from "vitest";

import { comingUpPlans, recentPlan, RecentSearchStore } from "./search-model";
import type { RecentSearch } from "./search-model";

const fixture = () => {
  const records = new Map<string, string>();
  const storage = {
    getItem: vi.fn<(key: string) => Promise<string | null>>(async (key) => {
      await Promise.resolve();
      return records.get(key) ?? null;
    }),
    setItem: vi.fn<(key: string, value: string) => Promise<void>>(
      async (key, value) => {
        await Promise.resolve();
        records.set(key, value);
      }
    ),
  };
  return { records, storage };
};
const song: RecentSearch = {
  kind: "song",
  id: "5501",
  title: "Morning Light",
  detail: "Composer",
};
const service: ServiceType = { id: "3101", name: "Sunday", sequence: 1 };
const plan = (id: string, date: string): Plan => ({
  id,
  title: "Open Doors",
  createdAt: new Date("2026-01-01T12:00:00Z"),
  sortDate: new Date(date),
});

describe("native Search destinations", () => {
  it("opens a song from recent searches after returning and recreating the screen", async () => {
    const { storage } = fixture();
    const first = new RecentSearchStore("account-a", storage);
    await first.restore();
    await first.add(song);
    const returning = new RecentSearchStore("account-a", storage);
    await returning.restore();
    expect(returning.getSnapshot().items).toStrictEqual([song]);
    expect(returning.getSnapshot().items[0]).toMatchObject({
      kind: "song",
      id: "5501",
    });
    const other = new RecentSearchStore("account-b", storage);
    await other.restore();
    expect(other.getSnapshot().items).toStrictEqual([]);
  });

  it("serializes rapid opens, keeps ten, and moves an existing destination to the front", async () => {
    const { storage } = fixture();
    const store = new RecentSearchStore("account-a", storage);
    await store.restore();
    const opens: Promise<void>[] = [];
    for (const index of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      opens.push(
        store.add({
          kind: "person",
          id: String(index),
          title: `Person ${index}`,
        })
      );
    }
    await Promise.all(opens);
    expect(store.getSnapshot().items).toHaveLength(10);
    await store.add({ kind: "person", id: "5", title: "Renamed person" });
    expect(store.getSnapshot().items[0]).toStrictEqual({
      kind: "person",
      id: "5",
      title: "Renamed person",
    });
    expect(
      store
        .getSnapshot()
        .items.filter((item) => item.kind === "person" && item.id === "5")
    ).toHaveLength(1);
  });

  it("removes a destination and clears only this account's saved recents", async () => {
    const { storage } = fixture();
    const first = new RecentSearchStore("account-a", storage);
    const other = new RecentSearchStore("account-b", storage);
    await Promise.all([first.restore(), other.restore()]);
    await first.add(song);
    await other.add(song);
    await first.add({ kind: "query", text: "morning" });
    await first.remove(song);
    expect(first.getSnapshot().items).toStrictEqual([
      { kind: "query", text: "morning" },
    ]);
    await first.clear();
    expect(first.getSnapshot().items).toStrictEqual([]);
    expect(other.getSnapshot().items).toStrictEqual([song]);
  });

  it("preserves saved recents if storage fails and rejects malformed persisted destinations", async () => {
    const { storage, records } = fixture();
    const store = new RecentSearchStore("account-a", storage);
    await store.restore();
    await store.add(song);
    storage.setItem.mockRejectedValueOnce(new Error("Disk full"));
    await store.clear();
    expect(store.getSnapshot().items).toStrictEqual([song]);
    expect(store.getSnapshot().failure).toStrictEqual(new Error("Disk full"));
    records.set(
      "pcobooster.search-destinations.v1.account-b",
      '[{"kind":"song","title":"Missing id"}]'
    );
    const malformed = new RecentSearchStore("account-b", storage);
    await malformed.restore();
    expect(malformed.getSnapshot()).toMatchObject({ items: [], ready: true });
    expect(malformed.getSnapshot().failure).not.toBeNull();
  });

  it("shows the next five globally sorted plans, including earlier today in the congregation zone", () => {
    const rows = [
      { service, plan: plan("yesterday", "2026-10-05T06:30:00Z") },
      { service, plan: plan("today", "2026-10-05T07:30:00Z") },
      ...Array.from({ length: 7 }, (_, index) => ({
        service: { ...service, id: `service-${index}` },
        plan: plan(
          `future-${index}`,
          `2026-10-${String(index + 6).padStart(2, "0")}T17:00:00Z`
        ),
      })),
    ];
    const upcoming = comingUpPlans(
      rows.toReversed(),
      new Date("2026-10-06T02:00:00Z"),
      "America/Los_Angeles"
    );
    expect(upcoming.map((row) => row.plan.id)).toStrictEqual([
      "today",
      "future-0",
      "future-1",
      "future-2",
      "future-3",
    ]);
    expect(
      recentPlan(upcoming[0] ?? rows[1], "America/Los_Angeles")
    ).toStrictEqual({
      kind: "plan",
      serviceTypeId: "3101",
      planId: "today",
      title: "Sunday",
      detail: "Open Doors · Mon, Oct 5",
    });
  });
});
