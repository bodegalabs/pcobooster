import { isNonEmptyString } from "@worship-admin/api/json";
import type {
  PersonWithAvailability,
  RawPerson,
} from "@worship-admin/api/types";
import {
  applySelectedPlanRosterStatus,
  getSelectedPlanRosterOverlay,
  mergeAssignedAndSelectedPlanSlotPeople,
  mergeAssignmentLabels,
} from "@worship-admin/api/use-cases/planning-center/people/roster-overlay";
import type {
  PlanRosterEntry,
  PlanSchedulingContext,
} from "@worship-admin/api/use-cases/planning-center/plan-scheduling-context";
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

const personWithAvailability = (id: string): PersonWithAvailability => ({
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

    expect(person).toMatchObject({
      isScheduledForSelectedPlanPosition: true,
      isConfirmedForSelectedPlanPosition: true,
      isDeclinedForSelectedPlanPosition: false,
      scheduledPlanPersonId: "pp-selected",
      selectedPlanAssignmentLabels: ["Band - Vocals", "Band - Keys"],
    });
  });

  it("only dedupes exact labels so hyphenated position names stay intact", () => {
    const labels = mergeAssignmentLabels(
      ["Band - Bass Guitar"],
      ["Bass Guitar", "Band - Bass Guitar"]
    );

    expect(labels).toStrictEqual(["Band - Bass Guitar", "Bass Guitar"]);
  });
});
