import { scoreAndNormalizePeople } from "@worship-admin/api/use-cases/planning-center/people/scoring";
import { formatPlanHistoryHalfRangeWeeksLabel } from "@worship-admin/planning-center-models/schedule-constants";
import type {
  PersonWithAvailability,
  ScheduleFrequency,
} from "@worship-admin/planning-center-models/types";
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
});
