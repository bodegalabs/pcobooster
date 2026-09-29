import type { TeamPositionGroup } from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

import {
  findFirstPosition,
  findNextOpenPosition,
} from "@/lib/schedule/open-positions";

const groups: TeamPositionGroup[] = [
  {
    teamId: "av",
    teamName: "Audio/Visual",
    positions: [
      { id: "cam1", name: "Camera 1", teamId: "av", neededCount: 1 },
      { id: "sound", name: "Sound", teamId: "av", neededCount: 0 },
    ],
  },
  {
    teamId: "band",
    teamName: "Band",
    positions: [
      { id: "keys", name: "Keys", teamId: "band" },
      { id: "drums", name: "Drums", teamId: "band", neededCount: 2 },
    ],
  },
];

describe(findNextOpenPosition, () => {
  it("starts at the first open position when nothing is selected", () => {
    expect(findNextOpenPosition(groups, null)?.positionId).toBe("cam1");
  });

  it("skips filled positions and crosses into the next team", () => {
    expect(
      findNextOpenPosition(groups, { teamId: "av", positionId: "cam1" })
    ).toStrictEqual({
      teamId: "band",
      teamName: "Band",
      positionId: "drums",
      positionName: "Drums",
      source: undefined,
    });
  });

  it("wraps past the end of the list", () => {
    expect(
      findNextOpenPosition(groups, { teamId: "band", positionId: "drums" })
        ?.positionId
    ).toBe("cam1");
  });

  it("never returns the current position", () => {
    const single: TeamPositionGroup[] = [
      {
        teamId: "av",
        teamName: "Audio/Visual",
        positions: [
          { id: "cam1", name: "Camera 1", teamId: "av", neededCount: 1 },
        ],
      },
    ];
    expect(
      findNextOpenPosition(single, { teamId: "av", positionId: "cam1" })
    ).toBeNull();
  });

  it("returns null when everything is filled", () => {
    expect(findNextOpenPosition([], null)).toBeNull();
  });
});

describe(findFirstPosition, () => {
  it("returns the first position even when it is filled", () => {
    expect(
      findFirstPosition([
        { teamId: "empty", teamName: "Empty", positions: [] },
        {
          teamId: "av",
          teamName: "Audio/Visual",
          positions: [{ id: "sound", name: "Sound", teamId: "av" }],
        },
      ])?.positionId
    ).toBe("sound");
  });

  it("returns null without positions", () => {
    expect(findFirstPosition([])).toBeNull();
  });
});
