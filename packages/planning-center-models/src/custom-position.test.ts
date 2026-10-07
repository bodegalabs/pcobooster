import { describe, expect, it } from "vitest";

import {
  buildPlanMemberPositionId,
  customPositionFromId,
  insertCustomPosition,
} from "./custom-position";
import type { TeamPositionGroup } from "./types";

const groups: TeamPositionGroup[] = [
  {
    teamId: "t",
    teamName: "Band",
    positions: [{ id: "keys", name: "Keys", teamId: "t", neededCount: 1 }],
  },
];
describe("plan-only positions", () => {
  it("uses Planning Center's encoded position identifier", () => {
    expect(buildPlanMemberPositionId("t", "  Lead Vocals ")).toBe(
      "plan-member-position:t:lead%20vocals"
    );
  });

  it("rebuilds a custom position from its id, as Swift's CustomRosterPosition does", () => {
    expect(
      customPositionFromId(
        buildPlanMemberPositionId("t", "lead vocals"),
        "Band"
      )
    ).toStrictEqual({
      id: "plan-member-position:t:lead%20vocals",
      name: "Lead Vocals",
      teamId: "t",
      teamName: "Band",
      source: "custom",
      neededCount: 0,
    });
    expect(customPositionFromId("keys", "Band")).toBeUndefined();
    expect(
      customPositionFromId("plan-member-position:t:", "Band")
    ).toBeUndefined();
    expect(
      customPositionFromId("plan-member-position::banjo", "Band")
    ).toBeUndefined();
  });

  it("rejects empty names and unknown teams", () => {
    expect(insertCustomPosition(groups, "t", " ")).toBeUndefined();
    expect(insertCustomPosition(groups, "missing", "Bass")).toBeUndefined();
  });

  it("reuses a same-named position without replacing it", () => {
    const result = insertCustomPosition(groups, "t", " KEYS ");
    expect(result?.position).toBe(groups[0].positions[0]);
    expect(result?.groups).toStrictEqual(groups);
  });

  it("inserts a trimmed custom position in name order without editing the input", () => {
    const result = insertCustomPosition(groups, "t", " Bass ");
    expect(result?.position).toMatchObject({
      name: "Bass",
      source: "custom",
      neededCount: 0,
    });
    expect(result?.groups[0].positions.map((p) => p.name)).toStrictEqual([
      "Bass",
      "Keys",
    ]);
    expect(groups[0].positions).toHaveLength(1);
  });
});
