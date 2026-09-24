import { formatCalendarDateLabel } from "@pcobooster/planning-center-models/calendar";
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
