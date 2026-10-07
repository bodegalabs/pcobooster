import type {
  FilledPositionPerson,
  TeamPosition,
} from "@pcobooster/planning-center-models/types";

import type { PlanIds } from "./reads";

/** The same assignment before and after Planning Center gives it a plan person id. */
export interface AssignmentIdentity {
  readonly planId: string;
  readonly teamId: string;
  readonly positionId: string;
  readonly personId: string;
}

/** A caller's display snapshot; the writer owns the current transport id. */
export interface RosterAssignment {
  readonly identity: AssignmentIdentity;
  readonly person: FilledPositionPerson;
}

export const assignmentKey = (identity: AssignmentIdentity): string =>
  JSON.stringify([
    identity.planId,
    identity.teamId,
    identity.positionId,
    identity.personId,
  ]);

export const rosterAssignment = (
  ids: PlanIds,
  position: Pick<TeamPosition, "teamId" | "id">,
  person: FilledPositionPerson
): RosterAssignment => ({
  identity: {
    planId: ids.planId,
    teamId: position.teamId,
    positionId: position.id,
    personId: person.personId ?? person.id,
  },
  person,
});
