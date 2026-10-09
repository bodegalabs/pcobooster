import {
  peopleCandidateDetailsInputSchema,
  peoplePlanWindowHistoryInputSchema,
} from "@pcobooster/contracts/http/people";
import {
  blockoutSchema,
  candidateHistorySchema,
  peopleDashboardActivityBatchSchema,
  peopleDashboardPersonDetailSchema,
  peopleDashboardPersonSchema,
  peopleDashboardRosterSchema,
  positionCandidatesSchema,
} from "@pcobooster/contracts/http/people-schemas";
import { PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE } from "@pcobooster/contracts/people";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

const rhythm = {
  lastServedOn: "2026-09-13",
  nextServingOn: null,
  servedDays30: 1,
  servedDays90: 3,
  servedDays180: 6,
  upcomingDays30: 0,
  typicalGapDays: 21,
  requests180: 7,
  declined180: 1,
  pendingUpcoming: 0,
  nextPendingOn: null,
};

const dashboardPerson = {
  id: "person-1",
  name: "Person",
  initials: "P",
  photoThumbnailUrl: null,
  teams: ["Band"],
  rhythm,
  roles: ["Keys"],
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

const candidateHistory = {
  serviceHistory: [
    {
      id: "schedule-1",
      sourceScheduleId: "schedule-1",
      planId: "plan-1",
      date: new Date("2026-09-13T17:00:00Z"),
      teamPositionName: "Keys",
      status: "C",
      timeType: "service",
    },
  ],
  selectedPlanAssignments: [],
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
    expect(Schema.decodeUnknownSync(blockoutSchema)(blockout)).toStrictEqual(
      blockout
    );
    expect(
      Schema.decodeUnknownSync(candidateHistorySchema)(candidateHistory)
    ).toStrictEqual(candidateHistory);
    expect(() =>
      Schema.decodeUnknownSync(blockoutSchema)({
        ...blockout,
        startsAt: blockout.startsAt.toISOString(),
      })
    ).toThrow(Schema.SchemaError);
    expect(() =>
      Schema.decodeUnknownSync(candidateHistorySchema)({
        ...candidateHistory,
        serviceHistory: [
          {
            ...candidateHistory.serviceHistory[0],
            date: "2026-09-13T17:00:00Z",
          },
        ],
      })
    ).toThrow(Schema.SchemaError);
  });

  it("splits a dashboard person into roster identity and batch activity", () => {
    const {
      id,
      name,
      initials,
      photoThumbnailUrl,
      teams,
      rhythm: _rhythm,
      ...activity
    } = dashboardPerson;
    const roster = {
      generatedAt: "2026-09-19T17:00:00Z",
      month,
      people: [{ id, name, initials, photoThumbnailUrl, teams }],
      teams: [
        {
          id: "team-1",
          name: "Band",
          serviceTypeName: null,
          personIds: [id],
        },
      ],
      ledTeamIds: ["team-1"],
    };
    const batch = {
      generatedAt: roster.generatedAt,
      people: [{ id, rhythm, ...activity }],
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
      requestBudget: {
        limit: 36,
        planningCenterRequests: 4,
        unresolvedRehearsalTimes: 0,
      },
      continuation: null,
    };

    expect(
      Schema.decodeUnknownSync(peopleDashboardRosterSchema)(roster)
    ).toStrictEqual(roster);
    expect(
      Schema.decodeUnknownSync(peopleDashboardActivityBatchSchema)(batch)
    ).toStrictEqual(batch);
    // A person detail carries the same rhythm the dashboard reads.
    expect(
      Schema.decodeUnknownSync(peopleDashboardPersonSchema)({
        ...roster.people[0],
        ...activity,
        rhythm,
      })
    ).toStrictEqual(dashboardPerson);
    expect(() =>
      Schema.decodeUnknownSync(peopleDashboardPersonSchema)({
        ...roster.people[0],
        ...activity,
      })
    ).toThrow(Schema.SchemaError);
    expect(
      Schema.decodeUnknownSync(peopleDashboardPersonDetailSchema)(detail)
    ).toStrictEqual(detail);
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
          schedulingPreferences: {
            schedulePreference: "Choose Weeks",
            preferredWeeks: [1, 3],
            timePreferenceOptionIds: ["tpo-9am"],
            maxPlansPerDay: 1,
            maxPlansPerMonth: null,
          },
        },
      ],
    };

    expect(
      Schema.decodeUnknownSync(positionCandidatesSchema)(candidates)
    ).toStrictEqual(candidates);
    expect(() =>
      Schema.decodeUnknownSync(positionCandidatesSchema)({
        ...candidates,
        candidates: [
          { ...candidates.candidates[0], selectedPlanSlot: undefined },
        ],
      })
    ).toThrow(Schema.SchemaError);
  });

  it("retains the full plan instant and bounds batch lookups", () => {
    const history = { date: "2026-09-20T00:30:00-07:00" };

    expect(
      Schema.decodeUnknownSync(peoplePlanWindowHistoryInputSchema)(history)
    ).toStrictEqual(history);
    expect(() =>
      Schema.decodeUnknownSync(peoplePlanWindowHistoryInputSchema)({
        date: "2026-09-20",
      })
    ).toThrow(Schema.SchemaError);
    expect(() =>
      Schema.decodeUnknownSync(peopleCandidateDetailsInputSchema)({
        personIds: Array.from(
          { length: PEOPLE_CANDIDATE_DETAILS_BATCH_SIZE + 1 },
          (_, index) => String(index)
        ),
        planId: "plan-1",
        date: history.date,
        scheduleHistory: false,
      })
    ).toThrow(Schema.SchemaError);
    const continuation = {
      personIds: ["1"],
      planId: "plan-1",
      date: history.date,
      scheduleHistory: false,
      continuation: {
        people: [
          {
            personId: "1",
            blocked: false,
            blockoutsOffset: null,
            pendingBlockouts: [
              { blockoutId: "blockout-1", timeZone: null, datesOffset: 100 },
            ],
            rehearsalTimes: {
              plans: [{ planId: "plan-2", nextOffset: 100 }],
              times: [{ id: "time-1", timeType: "rehearsal", startsAt: null }],
            },
          },
        ],
      },
    };
    expect(
      Schema.decodeUnknownSync(peopleCandidateDetailsInputSchema)(continuation)
    ).toStrictEqual(continuation);
    // A page offset is a whole, non-negative number; anything else is not a cursor.
    expect(() =>
      Schema.decodeUnknownSync(peopleCandidateDetailsInputSchema)({
        ...continuation,
        continuation: {
          people: [
            {
              personId: "1",
              blocked: false,
              blockoutsOffset: -100,
              pendingBlockouts: [],
              rehearsalTimes: { plans: [], times: [] },
            },
          ],
        },
      })
    ).toThrow(Schema.SchemaError);
  });
});
