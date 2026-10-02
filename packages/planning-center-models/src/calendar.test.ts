import {
  addCalendarDaysToDayKey,
  formatCalendarDateLabel,
  formatCalendarDayInTimeZone,
} from "@pcobooster/planning-center-models/calendar";
import type { CalendarDateLabelStyle } from "@pcobooster/planning-center-models/calendar";
import { describe, expect, it } from "vitest";

/** Wednesday September 9, 2026, 7:00 PM in Los Angeles; already Thursday in UTC and Tokyo. */
const LATE_PACIFIC_EVENING = new Date("2026-09-10T02:00:00.000Z");
/** Thursday September 10, 2026, 8:00 AM in Tokyo; still Wednesday in UTC and Los Angeles. */
const EARLY_TOKYO_MORNING = new Date("2026-09-09T23:00:00.000Z");
/** Wednesday September 30, 2026, 9:30 PM in Los Angeles; October 1 in UTC. */
const LAST_EVENING_OF_SEPTEMBER = new Date("2026-10-01T04:30:00.000Z");

describe(formatCalendarDateLabel, () => {
  it("labels the org calendar day, not the host's, for a late Pacific evening", () => {
    const styles: CalendarDateLabelStyle[] = [
      "monthDay",
      "monthDayYear",
      "weekdayMonthDay",
      "weekdayMonthDayYear",
      "weekday",
      "dayOfMonth",
    ];

    expect(
      styles.map((style) =>
        formatCalendarDateLabel(
          LATE_PACIFIC_EVENING,
          "America/Los_Angeles",
          style
        )
      )
    ).toStrictEqual([
      "Sep 9",
      "Sep 9, 2026",
      "Wed, Sep 9",
      "Wed, Sep 9, 2026",
      "Wed",
      "9",
    ]);
  });

  it("labels the org calendar day for an early Tokyo morning", () => {
    expect(
      formatCalendarDateLabel(
        EARLY_TOKYO_MORNING,
        "Asia/Tokyo",
        "weekdayMonthDayYear"
      )
    ).toBe("Thu, Sep 10, 2026");
  });

  it("labels month boundaries in the org zone", () => {
    expect(
      formatCalendarDateLabel(
        LAST_EVENING_OF_SEPTEMBER,
        "America/Los_Angeles",
        "monthYear"
      )
    ).toBe("September 2026");
    expect(
      formatCalendarDateLabel(
        LAST_EVENING_OF_SEPTEMBER,
        "America/Los_Angeles",
        "monthShort"
      )
    ).toBe("Sep");
    expect(
      formatCalendarDateLabel(LAST_EVENING_OF_SEPTEMBER, "UTC", "monthYear")
    ).toBe("October 2026");
  });

  it("falls back to UTC for an empty zone, like the other calendar helpers", () => {
    expect(formatCalendarDateLabel(LATE_PACIFIC_EVENING, "", "monthDay")).toBe(
      "Sep 10"
    );
  });
});

describe(addCalendarDaysToDayKey, () => {
  it("rolls across month and leap-day boundaries", () => {
    expect(addCalendarDaysToDayKey("2026-01-10", 0)).toBe("2026-01-10");
    expect(addCalendarDaysToDayKey("2026-01-31", 1)).toBe("2026-02-01");
    expect(addCalendarDaysToDayKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(addCalendarDaysToDayKey("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("rolls across year boundaries", () => {
    expect(addCalendarDaysToDayKey("2026-12-25", 7)).toBe("2027-01-01");
    expect(addCalendarDaysToDayKey("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("keeps a Pacific/Auckland org day across a month boundary", () => {
    // 12:30 AM on Sunday, February 1, 2026 in Auckland (UTC+13); January 31 in UTC.
    const firstOfFebruary = formatCalendarDayInTimeZone(
      new Date("2026-01-31T11:30:00.000Z"),
      "Pacific/Auckland"
    );
    expect(firstOfFebruary).toBe("2026-02-01");
    expect(addCalendarDaysToDayKey(firstOfFebruary, 0)).toBe("2026-02-01");
    expect(addCalendarDaysToDayKey(firstOfFebruary, -1)).toBe("2026-01-31");
  });

  it("keeps a Pacific/Auckland org day across a year boundary", () => {
    // 11:00 PM on New Year's Eve 2026 in Auckland; 10:00 AM in UTC.
    const newYearsEve = formatCalendarDayInTimeZone(
      new Date("2026-12-31T10:00:00.000Z"),
      "Pacific/Auckland"
    );
    expect(newYearsEve).toBe("2026-12-31");
    expect(addCalendarDaysToDayKey(newYearsEve, 0)).toBe("2026-12-31");
    expect(addCalendarDaysToDayKey(newYearsEve, 1)).toBe("2027-01-01");
  });

  it("keeps a Pacific/Kiritimati org day across a month boundary", () => {
    // 11:00 PM on Friday, April 30, 2027 in Kiritimati (UTC+14); 9:00 AM in UTC.
    const endOfApril = formatCalendarDayInTimeZone(
      new Date("2027-04-30T09:00:00.000Z"),
      "Pacific/Kiritimati"
    );
    expect(endOfApril).toBe("2027-04-30");
    expect(addCalendarDaysToDayKey(endOfApril, 0)).toBe("2027-04-30");
    expect(addCalendarDaysToDayKey(endOfApril, 1)).toBe("2027-05-01");
  });

  it("keeps a Pacific/Kiritimati org day across a year boundary", () => {
    // 12:30 AM on New Year's Day 2027 in Kiritimati; still December 31 in UTC.
    const newYearsDay = formatCalendarDayInTimeZone(
      new Date("2026-12-31T10:30:00.000Z"),
      "Pacific/Kiritimati"
    );
    expect(newYearsDay).toBe("2027-01-01");
    expect(addCalendarDaysToDayKey(newYearsDay, 0)).toBe("2027-01-01");
    expect(addCalendarDaysToDayKey(newYearsDay, -1)).toBe("2026-12-31");
  });
});
