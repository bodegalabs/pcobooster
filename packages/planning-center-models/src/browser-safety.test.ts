import { addCalendarDaysToDayKey } from "@worship-admin/planning-center-models/calendar";
import { formatCalendarDayInTimeZone } from "@worship-admin/planning-center-models/calendar-day";
import { isNonEmptyString } from "@worship-admin/planning-center-models/json";
import { getScheduleContextHalfRangeWeekOptions } from "@worship-admin/planning-center-models/schedule-constants";
import { describe, expect, it } from "vitest";

describe("browser-safe Planning Center model exports", () => {
  it("loads pure helpers without application runtime configuration", () => {
    expect(isNonEmptyString("planning-center")).toBeTruthy();
    expect(
      formatCalendarDayInTimeZone(
        new Date("2026-05-24T16:30:00.000Z"),
        "America/Los_Angeles"
      )
    ).toBe("2026-05-24");
    expect(
      addCalendarDaysToDayKey("2026-05-24", 1, "America/Los_Angeles")
    ).toBe("2026-05-25");
    expect(getScheduleContextHalfRangeWeekOptions()).toStrictEqual([
      1, 2, 3, 4,
    ]);
  });
});
