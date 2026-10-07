import { summarizeCandidateSchedule } from "@pcobooster/planning-center-models/candidate-summary";
import type { ScheduleFrequency } from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

const ORG_TIME_ZONE = "America/Los_Angeles";
// 7 PM on Fri, Oct 23 in Los Angeles; already Oct 24 in UTC.
const PLAN_DATE = new Date("2026-10-24T02:00:00.000Z");

const frequency = (
  overrides: Partial<ScheduleFrequency> = {}
): ScheduleFrequency => ({
  recentServedDays: 0,
  last60Days: 0,
  last90Days: 0,
  totalServed: 0,
  recentRehearsalOnlyDays: 0,
  rehearsalLast60Days: 0,
  rehearsalLast90Days: 0,
  totalRehearsals: 0,
  upcomingServices: 0,
  upcomingRehearsals: 0,
  ...overrides,
});

describe(summarizeCandidateSchedule, () => {
  it("says nothing without history", () => {
    expect(
      summarizeCandidateSchedule(undefined, PLAN_DATE, ORG_TIME_ZONE)
    ).toStrictEqual([]);
  });

  it("notes when someone has no recent services", () => {
    expect(
      summarizeCandidateSchedule(frequency(), PLAN_DATE, ORG_TIME_ZONE)
    ).toStrictEqual(["No recent services"]);
  });

  it("labels the last service on the congregation's calendar day", () => {
    // 03:30 UTC on Oct 5 is the evening of Oct 4 in Los Angeles.
    const facts = summarizeCandidateSchedule(
      frequency({
        lastServedDate: new Date("2026-10-05T03:30:00.000Z"),
        recentServedDays: 1,
      }),
      PLAN_DATE,
      ORG_TIME_ZONE
    );
    expect(facts).toStrictEqual(["Last served Oct 4"]);
  });

  it("adds the next service after the plan", () => {
    const facts = summarizeCandidateSchedule(
      frequency({
        lastServedDate: new Date("2026-10-11T17:00:00.000Z"),
        recentServedDays: 3,
        nextUpcomingDate: new Date("2026-10-25T17:00:00.000Z"),
        upcomingServices: 1,
      }),
      PLAN_DATE,
      ORG_TIME_ZONE
    );
    expect(facts).toStrictEqual(["Last served Oct 11", "Next on Oct 25"]);
  });

  it("calls a service on the plan's own congregation day serving that day", () => {
    const facts = summarizeCandidateSchedule(
      frequency({
        lastServedDate: new Date("2026-10-23T17:00:00.000Z"),
        recentServedDays: 1,
      }),
      PLAN_DATE,
      ORG_TIME_ZONE
    );
    expect(facts).toStrictEqual(["Serving that day"]);
  });

  it("leaves the plan's day out for someone already on this plan", () => {
    const facts = summarizeCandidateSchedule(
      frequency({
        lastServedDate: new Date("2026-10-23T17:00:00.000Z"),
        recentServedDays: 1,
      }),
      PLAN_DATE,
      ORG_TIME_ZONE,
      { onThisPlan: true }
    );
    expect(facts).toStrictEqual([]);
  });
});
