import type { ProductApi } from "@pcobooster/client/product-client";
import { matchesAssignmentPosition } from "@pcobooster/planning-center-models/plan-assignment-labels";
import type { Effect } from "effect";

import type { AssignPerson } from "./assign-person";
import type { AssignmentIdentity } from "./assignment";
import type { PersonStatus } from "./roster";
import { statusCodes } from "./roster";

/**
 * Optimistic edits to Assign's candidate reads, as Swift's `ScheduleOptimism` ports and the
 * web's `use-schedule-cache-optimism.ts` make them: a schedule write changes the slot on the
 * candidate list and the plan's rows in window history the moment it starts.
 */
export type CandidatesData = Effect.Success<
  ReturnType<ProductApi["people"]["positionCandidates"]>
>;
export type HistoryData = Effect.Success<
  ReturnType<ProductApi["people"]["planWindowHistory"]>
>[];
type Candidate = CandidatesData["candidates"][number];

/** Puts the person on the slot as pending; a new person joins at the end. */
export const scheduleCandidate = (
  data: CandidatesData,
  person: AssignPerson,
  planPersonId: string
): CandidatesData => {
  const slot = {
    planPersonId,
    status: "pending" as const,
    declineReason: null,
  };
  if (data.candidates.some((candidate) => candidate.id === person.id)) {
    return {
      ...data,
      candidates: data.candidates.map((candidate) =>
        candidate.id === person.id
          ? { ...candidate, selectedPlanSlot: slot }
          : candidate
      ),
    };
  }
  const [first = "", ...rest] = person.fullName.trim().split(/\s+/u);
  const added: Candidate = {
    id: person.id,
    firstName: first,
    lastName: rest.join(" "),
    fullName: person.fullName,
    photoUrl: null,
    photoThumbnailUrl: person.photoThumbnailUrl,
    archived: false,
    selectedPlanRosterLabels: [],
    selectedPlanSlot: slot,
    schedulingPreferences: null,
  };
  return { ...data, candidates: [...data.candidates, added] };
};

export const setSlotStatus = (
  data: CandidatesData,
  identity: AssignmentIdentity,
  status: PersonStatus
): CandidatesData => ({
  ...data,
  candidates: data.candidates.map((candidate) =>
    candidate.id === identity.personId && candidate.selectedPlanSlot !== null
      ? {
          ...candidate,
          selectedPlanSlot: {
            ...candidate.selectedPlanSlot,
            status,
            declineReason: null,
          },
        }
      : candidate
  ),
});

export const clearSlot = (
  data: CandidatesData,
  identity: AssignmentIdentity
): CandidatesData => ({
  ...data,
  candidates: data.candidates.map((candidate) =>
    candidate.id === identity.personId && candidate.selectedPlanSlot !== null
      ? { ...candidate, selectedPlanSlot: null }
      : candidate
  ),
});

/**
 * History's copy of the selected plan can still name a plan person the scheduler just changed;
 * without the slot on the candidate, the list would fall back to that copy.
 */
const editWindowRows = (
  calls: HistoryData,
  identity: AssignmentIdentity,
  positionName: string,
  status: PersonStatus | "remove",
  teamName?: string
): HistoryData =>
  calls.map((call) => ({
    ...call,
    people: call.people.map((person) => ({
      ...person,
      rows: person.rows.flatMap((row) => {
        if (
          person.personId !== identity.personId ||
          row.planId !== identity.planId ||
          row.teamId !== identity.teamId ||
          !matchesAssignmentPosition(
            row.teamPositionName,
            positionName,
            teamName
          )
        ) {
          return [row];
        }
        return status === "remove"
          ? []
          : [{ ...row, status: statusCodes[status], declineReason: null }];
      }),
    })),
  }));

export const setWindowRowStatus = (
  calls: HistoryData,
  identity: AssignmentIdentity,
  positionName: string,
  status: PersonStatus,
  teamName?: string
): HistoryData =>
  editWindowRows(calls, identity, positionName, status, teamName);

export const removeWindowRows = (
  calls: HistoryData,
  identity: AssignmentIdentity,
  positionName: string,
  teamName?: string
): HistoryData =>
  editWindowRows(calls, identity, positionName, "remove", teamName);
