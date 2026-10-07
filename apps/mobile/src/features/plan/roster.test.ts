import type {
  FilledPositionPerson,
  TeamPosition,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

import {
  adjustOpenSlots,
  canAddSlot,
  canRemoveSlot,
  editRosterPerson,
  filled,
  isTemporary,
  listFormat,
  openSlots,
  personStatus,
  staffing,
} from "./roster";

const person: FilledPositionPerson = {
  id: "p",
  planPersonId: "pp",
  personId: "p",
  name: "Jordan",
  status: "pending",
  rawStatus: "U",
  notification: null,
};
const position: TeamPosition = {
  id: "keys",
  teamId: "band",
  name: "Keys",
  source: "team_position",
  neededCount: 1,
  filledPendingCount: 1,
  filledConfirmedCount: 0,
  filledPeople: [person],
};
const groups: TeamPositionGroup[] = [
  { teamId: "band", teamName: "Band", positions: [position] },
];

describe("lineup rules", () => {
  it("uses raw status for confirmed, declined, and removed; otherwise falls back", () => {
    for (const rawStatus of [" C ", "confirmed"]) {
      expect(personStatus({ ...person, rawStatus })).toBe("confirmed");
    }
    for (const rawStatus of ["D", "Declined", "Removed by scheduler"]) {
      expect(personStatus({ ...person, rawStatus })).toBe("declined");
    }
    expect(personStatus(person)).toBe("pending");
    expect(
      personStatus({ ...person, rawStatus: "unknown", status: "confirmed" })
    ).toBe("confirmed");
  });

  it("allows adding only for an open slot or a known record, and removing only when open", () => {
    expect(canAddSlot(position)).toBeTruthy();
    expect(canRemoveSlot(position)).toBeTruthy();
    expect(canAddSlot({ ...position, neededCount: 0 })).toBeFalsy();
    expect(
      canAddSlot({ ...position, neededCount: 0, neededPositionId: "record" })
    ).toBeTruthy();
    expect(canRemoveSlot({ ...position, neededCount: -1 })).toBeFalsy();
  });

  it("shows clamped counts and temporary positions", () => {
    expect(openSlots({ ...position, neededCount: -1 })).toBe(0);
    expect(filled(position)).toBe(1);
    expect(isTemporary(position)).toBeFalsy();
    expect(isTemporary({ ...position, source: "plan_member" })).toBeTruthy();
    expect(isTemporary({ ...position, source: undefined })).toBeFalsy();
  });

  it("updates filled counts without changing requested open slots", () => {
    const [confirmed] = editRosterPerson(groups, "pp", "confirmed")[0]
      .positions;
    expect(confirmed.filledConfirmedCount).toBe(1);
    expect(confirmed.filledPendingCount).toBe(0);
    expect(confirmed.filledPeople?.[0].rawStatus).toBe("C");
    expect(
      editRosterPerson(groups, "pp", "pending")[0].positions[0]
        .filledPendingCount
    ).toBe(1);
    for (const action of ["declined", "remove"] as const) {
      const [removed] = editRosterPerson(groups, "pp", action)[0].positions;
      expect(removed.neededCount).toBe(1);
      expect(removed.filledPeople).toStrictEqual([]);
      expect(removed.filledPendingCount).toBe(0);
    }
  });

  it("leaves missing people and the source roster unchanged", () => {
    expect(editRosterPerson(groups, "missing", "remove")).toStrictEqual(groups);
    expect(position.filledPeople).toStrictEqual([person]);
  });

  it("adjusts only the matching position and never makes the open count negative", () => {
    expect(
      adjustOpenSlots(groups, "band", "keys", "add")[0].positions[0].neededCount
    ).toBe(2);
    const zero = adjustOpenSlots(groups, "band", "keys", "remove");
    expect(
      adjustOpenSlots(zero, "band", "keys", "remove")[0].positions[0]
        .neededCount
    ).toBe(0);
    expect(adjustOpenSlots(groups, "other", "keys", "add")).toStrictEqual(
      groups
    );
    expect(adjustOpenSlots(groups, "band", "other", "add")).toStrictEqual(
      groups
    );
  });

  it("counts staffing and formats names in lineup order", () => {
    expect(staffing(groups)).toStrictEqual({
      confirmed: 0,
      pending: 1,
      declined: 0,
      open: 1,
    });
    expect(listFormat(["Eden", "Drew", "Cameron"])).toBe(
      "Eden, Drew, and Cameron"
    );
  });

  it("formats zero, one, and two names on Hermes without Intl.ListFormat", () => {
    expect(listFormat([])).toBe("");
    expect(listFormat(["Eden"])).toBe("Eden");
    expect(listFormat(["Eden", "Drew"])).toBe("Eden and Drew");
  });

  it("orders confirmed people first and then by name after a status edit", () => {
    const roster = [
      {
        ...groups[0],
        positions: [
          {
            ...position,
            filledPeople: [
              { ...person, name: "Zoe" },
              { ...person, planPersonId: "other", name: "Amy" },
              {
                ...person,
                planPersonId: "third",
                name: "Ben",
                status: "confirmed" as const,
                rawStatus: "C",
              },
            ],
          },
        ],
      },
    ];
    const [result] = editRosterPerson(roster, "pp", "confirmed")[0].positions;
    expect(result.filledPeople?.map((row) => row.name)).toStrictEqual([
      "Ben",
      "Zoe",
      "Amy",
    ]);
    expect(result.filledConfirmedCount).toBe(2);
    expect(result.filledPendingCount).toBe(1);
  });
});
