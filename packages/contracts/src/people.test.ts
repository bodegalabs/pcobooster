import {
  peopleListInputSchema,
  peopleMyScheduledPlansInputSchema,
  peopleWarmupOutputSchema,
} from "@worship-admin/contracts/people";
import {
  blockoutSchema,
  peopleDashboardDataSchema,
  peopleDashboardPersonDetailSchema,
  personWithAvailabilitySchema,
  scheduleHistoryResponseSchema,
} from "@worship-admin/contracts/people-schemas";
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

  it("preserves dashboard counts, per-day details, and request budgets", () => {
    const dashboard = {
      range: "month",
      generatedAt: "2026-09-19T17:00:00Z",
      month,
      people: [dashboardPerson],
      stats: { scheduledPeople: 1, highLoadPeople: 0, availableSoonPeople: 1 },
      monthDays: [
        {
          day: 20,
          serviceCount: 1,
          confirmedServiceCount: 1,
          potentialServiceCount: 0,
          rehearsalCount: 0,
          blockoutCount: 0,
        },
      ],
      matrixDays: [20],
      requestBudget: {
        teamRequests: 1,
        scheduleRequests: 1,
        blockoutRequests: 1,
        rosterPeopleCount: 1,
        hydratedPeopleCount: 1,
        sampled: false,
      },
    };
    const detail = {
      generatedAt: dashboard.generatedAt,
      month,
      previousMonth: "2026-08",
      nextMonth: "2026-10",
      person: dashboardPerson,
      trend: [
        { month: "2026-09", label: "September", services: 2, rehearsals: 1 },
      ],
      requestBudget: { scheduleRequests: 1, blockoutRequests: 1 },
    };

    expect(peopleDashboardDataSchema.parse(dashboard)).toStrictEqual(dashboard);
    expect(peopleDashboardPersonDetailSchema.parse(detail)).toStrictEqual(
      detail
    );
  });

  it("keeps false availability flags distinct from absent optional flags", () => {
    const person = {
      id: "person-1",
      firstName: "A",
      lastName: "Person",
      fullName: "A Person",
      photoUrl: null,
      photoThumbnailUrl: null,
      archived: false,
      positions: [],
      isBlockedForDate: false,
      isScheduledForSelectedPlanPosition: false,
      isConfirmedForSelectedPlanPosition: false,
      isDeclinedForSelectedPlanPosition: false,
      selectedPlanDeclineReason: null,
      selectedPlanAssignmentLabels: [],
      frequency,
    };

    expect(personWithAvailabilitySchema.parse(person)).toStrictEqual(person);
    expect(personWithAvailabilitySchema.parse(person)).not.toHaveProperty(
      "availability"
    );
  });

  it("retains the full plan instant and bounds batch lookups", () => {
    const input = {
      serviceTypeId: "service-1",
      positionId: "position-1",
      date: "2026-09-20T00:30:00-07:00",
    };

    expect(peopleListInputSchema.parse(input)).toStrictEqual(input);
    expect(
      peopleMyScheduledPlansInputSchema.safeParse({
        planIds: Array.from({ length: 501 }, (_, index) => String(index)),
      }).success
    ).toBeFalsy();
    expect(
      peopleWarmupOutputSchema.safeParse({ warmed: false }).success
    ).toBeFalsy();
  });
});
