import { expandPlanWindowHistory } from "@pcobooster/planning-center-models/plan-window-history";
import type {
  PlanWindowRosters,
  WindowRosterRow,
} from "@pcobooster/planning-center-models/plan-window-history";
import {
  assemblePositionCandidates,
  mergeAssignmentLabels,
} from "@pcobooster/planning-center-models/position-candidates";
import type { PositionCandidate } from "@pcobooster/planning-center-models/position-candidates";
import { describe, expect, it } from "vitest";

const row = (overrides: Partial<WindowRosterRow>): WindowRosterRow => ({
  id: "pp-1",
  planId: "plan-ok",
  teamId: "team-1",
  teamPositionName: "Band - Vocals",
  status: "C",
  createdAt: "2026-02-01T00:00:00Z",
  timeIds: [],
  serviceTimeIds: [],
  declineReason: null,
  ...overrides,
});

const call = (rows: WindowRosterRow[]): PlanWindowRosters => ({
  plans: [
    {
      id: "plan-ok",
      title: "Ok",
      sortDate: "2026-02-12T00:00:00Z",
      serviceTypeName: "Sunday",
    },
    {
      id: "plan-no",
      title: "Declined plan",
      sortDate: "2026-02-10T00:00:00Z",
      serviceTypeName: "Sunday",
    },
  ],
  planTimes: [
    {
      id: "t-service",
      startsAt: "2026-02-12T17:00:00Z",
      timeType: "service",
    },
    {
      id: "t-rehearsal",
      startsAt: "2026-02-11T02:00:00Z",
      timeType: "rehearsal",
    },
  ],
  people: [{ personId: "p1", rows }],
});

describe(expandPlanWindowHistory, () => {
  it("leaves declined rows out of history but keeps them for slot matching", () => {
    const history = expandPlanWindowHistory(
      [
        call([
          row({ id: "pp-d", planId: "plan-no", status: "D" }),
          row({ id: "pp-c" }),
        ]),
      ],
      "plan-no"
    ).get("p1");

    expect({
      sources: history?.serviceHistory.map((item) => item.sourceScheduleId),
      selected: history?.selectedPlanAssignments.map(({ id }) => id),
    }).toStrictEqual({ sources: ["pp-c"], selected: ["pp-d"] });
  });

  it("splits assigned service and rehearsal times into their own items", () => {
    const history = expandPlanWindowHistory(
      [
        call([
          row({
            timeIds: ["t-service", "t-rehearsal"],
            serviceTimeIds: ["t-service"],
          }),
        ]),
      ],
      "plan-x"
    ).get("p1");

    expect(
      history?.serviceHistory.map(({ id, timeType, date, planTitle }) => ({
        id,
        timeType,
        date: date.toISOString(),
        planTitle,
      }))
    ).toStrictEqual([
      {
        id: "pp-1:t-service",
        timeType: "service",
        date: "2026-02-12T17:00:00.000Z",
        planTitle: "Ok",
      },
      {
        id: "pp-1:t-rehearsal",
        timeType: "rehearsal",
        date: "2026-02-11T02:00:00.000Z",
        planTitle: "Ok",
      },
    ]);
  });
});

describe(mergeAssignmentLabels, () => {
  it("only dedupes exact labels so hyphenated position names stay intact", () => {
    expect(
      mergeAssignmentLabels(
        ["Band - Bass Guitar"],
        ["Bass Guitar", "Band - Bass Guitar"]
      )
    ).toStrictEqual(["Band - Bass Guitar", "Bass Guitar"]);
  });
});

describe(assemblePositionCandidates, () => {
  const candidate: PositionCandidate = {
    id: "p1",
    firstName: "Pat",
    lastName: "Person",
    fullName: "Pat Person",
    photoUrl: null,
    photoThumbnailUrl: null,
    archived: false,
    selectedPlanRosterLabels: ["Band - Vocals"],
    selectedPlanSlot: {
      planPersonId: "pp-selected",
      status: "confirmed",
      declineReason: null,
    },
  };

  it("applies the roster's slot status and merges history's labels", () => {
    const { people } = assemblePositionCandidates({
      candidates: [candidate],
      match: { planId: "plan-ok", selectedPositionName: "Vocals" },
      referenceDate: new Date("2026-02-22T00:00:00Z"),
      timeZone: "UTC",
      historyFor: () => ({
        serviceHistory: [],
        selectedPlanAssignments: [
          {
            source: "planPerson",
            id: "pp-keys",
            planId: "plan-ok",
            teamId: "team-1",
            teamName: null,
            teamPositionName: "Band - Keys",
            status: "U",
            planPersonId: null,
            declineReason: null,
          },
        ],
      }),
      blockedFor: () => false,
    });

    expect(people[0]).toMatchObject({
      isScheduledForSelectedPlanPosition: true,
      isConfirmedForSelectedPlanPosition: true,
      isDeclinedForSelectedPlanPosition: false,
      scheduledPlanPersonId: "pp-selected",
      selectedPlanAssignmentLabels: ["Band - Vocals", "Band - Keys"],
    });
  });
});
