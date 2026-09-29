import type { ServiceHistoryItem } from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

import { buildScheduleDays } from "@/lib/people/schedule-days";

const ORG_TIME_ZONE = "America/Los_Angeles";
// 7 PM on Fri, Oct 23 in Los Angeles; already Oct 24 in UTC.
const PLAN_DATE = new Date("2026-10-24T02:00:00.000Z");

const item = (
  id: string,
  date: string,
  overrides: Partial<ServiceHistoryItem> = {}
): ServiceHistoryItem => ({
  id,
  sourceScheduleId: id,
  date: new Date(date),
  teamPositionName: "Keys",
  status: "C",
  timeType: "service",
  ...overrides,
});

const nonFree = (history: ServiceHistoryItem[]) =>
  buildScheduleDays(history, PLAN_DATE, ORG_TIME_ZONE, 7)
    .filter((day) => day.kind !== "free")
    .map(({ offset, dayKey, kind, status }) => ({
      offset,
      dayKey,
      kind,
      status,
    }));

describe(buildScheduleDays, () => {
  it("lays out every day either side of the plan, centered on its congregation day", () => {
    const days = buildScheduleDays([], PLAN_DATE, ORG_TIME_ZONE, 2);
    expect(days.map((day) => [day.offset, day.dayKey])).toStrictEqual([
      [-2, "2026-10-21"],
      [-1, "2026-10-22"],
      [0, "2026-10-23"],
      [1, "2026-10-24"],
      [2, "2026-10-25"],
    ]);
    expect(days.every((day) => day.kind === "free")).toBeTruthy();
  });

  it("places services and rehearsals on their congregation days", () => {
    expect(
      nonFree([
        // Thu, Oct 22 at 7 PM in Los Angeles (Oct 23 in UTC).
        item("r", "2026-10-23T02:00:00.000Z", { timeType: "rehearsal" }),
        item("plan", "2026-10-24T02:00:00.000Z", { status: "U" }),
        item("sun", "2026-10-25T17:00:00.000Z"),
      ])
    ).toStrictEqual([
      { offset: -1, dayKey: "2026-10-22", kind: "rehearsal", status: null },
      { offset: 0, dayKey: "2026-10-23", kind: "service", status: "pending" },
      { offset: 2, dayKey: "2026-10-25", kind: "service", status: "confirmed" },
    ]);
  });

  it("counts a day with a service and a rehearsal as a service day", () => {
    expect(
      nonFree([
        item("r", "2026-10-18T15:00:00.000Z", { timeType: "rehearsal" }),
        item("s", "2026-10-18T17:00:00.000Z"),
      ])
    ).toStrictEqual([
      {
        offset: -5,
        dayKey: "2026-10-18",
        kind: "service",
        status: "confirmed",
      },
    ]);
  });

  it("leaves out declines and days past the range", () => {
    expect(
      nonFree([
        item("d", "2026-10-20T17:00:00.000Z", { status: "D" }),
        item("far", "2026-11-20T17:00:00.000Z"),
      ])
    ).toStrictEqual([]);
  });
});
