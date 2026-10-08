import { PositionMismatch } from "@pcobooster/contracts/faults/position-mismatch";
import { RateLimited } from "@pcobooster/contracts/faults/rate-limited";
import { buildScheduleDays } from "@pcobooster/planning-center-models/schedule-days";
import type {
  PersonWithAvailability,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

import {
  allSlots,
  assignFailureMessage,
  emptyCandidatesMessage,
  openLabel,
  openSlotsLabel,
  someoneElseDisabledReason,
  candidatePresentation,
  dayEntries,
  dayLabel,
  fitTone,
  nearestBusyDay,
  nextOpenSlot,
  preferenceLines,
  reconcileRoster,
  resolveSlot,
  rosterPersonFor,
  selectedSlot,
} from "./presentation";

const groups: TeamPositionGroup[] = [
  {
    teamId: "t",
    teamName: "Band",
    positions: [
      { id: "p1", teamId: "t", name: "Guitar", neededCount: 0 },
      { id: "p2", teamId: "t", name: "Keys", neededCount: 1 },
      { id: "p3", teamId: "t", name: "Bass", neededCount: 1 },
    ],
  },
];
const date = new Date("2026-10-05T01:00:00Z");
const zone = "America/Los_Angeles";
const person: PersonWithAvailability = {
  id: "a",
  firstName: "A",
  lastName: "Person",
  fullName: "A Person",
  archived: false,
  photoUrl: null,
  photoThumbnailUrl: null,
  positions: [],
};

const fallback = (error: Error) => `fallback: ${error.message}`;

describe("Swift Assign presentation rules", () => {
  it("resolves stale links to the first open slot and wraps next open without selecting itself", () => {
    expect(resolveSlot(groups, "stale", "missing")?.position.id).toBe("p2");
    expect(resolveSlot(groups, undefined, "p1")?.position.id).toBe("p1");
    expect(nextOpenSlot(groups, allSlots(groups)[2])?.position.id).toBe("p2");
    expect(
      nextOpenSlot(
        [{ ...groups[0], positions: [groups[0].positions[1]] }],
        allSlots(groups)[1]
      )
    ).toBeUndefined();
  });

  it("uses the Swift fit tone thresholds", () => {
    expect([0, 49, 50, 79, 80, 100].map(fitTone)).toStrictEqual([
      "declined",
      "declined",
      "pending",
      "pending",
      "confirmed",
      "confirmed",
    ]);
  });

  it("shows conflicts, suppresses own-slot labels, and disables blocked and declined adds", () => {
    const [slot] = allSlots(groups);
    const result = candidatePresentation(
      {
        ...person,
        isBlockedForDate: true,
        selectedPlanAssignmentLabels: ["Band - Guitar", "Band - Keys"],
        recommendationScore: 79.5,
      },
      slot,
      date,
      zone
    );
    expect({
      others: result.others,
      reason: result.disabledReason,
      fit: result.showsFit,
      score: result.score,
    }).toStrictEqual({
      others: ["Band - Keys"],
      reason: "Blocked out for this date",
      fit: false,
      score: 80,
    });
    expect(
      candidatePresentation(
        { ...person, isDeclinedForSelectedPlanPosition: true },
        slot,
        date,
        zone
      ).disabledReason
    ).toBe("Declined this position");
  });

  it("reconciles an optimistic assignment and its rollback from the shared lineup", () => {
    const position = {
      ...groups[0].positions[0],
      filledPeople: [
        {
          id: "a",
          personId: "a",
          name: person.fullName,
          planPersonId: "temp",
          rawStatus: "U",
          notification: { prepared: false, sentAt: null, senderName: null },
          status: "pending" as const,
        },
      ],
    };
    const [assigned] = reconcileRoster([person], position);
    expect({
      scheduled: assigned.isScheduledForSelectedPlanPosition,
      id: assigned.scheduledPlanPersonId,
    }).toStrictEqual({ scheduled: true, id: "temp" });
    expect(
      reconcileRoster([assigned], groups[0].positions[0])[0]
        .isScheduledForSelectedPlanPosition
    ).toBeFalsy();
  });

  it("keeps a declined person unavailable from fresh reads alone", () => {
    const declined = {
      ...person,
      isScheduledForSelectedPlanPosition: true,
      isDeclinedForSelectedPlanPosition: true,
      scheduledPlanPersonId: "pp",
    };
    const [updated] = reconcileRoster([declined], groups[0].positions[0]);
    expect({
      declined: updated.isDeclinedForSelectedPlanPosition,
      scheduled: updated.isScheduledForSelectedPlanPosition,
    }).toStrictEqual({ declined: true, scheduled: true });
    const [confirmed] = reconcileRoster(
      [{ ...declined, isDeclinedForSelectedPlanPosition: false }],
      {
        ...groups[0].positions[0],
        filledPeople: [
          {
            id: "a",
            personId: "a",
            planPersonId: "pp",
            name: "A Person",
            photoThumbnailUrl: null,
            status: "confirmed",
            rawStatus: "C",
            notification: null,
          },
        ],
      }
    );
    expect(confirmed.isConfirmedForSelectedPlanPosition).toBeTruthy();
  });

  it("offers a status menu only to people scheduled on the slot", () => {
    const [position] = groups[0].positions;
    expect(
      rosterPersonFor({ ...person, scheduledPlanPersonId: "stale" }, position)
    ).toBeUndefined();
    expect(
      rosterPersonFor(
        {
          ...person,
          isScheduledForSelectedPlanPosition: true,
          isDeclinedForSelectedPlanPosition: true,
          scheduledPlanPersonId: "pp",
        },
        position
      )
    ).toMatchObject({ planPersonId: "pp", rawStatus: "D" });
  });

  it("keeps a custom position open when a refetch drops it before anyone fills it", () => {
    const custom = "plan-member-position:t:banjo";
    expect(selectedSlot(groups, `t|${custom}`)?.position).toMatchObject({
      id: custom,
      name: "Banjo",
      source: "custom",
    });
    expect(selectedSlot(groups, "t|p2")?.position.id).toBe("p2");
    expect(selectedSlot(groups, `missing|${custom}`)).toBeUndefined();
    expect(selectedSlot(groups, "t|missing")).toBeUndefined();
  });

  it("ports readable Planning Center preferences", () => {
    expect(
      preferenceLines({
        schedulePreference: " Every other week ",
        preferredWeeks: [3, 1],
        timePreferenceOptionIds: [],
        maxPlansPerDay: 1,
        maxPlansPerMonth: 3,
      })
    ).toStrictEqual([
      "Prefers every other week",
      "Weeks 1 and 3 of the month",
      "At most 1 plan a day",
      "At most 3 plans a month",
    ]);
  });

  it("groups history in the org zone, deduplicates day details, and picks a nearby busy day", () => {
    const item = {
      id: "h",
      sourceScheduleId: "s",
      date,
      teamPositionName: "Keys",
      status: "C" as const,
      timeType: "service" as const,
    };
    const days = buildScheduleDays([item, item], date, zone);
    const day = days.find((entry) => entry.offset === 0);
    if (day === undefined) {
      throw new Error("Expected plan day");
    }
    expect(day.dayKey).toBe("2026-10-04");
    expect(dayLabel(day)).toBe("Oct 4");
    expect(dayEntries(day)).toStrictEqual([item]);
    expect(nearestBusyDay(days, 26)).toBe(day);
    expect(nearestBusyDay(days, 20)).toBeUndefined();
  });

  it("names the failure under the row as Swift's assignMessage does", () => {
    expect(
      assignFailureMessage(
        new PositionMismatch({
          message: "mismatch",
          details: {
            selected: {
              teamId: "t",
              teamName: "Band",
              positionId: "p",
              positionName: "Keys",
            },
            created: { planPersonId: "pp", teamPositionName: "Band - Piano" },
          },
        }),
        fallback
      )
    ).toBe('Created in "Band - Piano" instead of "Band - Keys".');
    expect(
      assignFailureMessage(
        new RateLimited({
          message: "busy",
          service: "planning-center",
          retryAfterSeconds: 0.2,
        }),
        fallback
      )
    ).toBe("Planning Center is busy. Try again in 1 seconds.");
    expect(
      assignFailureMessage(
        new RateLimited({ message: "busy", service: "planning-center" }),
        fallback
      )
    ).toBe("Planning Center is busy. Try again in a moment.");
    expect(assignFailureMessage(new Error("offline"), fallback)).toBe(
      "fallback: offline"
    );
  });

  it("labels positions in the title menu and the open-slots row as Swift does", () => {
    const [position] = groups[0].positions;
    expect([
      openLabel({ ...position, neededCount: 0 }),
      openLabel({ ...position, neededCount: 0, filledConfirmedCount: 1 }),
      openLabel({ ...position, neededCount: 1, filledConfirmedCount: 1 }),
      openLabel({ ...position, neededCount: 3 }),
    ]).toStrictEqual(["No one yet", "Filled", "1 open", "3 open"]);
    expect([0, 1, 2].map(openSlotsLabel)).toStrictEqual([
      "No open slots",
      "1 open slot",
      "2 open slots",
    ]);
  });

  it("explains why Someone else is off and what an empty roster means", () => {
    expect([
      someoneElseDisabledReason(false, false),
      someoneElseDisabledReason(true, false),
      someoneElseDisabledReason(true, true),
    ]).toStrictEqual([
      "Scheduling is turned off for you here.",
      "You can schedule team members, but can't search the rest of your church.",
      undefined,
    ]);
    const [position] = groups[0].positions;
    expect([
      emptyCandidatesMessage({ ...position, source: "custom" }, ""),
      emptyCandidatesMessage(position, ""),
      emptyCandidatesMessage(position, "zed"),
    ]).toStrictEqual([
      "This position has no roster. Search for anyone below.",
      "Everyone on the roster is scheduled or unavailable.",
      "No one matches.",
    ]);
  });
});
