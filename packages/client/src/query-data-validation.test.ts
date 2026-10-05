import { describe, expect, it } from "vitest";

import { isValidProductQueryData } from "./query-data-validation";

const plan = {
  id: "fixture-plan",
  title: "Fictional Sunday",
  createdAt: new Date("2026-10-01T12:00:00Z"),
  sortDate: new Date("2026-10-11T16:00:00Z"),
};

describe("decoded query data at the persistence boundary", () => {
  it("accepts decoded dates and rejects superficially valid serialized dates", () => {
    expect(
      isValidProductQueryData(["plan-details", "service", "plan"], plan)
    ).toBeTruthy();
    expect(
      isValidProductQueryData(["plan-details", "service", "plan"], {
        ...plan,
        sortDate: plan.sortDate.toISOString(),
      })
    ).toBeFalsy();
  });

  it("validates progressive shapes and rejects unknown families", () => {
    expect(
      isValidProductQueryData(["people-candidate-details"], [[]])
    ).toBeTruthy();
    expect(
      isValidProductQueryData(
        ["people-dashboard-activity"],
        [{ id: "missing-required-fields" }]
      )
    ).toBeFalsy();
    expect(isValidProductQueryData(["unknown"], plan)).toBeFalsy();
  });
});
