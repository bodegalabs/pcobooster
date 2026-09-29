import type {
  FilledPositionPerson,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

import {
  collectPlanAssignments,
  otherPlanAssignments,
} from "@/components/schedule/plan-assignments";

const person = (
  personId: string,
  planPersonId: string,
  rawStatus: string
): FilledPositionPerson => ({
  id: personId,
  planPersonId,
  personId,
  name: personId,
  status: rawStatus === "C" ? "confirmed" : "pending",
  rawStatus,
  notification: null,
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
        filledPeople: [person("brandon", "pp-1", "C")],
      },
    ],
  },
  {
    teamId: "vocals",
    teamName: "Vocals",
    positions: [
      {
        id: "leader",
        name: "Worship Leader",
        teamId: "vocals",
        filledPeople: [
          person("brandon", "pp-2", "U"),
          person("jasmine", "pp-3", "D"),
        ],
      },
    ],
  },
];

describe(otherPlanAssignments, () => {
  it("lists a person's other positions with their own status", () => {
    const assignments = collectPlanAssignments(groups);

    expect(
      otherPlanAssignments(assignments, person("brandon", "pp-1", "C"), {
        teamId: "band",
        positionId: "keys",
      })
    ).toStrictEqual([
      {
        teamId: "vocals",
        positionId: "leader",
        positionName: "Worship Leader",
        status: "scheduled",
      },
    ]);
  });

  it("leaves out declined assignments", () => {
    const assignments = collectPlanAssignments(groups);

    expect(
      otherPlanAssignments(assignments, person("jasmine", "pp-3", "D"), {
        teamId: "band",
        positionId: "keys",
      })
    ).toStrictEqual([]);
  });
});
