import { createHmac } from "node:crypto";

import type { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import { PlanningCenterReadCache } from "@pcobooster/api/planning-center/services/read-cache";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type {
  Blockout,
  FilledPositionPerson,
  PersonWithAvailability,
  TeamPosition,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import type {
  getPresentationSeed,
  isPresentationMode,
} from "@pcobooster/presentation-mode";

import type {
  PeopleDashboardData,
  PeopleDashboardPerson,
  PeopleDashboardPersonDetail,
} from "./people-dashboard-types";
import {
  PRESENTATION_FIRST_NAMES,
  PRESENTATION_LAST_NAMES,
} from "./presentation-names";

export interface PresentationDependencies {
  catalog: Pick<PlanningCenterCatalogService, "getOrganization">;
  people: Pick<PlanningCenterPeopleService, "getCacheScope">;
  isPresentationMode: typeof isPresentationMode;
  getPresentationSeed: typeof getPresentationSeed;
}
const organizationCaches = new WeakMap<
  PresentationDependencies["catalog"],
  PlanningCenterReadCache<string>
>();

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

export const getPresentationIdentityMapper = async (
  dependencies: PresentationDependencies,
  signal?: AbortSignal
) => {
  if (!dependencies.isPresentationMode()) {
    return null;
  }
  let organizationCache = organizationCaches.get(dependencies.catalog);
  if (!organizationCache) {
    organizationCache = new PlanningCenterReadCache<string>();
    organizationCaches.set(dependencies.catalog, organizationCache);
  }
  const organizationId = await organizationCache.get(
    dependencies.people.getCacheScope(),
    5 * 60 * 1000,
    async (loadSignal) => {
      const organization =
        await dependencies.catalog.getOrganization(loadSignal);
      if (!organization.id) {
        throw new Error("Missing Planning Center organization ID");
      }
      return organization.id;
    },
    signal
  );
  const seed = dependencies.getPresentationSeed();
  return (personId: string) =>
    presentationIdentity(organizationId, personId, seed);
};

type IdentityMapper = (personId: string) => PresentationIdentity;

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

export const presentPeople = async (
  people: PersonWithAvailability[],
  dependencies: PresentationDependencies,
  signal?: AbortSignal
): Promise<PersonWithAvailability[]> => {
  const identity = await getPresentationIdentityMapper(dependencies, signal);
  if (!identity) {
    return people;
  }
  return people.map((person) => ({
    ...person,
    ...identity(person.id),
    positions: person.positions.map((position) =>
      maskPosition(position, identity)
    ),
    ...(person.blockouts
      ? { blockouts: person.blockouts.map(maskBlockout) }
      : undefined),
    selectedPlanDeclineReason: isNonEmptyString(
      person.selectedPlanDeclineReason
    )
      ? "Unavailable"
      : person.selectedPlanDeclineReason,
  }));
};

export const presentTeamPositions = async (
  groups: TeamPositionGroup[],
  dependencies: PresentationDependencies,
  signal?: AbortSignal
): Promise<TeamPositionGroup[]> => {
  const identity = await getPresentationIdentityMapper(dependencies, signal);
  if (!identity) {
    return groups;
  }
  return groups.map((group) => ({
    ...group,
    positions: group.positions.map((position) =>
      maskPosition(position, identity)
    ),
  }));
};

const maskDashboardPerson = (
  person: PeopleDashboardPerson,
  identity: IdentityMapper
): PeopleDashboardPerson => {
  const alias = identity(person.id);
  return {
    ...person,
    name: alias.fullName,
    initials: alias.initials,
    photoThumbnailUrl: null,
  };
};

export const presentDashboard = async (
  data: PeopleDashboardData,
  dependencies: PresentationDependencies,
  signal?: AbortSignal
): Promise<PeopleDashboardData> => {
  const identity = await getPresentationIdentityMapper(dependencies, signal);
  return identity
    ? {
        ...data,
        people: data.people.map((person) =>
          maskDashboardPerson(person, identity)
        ),
      }
    : data;
};

export const presentDashboardPerson = async (
  data: PeopleDashboardPersonDetail,
  dependencies: PresentationDependencies,
  signal?: AbortSignal
): Promise<PeopleDashboardPersonDetail> => {
  const identity = await getPresentationIdentityMapper(dependencies, signal);
  return identity
    ? { ...data, person: maskDashboardPerson(data.person, identity) }
    : data;
};

export const presentBlockouts = (
  blockouts: Blockout[],
  presentationMode: boolean
): Blockout[] => (presentationMode ? blockouts.map(maskBlockout) : blockouts);
