import { createHmac } from "node:crypto";

import type { CandidateDetailsBatch } from "@pcobooster/api/modules/planning-center/get-candidate-details";
import type { PlanWindowHistoryBatch } from "@pcobooster/api/modules/planning-center/get-plan-window-history";
import type { PositionCandidatesResult } from "@pcobooster/api/modules/planning-center/get-position-candidates";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import { cachedRead } from "@pcobooster/api/planning-center/services/cached-read";
import type { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import type { PlanningCenterReadCache } from "@pcobooster/api/planning-center/services/read-cache";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type { CandidateHistory } from "@pcobooster/planning-center-models/position-candidates";
import type {
  Blockout,
  FilledPositionPerson,
  TeamPosition,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

import type {
  PeopleDashboardPersonDetail,
  PeopleDashboardRoster,
  PeopleDashboardRosterPerson,
} from "./people-dashboard-types";
import {
  PRESENTATION_FIRST_NAMES,
  PRESENTATION_LAST_NAMES,
} from "./presentation-names";

export interface PresentationDependencies {
  catalog: Pick<PlanningCenterCatalogService, "getOrganization">;
  people: Pick<PlanningCenterPeopleService, "getCacheScope">;
  isPresentationMode: () => boolean;
  getPresentationSeed: () => string;
  /** Per isolate: see `ModuleReadCaches.presentationOrganizationIds`. */
  organizationIds: PlanningCenterReadCache<string>;
}

export interface PresentationIdentity {
  firstName: string;
  lastName: string;
  fullName: string;
  initials: string;
  photoUrl: null;
  photoThumbnailUrl: null;
}

/** Stable across endpoints, ordering, restarts, and account token refreshes. */
export const presentationIdentity = (
  organizationId: string,
  personId: string,
  seed: string
): PresentationIdentity => {
  const digest = createHmac("sha256", seed)
    .update(JSON.stringify([organizationId, personId]))
    .digest();
  const firstName =
    PRESENTATION_FIRST_NAMES[
      digest.readUInt16BE(0) % PRESENTATION_FIRST_NAMES.length
    ];
  const lastName =
    PRESENTATION_LAST_NAMES[
      digest.readUInt16BE(2) % PRESENTATION_LAST_NAMES.length
    ];
  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    initials: `${firstName[0]}${lastName[0]}`,
    photoUrl: null,
    photoThumbnailUrl: null,
  };
};

type IdentityMapper = (personId: string) => PresentationIdentity;

export const getPresentationIdentityMapper = (
  dependencies: PresentationDependencies
): Effect.Effect<IdentityMapper | null, PlanningCenterError> =>
  Effect.suspend(() => {
    if (!dependencies.isPresentationMode()) {
      return Effect.succeed(null);
    }
    const loadOrganizationId = () =>
      Effect.flatMap(dependencies.catalog.getOrganization(), (organization) =>
        organization.id
          ? Effect.succeed(organization.id)
          : Effect.die(new Error("Missing Planning Center organization ID"))
      );
    return Effect.map(
      cachedRead(
        dependencies.organizationIds,
        dependencies.people.getCacheScope(),
        5 * 60 * 1000,
        loadOrganizationId
      ),
      (organizationId) => {
        const seed = dependencies.getPresentationSeed();
        return (personId: string) =>
          presentationIdentity(organizationId, personId, seed);
      }
    );
  });

const maskBlockout = (blockout: Blockout): Blockout => ({
  ...blockout,
  reason: "Unavailable",
  description: "",
});

const maskFilledPerson = (
  person: FilledPositionPerson,
  identity: IdentityMapper
): FilledPositionPerson => ({
  ...person,
  name: isNonEmptyString(person.personId)
    ? identity(person.personId).fullName
    : "Guest volunteer",
  photoThumbnailUrl: null,
});

const maskPosition = (
  position: TeamPosition,
  identity: IdentityMapper
): TeamPosition => ({
  ...position,
  ...(position.filledPeople
    ? {
        filledPeople: position.filledPeople.map((person) =>
          maskFilledPerson(person, identity)
        ),
      }
    : undefined),
});

const maskDeclineReason = (reason: string | null): string | null =>
  reason === null ? null : "Unavailable";

export const presentPositionCandidates = (
  result: PositionCandidatesResult,
  dependencies: PresentationDependencies
): Effect.Effect<PositionCandidatesResult, PlanningCenterError> =>
  Effect.map(getPresentationIdentityMapper(dependencies), (identity) =>
    identity
      ? {
          ...result,
          candidates: result.candidates.map((candidate) => {
            const alias = identity(candidate.id);
            return {
              ...candidate,
              firstName: alias.firstName,
              lastName: alias.lastName,
              fullName: alias.fullName,
              photoUrl: alias.photoUrl,
              photoThumbnailUrl: alias.photoThumbnailUrl,
              selectedPlanSlot:
                candidate.selectedPlanSlot === null
                  ? null
                  : {
                      ...candidate.selectedPlanSlot,
                      declineReason: maskDeclineReason(
                        candidate.selectedPlanSlot.declineReason
                      ),
                    },
            };
          }),
        }
      : result
  );

const maskCandidateHistory = <History extends CandidateHistory>(
  history: History
): History => ({
  ...history,
  selectedPlanAssignments: history.selectedPlanAssignments.map(
    (assignment) => ({
      ...assignment,
      declineReason: maskDeclineReason(assignment.declineReason),
    })
  ),
});

/** History carries no names or photos; only decline reasons are masked. */
export const presentPlanWindowHistory = (
  batch: PlanWindowHistoryBatch,
  presentationMode: boolean
): PlanWindowHistoryBatch =>
  presentationMode
    ? {
        ...batch,
        people: batch.people.map((person) => ({
          ...person,
          rows: person.rows.map((row) => ({
            ...row,
            declineReason: maskDeclineReason(row.declineReason),
          })),
        })),
      }
    : batch;

export const presentCandidateDetails = (
  batch: CandidateDetailsBatch,
  presentationMode: boolean
): CandidateDetailsBatch =>
  presentationMode
    ? {
        ...batch,
        people: batch.people.map((detail) =>
          detail.history === undefined
            ? detail
            : { ...detail, history: maskCandidateHistory(detail.history) }
        ),
      }
    : batch;

export const presentTeamPositions = (
  groups: TeamPositionGroup[],
  dependencies: PresentationDependencies
): Effect.Effect<TeamPositionGroup[], PlanningCenterError> =>
  Effect.map(getPresentationIdentityMapper(dependencies), (identity) =>
    identity
      ? groups.map((group) => ({
          ...group,
          positions: group.positions.map((position) =>
            maskPosition(position, identity)
          ),
        }))
      : groups
  );

const maskDashboardPerson = <Person extends PeopleDashboardRosterPerson>(
  person: Person,
  identity: IdentityMapper
): Person => {
  const alias = identity(person.id);
  return {
    ...person,
    name: alias.fullName,
    initials: alias.initials,
    photoThumbnailUrl: null,
  };
};

/** Batch activity carries no names or photos, so only the roster is masked. */
export const presentDashboardRoster = (
  data: PeopleDashboardRoster,
  dependencies: PresentationDependencies
): Effect.Effect<PeopleDashboardRoster, PlanningCenterError> =>
  Effect.map(getPresentationIdentityMapper(dependencies), (identity) =>
    identity
      ? {
          ...data,
          people: data.people.map((person) =>
            maskDashboardPerson(person, identity)
          ),
        }
      : data
  );

export const presentDashboardPerson = (
  data: PeopleDashboardPersonDetail,
  dependencies: PresentationDependencies
): Effect.Effect<PeopleDashboardPersonDetail, PlanningCenterError> =>
  Effect.map(getPresentationIdentityMapper(dependencies), (identity) =>
    identity
      ? { ...data, person: maskDashboardPerson(data.person, identity) }
      : data
  );

export const presentBlockouts = (
  blockouts: Blockout[],
  presentationMode: boolean
): Blockout[] => (presentationMode ? blockouts.map(maskBlockout) : blockouts);
