import type { TeamPositionGroup } from "@worship-admin/planning-center-models/types";
import { describe, expect, it } from "vitest";

import {
  applyLineupColumnOrder,
  reorderLineupColumnIds,
  resolveLineupColumnOrder,
} from "@/lib/lineup-column-order";

const createGroup = (teamId: string, teamName: string): TeamPositionGroup => ({
  teamId,
  teamName,
  positions: [],
});

describe("lineup column order", () => {
  it("reorders column ids by drag target", () => {
    expect(reorderLineupColumnIds(["a", "b", "c"], "a", "c")).toStrictEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("keeps unknown ids out of resolved order and appends new teams", () => {
    const groups = [
      createGroup("band", "Band"),
      createGroup("media", "Media"),
      createGroup("cafe", "Cafe"),
    ];

    expect(
      resolveLineupColumnOrder(groups, ["media", "missing", "band"])
    ).toStrictEqual(["media", "band", "cafe"]);
  });

  it("applies saved order to group objects", () => {
    const groups = [
      createGroup("band", "Band"),
      createGroup("media", "Media"),
      createGroup("cafe", "Cafe"),
    ];

    expect(
      applyLineupColumnOrder(groups, ["cafe", "band"]).map(
        (group) => group.teamName
      )
    ).toStrictEqual(["Cafe", "Band", "Media"]);
  });
});
