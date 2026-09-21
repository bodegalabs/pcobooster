import {
  hydratePlanItem,
  serializePlanItem,
} from "@worship-admin/api/plan-item-client";
import type { PlanItem } from "@worship-admin/api/types";
import { describe, expect, it } from "vitest";

const planItem: PlanItem = {
  id: "item-1",
  title: "Build My Life",
  itemType: "song",
  sequence: 1,
  servicePosition: "during",
  length: 240,
  description: "Opener",
  htmlDetails: "",
  customArrangementSequence: [],
  song: {
    id: "song-1",
    title: "Build My Life",
    author: "Pat Barrett",
    themes: "Worship",
    lastScheduledAt: new Date("2026-02-15T00:00:00.000Z"),
  },
  arrangement: {
    id: "arr-1",
    name: "Default",
    sequence: ["Verse 1"],
    length: 240,
    archivedAt: new Date("2024-01-01T00:00:00.000Z"),
  },
  key: {
    id: "key-1",
    name: "G",
    startingKey: "G",
    endingKey: "G",
  },
  layout: {
    id: "layout-1",
    name: "Selected layout",
  },
};

describe("plan item transport", () => {
  it("serializes nested date fields before crossing the wire", () => {
    const serialized = serializePlanItem(planItem);

    expect(serialized.song?.lastScheduledAt).toBe("2026-02-15T00:00:00.000Z");
    expect(serialized.arrangement?.archivedAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("hydrates nested date fields back into dates on the client", () => {
    const hydrated = hydratePlanItem(serializePlanItem(planItem));

    expect(hydrated.song?.lastScheduledAt).toBeInstanceOf(Date);
    expect(hydrated.song?.lastScheduledAt?.toISOString()).toBe(
      "2026-02-15T00:00:00.000Z"
    );
    expect(hydrated.arrangement?.archivedAt).toBeInstanceOf(Date);
    expect(hydrated.arrangement?.archivedAt?.toISOString()).toBe(
      "2024-01-01T00:00:00.000Z"
    );
  });
});
