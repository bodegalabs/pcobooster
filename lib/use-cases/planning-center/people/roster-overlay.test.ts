import { describe, expect, it } from "vitest";

import type { PersonWithAvailability, RawPerson } from "@/lib/types";
import {
  applySelectedPlanRosterStatus,
  getSelectedPlanRosterOverlay,
  mergeAssignedAndSelectedPlanSlotPeople,
  mergeAssignmentLabels,
} from "@/lib/use-cases/planning-center/people/roster-overlay";
import type {
  PlanRosterEntry,
  PlanSchedulingContext,
} from "@/lib/use-cases/planning-center/plan-scheduling-context";

function rawPerson(id: string, firstName = id): RawPerson {
  return {
    type: "Person",
    id,
    attributes: {
      first_name: firstName,
      last_name: "Person",
      archived_at: null,
    },
  } as unknown as RawPerson;
}

function personWithAvailability(id: string): PersonWithAvailability {
  return {
    id,
    firstName: id,
    lastName: "Person",
    fullName: `${id} Person`,
    photoUrl: null,
    photoThumbnailUrl: null,
    archived: false,
    positions: [],
    isScheduledForSelectedPlanPosition: false,
    isConfirmedForSelectedPlanPosition: false,
    isDeclinedForSelectedPlanPosition: false,
    selectedPlanAssignmentLabels: [],
  };
}

function rosterEntry(
  overrides: Partial<PlanRosterEntry> & {
    planPersonId: string;
    personId: string | null;
  }
): PlanRosterEntry {
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
}

function context(
  entries: PlanRosterEntry[],
  people: RawPerson[] = []
): PlanSchedulingContext {
  const rosterByPersonId = new Map<string, PlanRosterEntry[]>();
  const rosterBySlotKey = new Map<string, PlanRosterEntry[]>();

  for (const entry of entries) {
    if (entry.personId) {
      rosterByPersonId.set(entry.personId, [
        ...(rosterByPersonId.get(entry.personId) || []),
        entry,
      ]);
    }

    if (entry.teamId) {
      const key = `${entry.teamId}::${entry.positionName.trim().toLowerCase()}`;
      rosterBySlotKey.set(key, [...(rosterBySlotKey.get(key) || []), entry]);
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
}

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

    expect(merged.map((person) => person.id)).toEqual([
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
    expect(overlay.assignmentLabels).toEqual(["Band - Vocals", "Band - Keys"]);
  });

  it("applies selected slot status and preserves merged labels", () => {
    const person = personWithAvailability("person-1");
    const overlay = {
      selectedSlotEntry: rosterEntry({
        planPersonId: "pp-selected",
        personId: "person-1",
        status: "confirmed",
        rawStatus: "C",
      }),
      assignmentLabels: ["Band - Vocals"],
    };
    const labels = mergeAssignmentLabels(overlay.assignmentLabels, [
      "Band - Vocals",
      "Band - Keys",
    ]);

    applySelectedPlanRosterStatus(person, overlay, labels);

    expect(person.isScheduledForSelectedPlanPosition).toBe(true);
    expect(person.isConfirmedForSelectedPlanPosition).toBe(true);
    expect(person.isDeclinedForSelectedPlanPosition).toBe(false);
    expect(person.scheduledPlanPersonId).toBe("pp-selected");
    expect(person.selectedPlanAssignmentLabels).toEqual([
      "Band - Vocals",
      "Band - Keys",
    ]);
  });

  it("only dedupes exact labels so hyphenated position names stay intact", () => {
    const labels = mergeAssignmentLabels(
      ["Band - Bass Guitar"],
      ["Bass Guitar", "Band - Bass Guitar"]
    );

    expect(labels).toEqual(["Band - Bass Guitar", "Bass Guitar"]);
  });
});
