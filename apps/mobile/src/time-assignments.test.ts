import { describe, expect, it } from "vitest";

import { timeAssignmentChanges } from "./time-assignments";

describe("Native individual time assignments", () => {
  it("separates slot and person additions from explicit removals without clearing untouched assignments", () => {
    expect(
      timeAssignmentChanges(
        new Map([
          ["needed:slot-a", true],
          ["needed:slot-b", false],
          ["person:person-a", true],
          ["person:person-b", false],
        ])
      )
    ).toStrictEqual({
      assignedNeededPositionIds: ["slot-a"],
      clearedNeededPositionIds: ["slot-b"],
      assignedPlanPersonIds: ["person-a"],
      clearedPlanPersonIds: ["person-b"],
    });
  });
});
