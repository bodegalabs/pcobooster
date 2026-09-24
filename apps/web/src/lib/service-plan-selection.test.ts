import { describe, expect, it } from "vitest";

import {
  formatPlanDate,
  formatPlanDateTile,
  formatPlanMonthHeading,
} from "./service-plan-selection";

/** Saturday October 31, 2026, 7:00 PM in Los Angeles; Sunday, November 1 in UTC. */
const HALLOWEEN_EVENING_SERVICE = new Date("2026-11-01T02:00:00.000Z");
const ORG_TIME_ZONE = "America/Los_Angeles";

describe(formatPlanDate, () => {
  it("labels a late-evening plan with its org calendar day", () => {
    expect(formatPlanDate(HALLOWEEN_EVENING_SERVICE, ORG_TIME_ZONE)).toBe(
      "Sat, Oct 31, 2026"
    );
  });
});

describe(formatPlanMonthHeading, () => {
  it("groups a late-evening plan under its org month", () => {
    expect(
      formatPlanMonthHeading(HALLOWEEN_EVENING_SERVICE, ORG_TIME_ZONE)
    ).toBe("October 2026");
  });
});

describe(formatPlanDateTile, () => {
  it("shows the org month, day, and weekday of a late-evening plan", () => {
    expect(
      formatPlanDateTile(HALLOWEEN_EVENING_SERVICE, ORG_TIME_ZONE)
    ).toStrictEqual({ month: "Oct", day: "31", weekday: "Sat" });
  });
});
