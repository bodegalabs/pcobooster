import {
  collectUnnotifiedPeople,
  getPositionNotificationStates,
  getSchedulingNotificationState,
} from "@pcobooster/planning-center-models/scheduling-notifications";
import type {
  FilledPositionPerson,
  PlanPersonNotification,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

const unsent: PlanPersonNotification = {
  prepared: true,
  sentAt: null,
  senderName: null,
};
const sent: PlanPersonNotification = {
  prepared: false,
  sentAt: "2026-09-20T15:00:00Z",
  senderName: "Sam",
};

const filled = (
  personId: string,
  notification: PlanPersonNotification | null
): FilledPositionPerson => ({
  id: personId,
  planPersonId: `pp-${personId}`,
  personId,
  name: `Person ${personId}`,
  status: "pending",
  rawStatus: "U",
  photoThumbnailUrl: null,
  notification,
});

const groups: TeamPositionGroup[] = [
  {
    teamId: "band",
    teamName: "Band",
    positions: [
      {
        id: "keys",
        name: "Keys",
        teamId: "band",
        filledPeople: [filled("a", unsent), filled("b", sent)],
      },
      {
        id: "vocals",
        name: "Vocals",
        teamId: "band",
        filledPeople: [filled("a", unsent), filled("c", null)],
      },
    ],
  },
  {
    teamId: "tech",
    teamName: "Tech",
    positions: [
      {
        id: "sound",
        name: "Sound",
        teamId: "tech",
        filledPeople: [filled("d", unsent)],
      },
    ],
  },
];

describe(getSchedulingNotificationState, () => {
  it("distinguishes unsent, sent, cleared without a send, and unknown", () => {
    expect(getSchedulingNotificationState(unsent)).toBe("unsent");
    expect(getSchedulingNotificationState(sent)).toBe("sent");
    expect(
      getSchedulingNotificationState({
        prepared: false,
        sentAt: null,
        senderName: null,
      })
    ).toBe("unrecorded");
    expect(getSchedulingNotificationState(null)).toBe("unknown");
  });

  it("keeps a prepared email unsent even when an earlier send was recorded", () => {
    expect(getSchedulingNotificationState({ ...sent, prepared: true })).toBe(
      "unsent"
    );
  });
});

describe(collectUnnotifiedPeople, () => {
  it("lists each unnotified person once with all their unsent positions", () => {
    const people = collectUnnotifiedPeople(groups);

    expect(
      people.map((person) => ({
        key: person.key,
        positions: person.assignments.map(
          (assignment) =>
            `${assignment.slot.teamName}/${assignment.slot.positionName}`
        ),
      }))
    ).toStrictEqual([
      { key: "a", positions: ["Band/Keys", "Band/Vocals"] },
      { key: "d", positions: ["Tech/Sound"] },
    ]);
  });

  it("returns nobody when every email was sent", () => {
    expect(
      collectUnnotifiedPeople([
        { ...groups[1], positions: [] },
        {
          teamId: "x",
          teamName: "X",
          positions: [
            {
              id: "p",
              name: "P",
              teamId: "x",
              filledPeople: [filled("e", sent)],
            },
          ],
        },
      ])
    ).toStrictEqual([]);
  });
});

describe(getPositionNotificationStates, () => {
  it("maps the selected position's people to their state", () => {
    expect(
      getPositionNotificationStates(groups, "band", "vocals")
    ).toStrictEqual(
      new Map([
        ["a", "unsent"],
        ["c", "unknown"],
      ])
    );
    expect(getPositionNotificationStates(groups, "band", "missing").size).toBe(
      0
    );
  });
});
