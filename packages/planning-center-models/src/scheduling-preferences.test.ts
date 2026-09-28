import { scoreSchedulingPreferences } from "@pcobooster/planning-center-models/scheduling-preferences";
import type {
  SchedulingPreferenceContext,
  SchedulingPreferences,
} from "@pcobooster/planning-center-models/scheduling-preferences";
import type { ServiceHistoryItem } from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

const ORG_TIME_ZONE = "America/Los_Angeles";
const PLAN_ID = "plan-sel";
/** Sunday September 27, 2026, 10:00 in Los Angeles. */
const PLAN_DATE = new Date("2026-09-27T17:00:00Z");

const preferences = (
  partial: Partial<SchedulingPreferences>
): SchedulingPreferences => ({
  schedulePreference: null,
  preferredWeeks: [],
  timePreferenceOptionIds: [],
  maxPlansPerDay: null,
  maxPlansPerMonth: null,
  ...partial,
});

const context = (
  partial: Partial<SchedulingPreferenceContext> = {}
): SchedulingPreferenceContext => ({
  referenceDate: PLAN_DATE,
  orgTimeZone: ORG_TIME_ZONE,
  planId: PLAN_ID,
  ...partial,
});

const served = (
  isoDate: string,
  planId: string,
  partial: Partial<ServiceHistoryItem> = {}
): ServiceHistoryItem => ({
  id: `${planId}:${isoDate}`,
  sourceScheduleId: `pp-${planId}`,
  planId,
  date: new Date(isoDate),
  teamPositionName: "Electric Guitar",
  status: "C",
  timeType: "service",
  ...partial,
});

