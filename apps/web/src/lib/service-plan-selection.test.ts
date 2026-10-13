import { describe, expect, it } from "vitest";

import { servicePlanWindows } from "./service-plan-selection";

describe(servicePlanWindows, () => {
  it("starts with 30 days without loading history", () => {
    expect(servicePlanWindows("2026-10-13", 0, 1)).toStrictEqual([
      { startDay: "2026-10-13", days: "30" },
    ]);
  });

  it("extends beyond the first month without gaps or overlapping days", () => {
    expect(servicePlanWindows("2026-10-13", 2, 3)).toStrictEqual([
      { startDay: "2026-09-15", days: "14" },
      { startDay: "2026-09-29", days: "14" },
      { startDay: "2026-10-13", days: "30" },
      { startDay: "2026-11-12", days: "14" },
      { startDay: "2026-11-26", days: "14" },
    ]);
  });
});
