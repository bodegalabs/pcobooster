import { scoreAndNormalizePeople } from "@pcobooster/api/modules/planning-center/people/scoring";
import { formatPlanHistoryHalfRangeWeeksLabel } from "@pcobooster/planning-center-models/schedule-constants";
import type {
  PersonWithAvailability,
  ScheduleFrequency,
} from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

const baseFrequency = (
  partial: Partial<ScheduleFrequency>
): ScheduleFrequency => ({
  recentServedDays: 0,
  last60Days: 0,
  last90Days: 0,
  totalServed: 0,
  upcomingServices: 0,
  recentRehearsalOnlyDays: 0,
  rehearsalLast60Days: 0,
  rehearsalLast90Days: 0,
  totalRehearsals: 0,
  upcomingRehearsals: 0,
  ...partial,
});

const person = (
  id: string,
  frequency: ScheduleFrequency
): PersonWithAvailability => ({
  id,
  firstName: id,
  lastName: "Test",
  fullName: `${id} Test`,
  photoUrl: null,
  photoThumbnailUrl: null,
  archived: false,
  positions: [],
  frequency,
  isBlockedForDate: false,
});

const personWithoutFrequency = (id: string): PersonWithAvailability => ({
  id,
  firstName: id,
  lastName: "Test",
  fullName: `${id} Test`,
  photoUrl: null,
  photoThumbnailUrl: null,
  archived: false,
  positions: [],
  isBlockedForDate: false,
});

describe(scoreAndNormalizePeople, () => {
  it("penalizes upcoming rehearsals less than upcoming services and explains rehearsal impact", () => {
    const referenceDate = new Date("2026-02-22T00:00:00Z");
    const nextDate = new Date("2026-02-25T00:00:00Z");

    const rehearsalHeavy = person(
      "rehearsal",
      baseFrequency({
        totalServed: 3,
        lastServedDate: new Date("2026-01-01T00:00:00Z"),
        upcomingRehearsals: 1,
        nextRehearsalDate: nextDate,
        recentRehearsalOnlyDays: 1,
        totalRehearsals: 1,
      })
    );

    const serviceHeavy = person(
      "service",
      baseFrequency({
        totalServed: 3,
        lastServedDate: new Date("2026-01-01T00:00:00Z"),
        upcomingServices: 1,
        nextUpcomingDate: nextDate,
      })
    );

    const people = [rehearsalHeavy, serviceHeavy];
    scoreAndNormalizePeople(people, referenceDate, "UTC");

    expect(rehearsalHeavy.recommendationScore ?? 0).toBeGreaterThan(
      serviceHeavy.recommendationScore ?? 0
    );
    expect(rehearsalHeavy.recommendationReasoning?.join(" ")).toContain(
      "Rehearsal"
    );
  });

  it("does not rank missing frequency data below a clean candidate by default", () => {
    const referenceDate = new Date("2026-02-22T00:00:00Z");

    const missingFrequency = personWithoutFrequency("missing");
    const cleanFrequency = person("clean", baseFrequency({}));

    const people = [missingFrequency, cleanFrequency];
    scoreAndNormalizePeople(people, referenceDate, "UTC");

    expect(missingFrequency.recommendationScore).toBe(
      cleanFrequency.recommendationScore
    );
    expect(missingFrequency.recommendationReasoning?.join(" ")).toContain(
      "No service history available"
    );
  });

  it("explains recent schedule load using the plan-history week window", () => {
    const referenceDate = new Date("2026-02-22T00:00:00Z");
    const busy = person(
      "busy",
      baseFrequency({
        recentServedDays: 3,
        totalServed: 5,
        lastServedDate: new Date("2026-02-01T00:00:00Z"),
      })
    );

    scoreAndNormalizePeople([busy], referenceDate, "UTC");

    expect(busy.recommendationReasoning?.join(" ")).toContain(
      formatPlanHistoryHalfRangeWeeksLabel()
    );
  });

  it("names late-evening services by their org calendar day, not the host's", () => {
    /** Sunday September 27, 2026, 10:00 AM in Los Angeles. */
    const referenceDate = new Date("2026-09-27T17:00:00.000Z");
    const eveningServer = person(
      "evening",
      baseFrequency({
        totalServed: 1,
        upcomingServices: 1,
        upcomingRehearsals: 1,
        /** Friday September 25, 7:00 PM Pacific; Saturday in UTC. */
        lastServedDate: new Date("2026-09-26T02:00:00.000Z"),
        /** Friday October 2, 7:30 PM Pacific; Saturday in UTC. */
        nextUpcomingDate: new Date("2026-10-03T02:30:00.000Z"),
        /** Wednesday September 30, 8:00 PM Pacific; Thursday in UTC. */
        nextRehearsalDate: new Date("2026-10-01T03:00:00.000Z"),
      })
    );

    scoreAndNormalizePeople(
      [eveningServer],
      referenceDate,
      "America/Los_Angeles"
    );

    expect(eveningServer.recommendationReasoning).toStrictEqual([
      "Last served 2 days before on Fri, Sep 25, 2026",
      "Upcoming: 5 days after on Fri, Oct 2, 2026",
      "Ranked lower: scheduled 5 days after",
      "Rehearsal upcoming: 3 days after on Wed, Sep 30, 2026",
      "Slight rehearsal penalty: rehearsal 3 days after",
    ]);
  });
});
