import { describe, expect, it } from "vitest";

import { rosterAccess } from "./access";

describe("roster access", () => {
  it("allows scheduling while access loads, but disables demo writes immediately", () => {
    expect(rosterAccess(undefined, "service", false)).toStrictEqual({
      canSchedule: true,
      notice: null,
    });
    expect(rosterAccess(undefined, "service", true)).toStrictEqual({
      canSchedule: false,
      notice: {
        title: "Read-only demo",
        message:
          "Explore freely. Scheduling changes are turned off in the demo.",
      },
    });
  });

  it("explains why scheduling is unavailable", () => {
    expect(
      rosterAccess(
        { services: { status: "none" }, people: { status: "none" } },
        "service",
        false
      )
    ).toStrictEqual({
      canSchedule: false,
      notice: {
        title: "View only",
        message:
          "Your Planning Center access here is limited. Scheduling needs Scheduler (for teams you lead) or Editor.",
      },
    });
  });
});
