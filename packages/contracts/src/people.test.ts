import {
  PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE,
  peopleCandidateDetailsInputSchema,
  peopleMyScheduledPlansInputSchema,
  peoplePlanWindowHistoryInputSchema,
} from "@pcobooster/contracts/people";
import {
  blockoutSchema,
  peopleDashboardActivityBatchSchema,
  peopleDashboardPersonDetailSchema,
  peopleDashboardPersonSchema,
  peopleDashboardRosterSchema,
  positionCandidatesSchema,
  scheduleHistoryResponseSchema,
} from "@pcobooster/contracts/people-schemas";
import { describe, expect, it } from "vitest";

const dashboardPerson = {
  id: "person-1",
  name: "Person",
  initials: "P",
  photoThumbnailUrl: null,
  teams: ["Band"],
  roles: "Keys",
  status: "Available",
  load: "normal",
  lastServed: "Yesterday",
  lastRehearsal: "Thursday",
  nextScheduled: "Sunday",
  nextRehearsal: "Saturday",
  monthCount: 2,
  thirtyDayCount: 3,
  ninetyDayCount: 9,
  upcomingCount: 1,
  streak: "Two weeks",
  highlight: "Regular rotation",
  monthDays: [
    {
      day: 20,
      kind: "service",
      positionName: "Keys",
      serviceTypeName: "Sunday",
      status: "C",
      planUrl: "https://services.planningcenteronline.com/plans/plan-1",
    },
  ],
};

const month = {
  year: 2026,
  monthIndex: 8,
  label: "September 2026",
  daysInMonth: 30,
  startsOnWeekday: 2,
};

const frequency = {
  recentServedDays: 1,
  last60Days: 2,
  last90Days: 3,
  lastServedDate: new Date("2026-09-13T17:00:00Z"),
  totalServed: 10,
  recentRehearsalOnlyDays: 1,
  rehearsalLast60Days: 2,
  rehearsalLast90Days: 3,
  lastRehearsalDate: new Date("2026-09-12T17:00:00Z"),
  totalRehearsals: 10,
  upcomingServices: 1,
  nextUpcomingDate: new Date("2026-09-20T17:00:00Z"),
  upcomingRehearsals: 1,
  nextRehearsalDate: new Date("2026-09-19T17:00:00Z"),
};

describe("people read contracts", () => {
  it("retains real dates throughout blockouts and schedule history", () => {
    const blockout = {
      id: "blockout-1",
      reason: "Unavailable",
      description: "Travel",
      startsAt: new Date("2026-09-20T00:00:00Z"),
      endsAt: new Date("2026-09-21T00:00:00Z"),
      share: false,
      timeZone: "America/Los_Angeles",
    };
    const history = {
      planPeople: [
        {
          id: "plan-person-1",
          status: "C",
          createdAt: new Date("2026-09-01T00:00:00Z"),
          teamPositionName: "Keys",
          planTitle: "Sunday",
          planDate: new Date("2026-09-20T17:00:00Z"),
          declineReason: "",
        },
      ],
      frequency,
    };

    expect(blockoutSchema.parse(blockout)).toStrictEqual(blockout);
    expect(scheduleHistoryResponseSchema.parse(history)).toStrictEqual(history);
    expect(
      blockoutSchema.safeParse({
        ...blockout,
        startsAt: blockout.startsAt.toISOString(),
      }).success
    ).toBeFalsy();
    expect(
      scheduleHistoryResponseSchema.safeParse({
        ...history,
        frequency: { ...frequency, lastServedDate: "2026-09-13T17:00:00Z" },
      }).success
    ).toBeFalsy();
  });

  it("splits a dashboard person into roster identity and batch activity", () => {
    const { id, name, initials, photoThumbnailUrl, teams, ...activity } =
      dashboardPerson;
    const roster = {
      generatedAt: "2026-09-19T17:00:00Z",
      month,
      people: [{ id, name, initials, photoThumbnailUrl, teams }],
    };
    const batch = {
      generatedAt: roster.generatedAt,
      people: [{ id, ...activity }],
      deferredPersonIds: ["person-2"],
      requestBudget: {
        limit: 40,
        planningCenterRequests: 3,
        scheduleRequests: 1,
        planTimeRequests: 1,
      },
    };
    const detail = {
      generatedAt: roster.generatedAt,
      month,
      previousMonth: "2026-08",
      nextMonth: "2026-10",
      person: dashboardPerson,
      trend: [
        { month: "2026-09", label: "September", services: 2, rehearsals: 1 },
      ],
      requestBudget: { scheduleRequests: 1, blockoutRequests: 1 },
    };

    expect(peopleDashboardRosterSchema.parse(roster)).toStrictEqual(roster);
    expect(peopleDashboardActivityBatchSchema.parse(batch)).toStrictEqual(
      batch
    );
    expect(
      peopleDashboardPersonSchema.parse({ ...roster.people[0], ...activity })
    ).toStrictEqual(dashboardPerson);
    expect(peopleDashboardPersonDetailSchema.parse(detail)).toStrictEqual(
      detail
    );
  });

  it("keeps an empty slot distinct from a missing one", () => {
    const candidates = {
      generatedAt: "2026-09-20T00:00:00Z",
      timeZone: "America/Los_Angeles",
      match: { planId: "plan-1" },
      candidates: [
        {
          id: "person-1",
          firstName: "A",
          lastName: "Person",
          fullName: "A Person",
          photoUrl: null,
          photoThumbnailUrl: null,
          archived: false,
          selectedPlanRosterLabels: [],
          selectedPlanSlot: null,
        },
      ],
    };

    expect(positionCandidatesSchema.parse(candidates)).toStrictEqual(
      candidates
    );
    expect(
      positionCandidatesSchema.safeParse({
        ...candidates,
        candidates: [
          { ...candidates.candidates[0], selectedPlanSlot: undefined },
        ],
      }).success
    ).toBeFalsy();
  });

  it("retains the full plan instant and bounds batch lookups", () => {
    const history = { date: "2026-09-20T00:30:00-07:00" };

    expect(peoplePlanWindowHistoryInputSchema.parse(history)).toStrictEqual(
      history
    );
    expect(
      peoplePlanWindowHistoryInputSchema.safeParse({ date: "2026-09-20" })
        .success
    ).toBeFalsy();
    expect(
      peopleCandidateDetailsInputSchema.safeParse({
        personIds: Array.from(
          { length: PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE + 1 },
          (_, index) => String(index)
        ),
        planId: "plan-1",
        date: history.date,
        scheduleHistory: false,
      }).success
    ).toBeFalsy();
    expect(
      peopleMyScheduledPlansInputSchema.safeParse({
        planIds: Array.from({ length: 501 }, (_, index) => String(index)),
      }).success
    ).toBeFalsy();
  });
});
