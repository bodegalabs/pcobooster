import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatPlanDate,
  formatPlanDateTile,
  formatPlanMonthHeading,
  formatPlanRelativeDay,
  groupPlansByMonthAndDay,
  isInDateWindow,
} from "./service-plan-selection";
import type { ServicePlanRow } from "./service-plan-selection";

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

const planRow = (planId: string, sortDate: string): ServicePlanRow => ({
  serviceTypeId: "service-type",
  serviceTypeName: "Sunday Worship",
  serviceTypeSequence: 0,
  planId,
  planTitle: "",
  seriesTitle: null,
  seriesId: null,
  sortDate: new Date(sortDate),
});

describe(groupPlansByMonthAndDay, () => {
  it("groups plans by org month and org calendar day", () => {
    const groups = groupPlansByMonthAndDay(
      [
        planRow("morning", "2026-10-31T16:00:00.000Z"),
        planRow("evening", "2026-11-01T02:00:00.000Z"),
        planRow("sunday", "2026-11-01T17:00:00.000Z"),
      ],
      ORG_TIME_ZONE
    );

    expect(
      groups.map((month) => ({
        heading: month.heading,
        days: month.days.map((day) => ({
          dayKey: day.dayKey,
          planIds: day.rows.map((row) => row.planId),
        })),
      }))
    ).toStrictEqual([
      {
        heading: "October 2026",
        days: [{ dayKey: "2026-10-31", planIds: ["morning", "evening"] }],
      },
      {
        heading: "November 2026",
        days: [{ dayKey: "2026-11-01", planIds: ["sunday"] }],
      },
    ]);
  });
});

describe(formatPlanRelativeDay, () => {
  /** Saturday October 31, 2026, 9:00 AM in Los Angeles. */
  const SATURDAY_MORNING = new Date("2026-10-31T16:00:00.000Z");

  it("counts org calendar days, not UTC days", () => {
    expect(
      formatPlanRelativeDay(
        HALLOWEEN_EVENING_SERVICE,
        SATURDAY_MORNING,
        ORG_TIME_ZONE
      )
    ).toBe("Today");
    expect(
      formatPlanRelativeDay(
        new Date("2026-11-01T17:00:00.000Z"),
        SATURDAY_MORNING,
        ORG_TIME_ZONE
      )
    ).toBe("Tomorrow");
    expect(
      formatPlanRelativeDay(
        new Date("2026-11-05T17:00:00.000Z"),
        SATURDAY_MORNING,
        ORG_TIME_ZONE
      )
    ).toBe("In 5 days");
  });

  it("leaves past and distant plans unlabeled", () => {
    expect(
      formatPlanRelativeDay(
        new Date("2026-10-30T17:00:00.000Z"),
        SATURDAY_MORNING,
        ORG_TIME_ZONE
      )
    ).toBeNull();
    expect(
      formatPlanRelativeDay(
        new Date("2026-11-20T17:00:00.000Z"),
        SATURDAY_MORNING,
        ORG_TIME_ZONE
      )
    ).toBeNull();
  });
});

describe(isInDateWindow, () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ends the window on the last org day in Pacific/Auckland, across the new year", () => {
    vi.useFakeTimers();
    // 9:00 AM on Thursday, December 17, 2026 in Auckland (UTC+13); the 14-day window ends
    // December 31.
    vi.setSystemTime(new Date("2026-12-16T20:00:00.000Z"));
    const zone = "Pacific/Auckland";

    // 7:00 PM on New Year's Eve in Auckland.
    expect(
      isInDateWindow(new Date("2026-12-31T06:00:00.000Z"), "14", zone)
    ).toBeTruthy();
    // 10:00 AM on New Year's Day 2027 in Auckland; still December 31 in UTC.
    expect(
      isInDateWindow(new Date("2026-12-31T21:00:00.000Z"), "14", zone)
    ).toBeFalsy();
  });

  it("ends the window on the last org day in Pacific/Kiritimati, across a month", () => {
    vi.useFakeTimers();
    // 8:00 AM on Monday, January 18, 2027 in Kiritimati (UTC+14); the 14-day window ends
    // February 1.
    vi.setSystemTime(new Date("2027-01-17T18:00:00.000Z"));
    const zone = "Pacific/Kiritimati";

    // 8:00 PM on February 1 in Kiritimati.
    expect(
      isInDateWindow(new Date("2027-02-01T06:00:00.000Z"), "14", zone)
    ).toBeTruthy();
    // 9:00 AM on February 2 in Kiritimati; still February 1 in UTC.
    expect(
      isInDateWindow(new Date("2027-02-01T19:00:00.000Z"), "14", zone)
    ).toBeFalsy();
  });
});
