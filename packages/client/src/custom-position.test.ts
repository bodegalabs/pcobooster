import type { TeamPositionGroup } from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

import {
  addCustomLineupPosition,
  buildPlanMemberPositionId,
} from "./custom-position";

const groups: TeamPositionGroup[] = [
  {
    teamId: "5",
    teamName: "Band",
    positions: [{ id: "keys", name: "Keys", teamId: "5", neededCount: 2 }],
  },
];
describe("plan-only lineup positions", () => {
  it("keeps the original shared synthetic ID format and requires provider scheduling before an open slot exists", () => {
    expect(buildPlanMemberPositionId("5", "  Lead Vocals ")).toBe(
      "plan-member-position:5:lead%20vocals"
    );
    const result = addCustomLineupPosition(groups, "5", "  Lead Vocals ");
    expect(result?.groups[0]?.positions).toStrictEqual([
      { id: "keys", name: "Keys", teamId: "5", neededCount: 2 },
      {
        id: "plan-member-position:5:lead%20vocals",
        name: "Lead Vocals",
        teamId: "5",
        teamName: "Band",
        source: "custom",
        neededCount: 0,
      },
    ]);
    expect(groups[0]?.positions).toHaveLength(1);
  });

  it("selects a same-named existing slot without adding a duplicate", () => {
    const result = addCustomLineupPosition(groups, "5", " keys ");
    expect(result?.positionId).toBe("keys");
    expect(result?.groups).toBe(groups);
  });

  it("rejects blank names and missing teams", () => {
    expect(addCustomLineupPosition(groups, "5", " ")).toBeNull();
    expect(addCustomLineupPosition(groups, "missing", "Vocals")).toBeNull();
  });
});
