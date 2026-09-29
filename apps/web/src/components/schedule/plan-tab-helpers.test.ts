import type {
  PlanItem,
  SongOptionSet,
} from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

import {
  buildRunSheet,
  synchronizeDraftWithSongOptions,
} from "@/components/schedule/plan-tab-helpers";
import type { DraftState } from "@/components/schedule/plan-tab-helpers";

const songOptions: SongOptionSet = {
  song: {
    id: "song-1",
    title: "Build My Life",
    author: "Pat Barrett",
    themes: "Worship",
    hidden: false,
    lastScheduledAt: null,
  },
  arrangements: [
    {
      id: "arr-1",
      name: "Default",
      sequence: ["Verse 1"],
      length: 240,
      bpm: null,
      meter: null,
      archived: false,
      keys: [
        {
          id: "key-1",
          name: "G",
          startingKey: "G",
          endingKey: "G",
        },
      ],
    },
  ],
  layouts: [],
  currentLayout: null,
  suggestedArrangementId: "arr-1",
  suggestedKeyId: "key-1",
  suggestedLayoutId: null,
  layoutMode: "existing-only",
};

const createDraft = (overrides: Partial<DraftState> = {}): DraftState => ({
  title: "Build My Life",
  lengthText: "4:00",
  servicePosition: "during",
  description: "",
  arrangementId: "arr-1",
  keyId: "key-1",
  ...overrides,
});

describe(synchronizeDraftWithSongOptions, () => {
  it("preserves an explicit empty arrangement selection across option refreshes", () => {
    const draft = createDraft({
      arrangementId: "",
      keyId: "",
    });

    expect(synchronizeDraftWithSongOptions(draft, songOptions)).toStrictEqual(
      draft
    );
  });

  it("repairs an invalid key when the arrangement still exists", () => {
    expect(
      synchronizeDraftWithSongOptions(
        createDraft({
          keyId: "missing-key",
        }),
        songOptions
      )
    ).toMatchObject({
      arrangementId: "arr-1",
      keyId: "key-1",
    });
  });
});

const planItem = (
  id: string,
  itemType: PlanItem["itemType"],
  length: number | null,
  servicePosition: PlanItem["servicePosition"] = "during"
): PlanItem => ({
  id,
  title: id,
  itemType,
  sequence: 0,
  servicePosition,
  length,
  description: "",
  htmlDetails: "",
  customArrangementSequence: [],
  song: null,
  arrangement: null,
  key: null,
  layout: null,
});

describe(buildRunSheet, () => {
  it("totals each header's items until the next header", () => {
    const sheet = buildRunSheet([
      planItem("set", "header", null),
      planItem("song-a", "song", 300),
      planItem("song-b", "song", 240),
      planItem("empty", "header", null),
      planItem("sermon-header", "header", null),
      planItem("sermon", "item", 2400),
    ]);

    expect(sheet.get("set")).toStrictEqual({
      sectionLength: 540,
    });
    expect(sheet.get("empty")?.sectionLength).toBeNull();
    expect(sheet.get("sermon-header")?.sectionLength).toBe(2400);
  });
});