describe(scoreSchedulingPreferences, () => {
  it("asks nothing of people who serve every week or as often as needed", () => {
    for (const schedulePreference of ["Every week", "As often as needed"]) {
      expect(
        scoreSchedulingPreferences(
          preferences({ schedulePreference }),
          [served("2026-09-20T17:00:00Z", "plan-sep20")],
          context()
        )
      ).toStrictEqual({ penalty: 0, reasoning: [] });
    }
  });

  it("ranks people lower when they asked not to serve the position", () => {
    expect(
      scoreSchedulingPreferences(
        preferences({ schedulePreference: "Unavailable" }),
        [],
        context()
      )
    ).toStrictEqual({
      penalty: 100,
      reasoning: [
        "Marked Unavailable for this position in Planning Center",
        "Ranked lower: asked not to be scheduled here",
      ],
    });
  });

  it("lowers every-other-week people who serve the week before or after", () => {
    const result = scoreSchedulingPreferences(
      preferences({ schedulePreference: "Every other week" }),
      [
        served("2026-09-20T17:00:00Z", "plan-sep20"),
        served("2026-10-04T17:00:00Z", "plan-oct4"),
      ],
      context()
    );
    expect(result).toStrictEqual({
      penalty: 25,
      reasoning: [
        "Prefers to serve every other week",
        "Ranked lower: served 7 days before",
        "Ranked lower: serving 7 days after",
      ],
    });
  });

  it("counts every-nth-week gaps in the org's calendar days, not UTC", () => {
    // Saturday September 13, 17:30 in Los Angeles: already September 14 in UTC.
    const evening = served("2026-09-14T00:30:00Z", "plan-sep13");
    expect(
      scoreSchedulingPreferences(
        preferences({ schedulePreference: "Every other week" }),
        [evening],
        context()
      )
    ).toStrictEqual({
      penalty: 0,
      reasoning: ["Prefers to serve every other week; this plan fits"],
    });
    expect(
      scoreSchedulingPreferences(
        preferences({ schedulePreference: "Every 3rd week" }),
        [evening],
        context()
      )
    ).toStrictEqual({
      penalty: 25,
      reasoning: [
        "Prefers to serve every 3rd week",
        "Ranked lower: served 14 days before",
      ],
    });
  });

  it("leaves the selected plan, rehearsals, and declines out of the gap", () => {
    expect(
      scoreSchedulingPreferences(
        preferences({ schedulePreference: "Every other week" }),
        [
          served("2026-09-27T17:00:00Z", PLAN_ID),
          served("2026-09-24T02:00:00Z", "plan-sep27", {
            timeType: "rehearsal",
          }),
          served("2026-09-20T17:00:00Z", "plan-sep20", { status: "D" }),
        ],
        context()
      )
    ).toStrictEqual({
      penalty: 0,
      reasoning: ["Prefers to serve every other week; this plan fits"],
    });
  });

  it("counts monthly preferences against other service days in the plan's org month", () => {
    // Wednesday September 30, 18:00 in Los Angeles: October 1 in UTC.
    const monthEnd = new Date("2026-10-01T01:00:00Z");
    const history = [
      served("2026-09-06T17:00:00Z", "plan-sep6"),
      served("2026-10-04T17:00:00Z", "plan-oct4"),
    ];
    expect(
      scoreSchedulingPreferences(
        preferences({ schedulePreference: "Once a month" }),
        history,
        context({ referenceDate: monthEnd })
      )
    ).toStrictEqual({
      penalty: 25,
      reasoning: [
        "Prefers to serve once a month",
        "Ranked lower: already serving 1 other day in September 2026",
      ],
    });
    expect(
      scoreSchedulingPreferences(
        preferences({ schedulePreference: "Twice a month" }),
        history,
        context({ referenceDate: monthEnd })
      )
    ).toStrictEqual({
      penalty: 0,
      reasoning: ["Prefers to serve twice a month; this plan fits"],
    });
  });

  it("reads the week of the month from the org's calendar day", () => {
    // Wednesday October 7, 18:00 in Los Angeles (week 1): October 8 (week 2) in UTC.
    const weekOne = context({
      referenceDate: new Date("2026-10-08T01:00:00Z"),
    });
    expect(
      scoreSchedulingPreferences(
        preferences({
          schedulePreference: "Choose Weeks",
          preferredWeeks: [1, 3],
        }),
        [],
        weekOne
      )
    ).toStrictEqual({
      penalty: 0,
      reasoning: ["Prefers weeks 1 and 3 of the month; this plan is in week 1"],
    });
    expect(
      scoreSchedulingPreferences(
        preferences({
          schedulePreference: "Choose Weeks",
          preferredWeeks: [2],
        }),
        [],
        weekOne
      )
    ).toStrictEqual({
      penalty: 25,
      reasoning: [
        "Prefers week 2 of the month",
        "Ranked lower: this plan is in week 1",
      ],
    });
  });

  it("lowers people who already reached their monthly plan limit", () => {
    const history = [
      served("2026-09-06T17:00:00Z", "plan-sep6"),
      // Rehearsal and service rows of one plan count as one plan.
      served("2026-09-10T02:00:00Z", "plan-sep13", { timeType: "rehearsal" }),
      served("2026-09-13T17:00:00Z", "plan-sep13"),
      served("2026-09-20T17:00:00Z", "plan-sep20", { status: "D" }),
      served("2026-10-04T17:00:00Z", "plan-oct4"),
    ];
    expect(
      scoreSchedulingPreferences(
        preferences({ maxPlansPerMonth: 2 }),
        history,
        context()
      )
    ).toStrictEqual({
      penalty: 30,
      reasoning: [
        "At most 2 plans a month",
        "Ranked lower: already on 2 other plans in September 2026",
      ],
    });
    expect(
      scoreSchedulingPreferences(
        preferences({ maxPlansPerMonth: 3 }),
        history,
        context()
      )
    ).toStrictEqual({
      penalty: 0,
      reasoning: ["At most 3 plans a month; this plan fits"],
    });
  });

  it("mentions the daily limit only once it is reached", () => {
    const otherPlanSameDay = served("2026-09-27T23:00:00Z", "plan-evening");
    expect(
      scoreSchedulingPreferences(
        preferences({ maxPlansPerDay: 1 }),
        [served("2026-09-27T17:00:00Z", PLAN_ID)],
        context()
      )
    ).toStrictEqual({ penalty: 0, reasoning: [] });
    expect(
      scoreSchedulingPreferences(
        preferences({ maxPlansPerDay: 1 }),
        [served("2026-09-27T17:00:00Z", PLAN_ID), otherPlanSameDay],
        context()
      )
    ).toStrictEqual({
      penalty: 30,
      reasoning: [
        "At most 1 plan a day",
        "Ranked lower: already on 1 other plan that day",
      ],
    });
  });

  it("lowers people whose preferred service times leave out the slot's time", () => {
    const earlyOnly = preferences({ timePreferenceOptionIds: ["tpo-9am"] });
    expect(
      scoreSchedulingPreferences(
        earlyOnly,
        [],
        context({ slotTimePreferenceOptionId: "tpo-11am" })
      )
    ).toStrictEqual({
      penalty: 20,
      reasoning: [
        "Prefers other service times",
        "Ranked lower: not this slot's service time",
      ],
    });
    expect(
      scoreSchedulingPreferences(
        earlyOnly,
        [],
        context({ slotTimePreferenceOptionId: "tpo-9am" })
      ).penalty
    ).toBe(0);
    expect(
      scoreSchedulingPreferences(
        earlyOnly,
        [],
        context({ slotTimePreferenceOptionId: null })
      ).penalty
    ).toBe(0);
    expect(
      scoreSchedulingPreferences(
        preferences({}),
        [],
        context({ slotTimePreferenceOptionId: "tpo-11am" })
      ).penalty
    ).toBe(0);
  });

  it("adds up penalties from several preferences", () => {
    expect(
      scoreSchedulingPreferences(
        preferences({
          schedulePreference: "Once a month",
          maxPlansPerMonth: 1,
          timePreferenceOptionIds: ["tpo-9am"],
        }),
        [served("2026-09-13T17:00:00Z", "plan-sep13")],
        context({ slotTimePreferenceOptionId: "tpo-11am" })
      ).penalty
    ).toBe(75);
  });
});
