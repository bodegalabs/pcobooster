import { describe, expect, it } from "vitest";

import {
  formatWallTimeInTimeZone,
  zonedWallTimeToUtcIso,
} from "@/lib/planning-center/org-calendar";
import { blockoutCoversPlanSortInstant } from "@/lib/use-cases/planning-center/people/calendar-day";

describe(blockoutCoversPlanSortInstant, () => {
  it("does not block Apr 13 plan when blockout is only Apr 12 in America/Los_Angeles", () => {
    const planSortAt = new Date("2026-04-13T07:00:00.000Z");
    const startsAt = new Date("2026-04-12T07:00:00.000Z");
    const endsAt = new Date("2026-04-13T06:59:59.000Z");
    expect(
      blockoutCoversPlanSortInstant(planSortAt, {
        startsAt,
        endsAt,
        timeZone: "America/Los_Angeles",
      })
    ).toBeFalsy();
  });

  it("still blocks when plan sort_date falls on the same local blockout day (LA)", () => {
    const planSortAt = new Date("2026-04-12T07:00:00.000Z");
    const startsAt = new Date("2026-04-12T07:00:00.000Z");
    const endsAt = new Date("2026-04-13T06:59:59.000Z");
    expect(
      blockoutCoversPlanSortInstant(planSortAt, {
        startsAt,
        endsAt,
        timeZone: "America/Los_Angeles",
      })
    ).toBeTruthy();
  });

  it("UTC single-day blockout matches when time_zone is omitted (UTC)", () => {
    const planSortAt = new Date("2026-02-22T15:00:00.000Z");
    expect(
      blockoutCoversPlanSortInstant(planSortAt, {
        startsAt: new Date("2026-02-22T00:00:00.000Z"),
        endsAt: new Date("2026-02-22T23:59:59.000Z"),
        timeZone: null,
      })
    ).toBeTruthy();
  });
});

describe("org timezone wall-clock helpers", () => {
  it("formats an instant as org-local date and time", () => {
    expect(
      formatWallTimeInTimeZone(
        new Date("2026-05-24T16:30:00.000Z"),
        "America/Los_Angeles"
      )
    ).toStrictEqual({
      dateKey: "2026-05-24",
      timeValue: "09:30",
    });
  });

  it("converts an org-local date and time back to a UTC ISO instant", () => {
    expect(
      zonedWallTimeToUtcIso("2026-05-24", "09:30", "America/Los_Angeles")
    ).toBe("2026-05-24T16:30:00.000Z");
  });

  it("uses the offset for the selected wall-clock date", () => {
    expect(
      zonedWallTimeToUtcIso("2026-12-24", "09:30", "America/Los_Angeles")
    ).toBe("2026-12-24T17:30:00.000Z");
  });
});
