import {
  getSelectedPlanRosterOverlay,
  mergeAssignedAndSelectedPlanSlotPeople,
} from "@pcobooster/api/modules/planning-center/people/roster-overlay";
import type {
  PlanRosterEntry,
  PlanSchedulingContext,
} from "@pcobooster/api/modules/planning-center/plan-scheduling-context";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type { RawPerson } from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

const rawPerson = (id: string, firstName = id): RawPerson => ({
  type: "Person",
  id,
  attributes: {
    first_name: firstName,
    last_name: "Person",
    photo_url: null,
    photo_thumbnail_url: null,
    archived_at: null,
  },
});

const rosterEntry = (
  overrides: Partial<PlanRosterEntry> & {
    planPersonId: string;
    personId: string | null;
  }
): PlanRosterEntry => {
  const { planPersonId, personId, ...rest } = overrides;
  return {
    planPersonId,
    personId,
    teamId: "team-band",
    teamName: "Band",
    positionName: "Vocals",
    label: "Band - Vocals",
    status: "pending",
    rawStatus: "U",
    assignedTimeIds: [],
    serviceTimeIds: [],
    ...rest,
  };
};

const context = (
  entries: PlanRosterEntry[],
  people: RawPerson[] = []
): PlanSchedulingContext => {
  const rosterByPersonId = new Map<string, PlanRosterEntry[]>();
  const rosterBySlotKey = new Map<string, PlanRosterEntry[]>();

  for (const entry of entries) {
    if (isNonEmptyString(entry.personId)) {
      rosterByPersonId.set(entry.personId, [
        ...(rosterByPersonId.get(entry.personId) ?? []),
        entry,
      ]);
    }

    if (isNonEmptyString(entry.teamId)) {
      const key = `${entry.teamId}::${entry.positionName.trim().toLowerCase()}`;
      rosterBySlotKey.set(key, [...(rosterBySlotKey.get(key) ?? []), entry]);
    }
  }

  return {
    serviceTypeId: "st-1",
    planId: "plan-1",
    rosterEntries: entries,
    rosterByPersonId,
    rosterBySlotKey,
    peopleById: new Map(people.map((person) => [person.id, person])),
  };
};

describe("selected plan roster overlay", () => {
  it("adds selected-slot roster people without pulling in people scheduled elsewhere", () => {
    const assigned = rawPerson("assigned");
    const selectedSlot = rawPerson("selected-slot");
    const elsewhere = rawPerson("elsewhere");
    const planContext = context(
      [
        rosterEntry({ planPersonId: "pp-selected", personId: selectedSlot.id }),
        rosterEntry({
          planPersonId: "pp-elsewhere",
          personId: elsewhere.id,
          positionName: "Keys",
          label: "Band - Keys",
        }),
      ],
      [selectedSlot, elsewhere]
    );

    const merged = mergeAssignedAndSelectedPlanSlotPeople({
      assignedPeople: [assigned],
      planSchedulingContext: planContext,
      selectedMatchContext: {
        planId: "plan-1",
        teamId: "team-band",
        selectedTeamName: "Band",
        selectedPositionName: "Vocals",
      },
    });

    expect(merged.map((person) => person.id)).toStrictEqual([
      "assigned",
      "selected-slot",
    ]);
  });

  it("returns non-declined plan labels while matching the selected slot separately", () => {
    const planContext = context([
      rosterEntry({
        planPersonId: "pp-selected",
        personId: "person-1",
        status: "confirmed",
        rawStatus: "C",
      }),
      rosterEntry({
        planPersonId: "pp-keys",
        personId: "person-1",
        positionName: "Keys",
        label: "Band - Keys",
      }),
      rosterEntry({
        planPersonId: "pp-declined",
        personId: "person-1",
        positionName: "Drums",
        label: "Band - Drums",
        status: "declined",
        rawStatus: "D",
      }),
    ]);

    const overlay = getSelectedPlanRosterOverlay(planContext, "person-1", {
      planId: "plan-1",
      teamId: "team-band",
      selectedTeamName: "Band",
      selectedPositionName: "Vocals",
    });

    expect(overlay.selectedSlotEntry?.planPersonId).toBe("pp-selected");
    expect(overlay.assignmentLabels).toStrictEqual([
      "Band - Vocals",
      "Band - Keys",
    ]);
  });
});
