import { createOptimisticBasicPlanItem } from "@pcobooster/planning-center-models/plan-item-order";
import type { PlanItem } from "@pcobooster/planning-center-models/types";
import { describe, expect, it, vi } from "vitest";

import {
  editorTitle,
  isCurrentKey,
  itemTitle,
  keyedArrangements,
  rowFacts,
  lengthLabel,
  recentLabel,
  sectionEnd,
  summaryCounts,
} from "./formatting";
import { ItemDraft } from "./item-draft";
import { OneAtATime } from "./one-at-a-time";
import { RunSheetRemovals } from "./removals";

const item = {
  ...createOptimisticBasicPlanItem("a", "item", 0),
  title: "Welcome",
};

describe("run sheet rules", () => {
  it("formats absent lengths and recent facts", () => {
    expect(lengthLabel(null)).toBe("-:--");
    expect(lengthLabel(245)).toBe("4:05");
    expect([recentLabel(3), recentLabel(14)]).toStrictEqual([
      "3d ago",
      "2w ago",
    ]);
    expect(itemTitle({ ...item, title: "" })).toBe("Untitled item");
    expect(editorTitle(item)).toBe("Item");
  });

  it("counts songs and items as Swift's summary does", () => {
    expect([summaryCounts(1, 3), summaryCounts(4, 10)]).toStrictEqual([
      "1 song, 3 items",
      "4 songs, 10 items",
    ]);
  });

  it("finds section boundaries from item types regardless of header titles", () => {
    const header: PlanItem = { ...item, id: "header", itemType: "header" };
    const next = { ...header, id: "next", title: "Worship" };
    expect(sectionEnd([header, item, next], header.id)).toBe(item.id);
    expect(sectionEnd([header, next], header.id)).toBe(header.id);
  });

  it("keeps drafts local and names an unreadable length", () => {
    const draft = new ItemDraft(item);
    expect(draft.draft.lengthText).toBe("");
    draft.change({ title: "Greeting", lengthText: "4:05" });
    expect([draft.draft.title, item.title, draft.problem]).toStrictEqual([
      "Greeting",
      "Welcome",
      null,
    ]);
    draft.change({ lengthText: "soon" });
    expect(draft.problem).not.toBeNull();
  });

  it("offers keys only from live arrangements that have them, and knows the current pick", () => {
    const key = { id: "k1", name: "G", startingKey: "G", endingKey: null };
    const arrangement = {
      id: "a1",
      name: "Default",
      sequence: [],
      length: null,
      bpm: null,
      meter: null,
      archived: false,
      keys: [key],
    };
    const options = {
      song: {
        id: "s1",
        title: "Song",
        author: "",
        themes: "",
        hidden: false,
        lastScheduledAt: null,
      },
      arrangements: [
        arrangement,
        { ...arrangement, id: "a2", keys: [] },
        { ...arrangement, id: "a3", archived: true },
      ],
      layouts: [],
      currentLayout: null,
      suggestedArrangementId: null,
      suggestedKeyId: null,
      suggestedLayoutId: null,
      layoutMode: "unavailable" as const,
    };
    expect(keyedArrangements(options).map((value) => value.id)).toStrictEqual([
      "a1",
    ]);
    expect(keyedArrangements()).toStrictEqual([]);
    const song: PlanItem = {
      ...item,
      arrangement: { ...arrangement, archivedAt: null },
      key,
    };
    expect([
      isCurrentKey(song, arrangement, key),
      isCurrentKey(song, { ...arrangement, id: "a2" }, key),
      isCurrentKey({ ...song, key: null }, arrangement, key),
    ]).toStrictEqual([true, false, false]);
  });

  it("keeps tempo on a song's facts line and gives up only the arrangement name to a recent-play hint", () => {
    const tempo = {
      id: "a1",
      name: "Default",
      sequence: [],
      length: null,
      bpm: 120,
      meter: "4/4",
      archived: false,
      keys: [],
    };
    const options = {
      song: {
        id: "s1",
        title: "Song",
        author: "",
        themes: "",
        hidden: false,
        lastScheduledAt: null,
      },
      arrangements: [tempo],
      layouts: [],
      currentLayout: null,
      suggestedArrangementId: null,
      suggestedKeyId: null,
      suggestedLayoutId: null,
      layoutMode: "unavailable" as const,
    };
    const named: PlanItem = {
      ...item,
      itemType: "song",
      arrangement: { ...tempo, archivedAt: null },
    };
    const unnamed = {
      ...named,
      arrangement: { ...tempo, name: "", archivedAt: null },
    };
    expect([
      rowFacts(named, options, false),
      rowFacts(named, options, true),
      rowFacts(unnamed, options, true),
      rowFacts(named, undefined, true),
    ]).toStrictEqual([
      "Default · 120 bpm · 4/4",
      "120 bpm · 4/4",
      "120 bpm · 4/4",
      "Default",
    ]);
  });

  it("runs one header or item create at a time, so a double tap adds one", async () => {
    const busy = vi.fn<(running: boolean) => void>();
    const gate = new OneAtATime(busy);
    const created = Promise.withResolvers<null>();
    const create = vi.fn<() => Promise<void>>(async () => {
      await created.promise;
    });
    gate.run(create);
    gate.run(create);
    expect(create).toHaveBeenCalledOnce();
    created.resolve(null);
    await vi.waitFor(() => {
      expect(busy.mock.calls).toStrictEqual([[true], [false]]);
    });
    gate.run(create);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("offers five seconds to undo and flushes each pending deletion once", () => {
    vi.useFakeTimers();
    try {
      const remove = vi
        .fn<(id: string) => Promise<boolean>>()
        .mockResolvedValue(true);
      const changed = vi.fn<(items: PlanItem[]) => void>();
      const removals = new RunSheetRemovals(remove, changed);
      removals.request(item);
      removals.request(item);
      vi.advanceTimersByTime(4999);
      expect(remove).not.toHaveBeenCalled();
      removals.undo(item.id);
      vi.advanceTimersByTime(1);
      expect(remove).not.toHaveBeenCalled();
      removals.request(item);
      vi.advanceTimersByTime(5000);
      expect(remove).toHaveBeenCalledExactlyOnceWith(item.id);
      removals.request({ ...item, id: "b" });
      removals.flush();
      removals.flush();
      vi.advanceTimersByTime(5000);
      expect(remove).toHaveBeenCalledTimes(2);
      expect(changed).toHaveBeenLastCalledWith([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
