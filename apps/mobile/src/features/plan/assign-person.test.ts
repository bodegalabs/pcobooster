import type { TeamPositionGroup } from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

import { restoreRosterPerson } from "./assign-person";
import type { RosterPersonLocation } from "./assign-person";

const location: RosterPersonLocation = {
  position: { id: "3301", teamId: "2201", name: "Keys" },
  person: {
    id: "4100102",
    personId: "4100102",
    planPersonId: "77001",
    name: "Hayden Collins",
    photoThumbnailUrl: null,
    status: "confirmed",
    rawStatus: "C",
    notification: { prepared: true, sentAt: null, senderName: null },
  },
};
const lineup = (
  people: RosterPersonLocation["person"][]
): TeamPositionGroup[] => [
  {
    teamId: "2201",
    teamName: "Band",
    positions: [{ ...location.position, filledPeople: people }],
  },
];

describe("restoring a declined roster person", () => {
  it("puts the person back with fresh counts", () => {
    expect(
      restoreRosterPerson(lineup([]), location)[0].positions[0]
    ).toMatchObject({
      filledPeople: [location.person],
      filledConfirmedCount: 1,
      filledPendingCount: 0,
    });
  });

  it("leaves a position that already has the person under another plan person id", () => {
    const groups = lineup([
      { ...location.person, planPersonId: "77002", status: "pending" },
    ]);
    expect(restoreRosterPerson(groups, location)).toStrictEqual(groups);
  });
});
