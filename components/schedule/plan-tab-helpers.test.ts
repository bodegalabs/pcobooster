import { describe, expect, it } from "vitest";

import { synchronizeDraftWithSongOptions } from "@/components/schedule/plan-tab-helpers";
import type { DraftState } from "@/components/schedule/plan-tab-helpers";
import type { SongOptionSet } from "@/lib/types";

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
