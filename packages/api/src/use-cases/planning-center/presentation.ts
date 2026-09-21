import { createHmac } from "node:crypto";

import { planningCenterCatalogService } from "@worship-admin/api/planning-center/services/catalog-service";
import { planningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import { PlanningCenterReadCache } from "@worship-admin/api/planning-center/services/read-cache";
import {
  getPresentationSeed,
  isPresentationMode,
} from "@worship-admin/api/presentation-mode";
import { isNonEmptyString } from "@worship-admin/planning-center-models/json";
import type {
  Blockout,
  FilledPositionPerson,
  PersonWithAvailability,
  TeamPosition,
  TeamPositionGroup,
} from "@worship-admin/planning-center-models/types";

import type {
  PeopleDashboardData,
  PeopleDashboardPerson,
  PeopleDashboardPersonDetail,
} from "./people-dashboard-types";

const FIRST_NAMES = [
  "Alex",
  "Avery",
  "Blake",
  "Cameron",
  "Casey",
  "Charlie",
  "Dakota",
  "Drew",
  "Eden",
  "Ellis",
  "Emery",
  "Finley",
  "Frankie",
  "Harper",
  "Hayden",
  "Jamie",
  "Jordan",
  "Jules",
  "Kendall",
  "Lane",
  "Logan",
  "Morgan",
  "Parker",
  "Peyton",
  "Quinn",
  "Reese",
  "Riley",
  "Robin",
  "Rowan",
  "Sage",
  "Skyler",
  "Taylor",
];
const LAST_NAMES = [
  "Archer",
  "Bennett",
  "Brooks",
  "Campbell",
  "Carter",
  "Clark",
  "Cole",
  "Collins",
  "Davis",
  "Ellis",
  "Evans",
  "Foster",
  "Gray",
  "Green",
  "Hayes",
  "Hill",
  "James",
  "Lane",
  "Lee",
  "Lewis",
  "Miller",
  "Morgan",
  "Parker",
  "Reed",
  "Rivera",
  "Scott",
  "Shaw",
  "Stone",
  "Turner",
  "Walker",
  "West",
  "Woods",
];
interface PresentationDependencies {
  catalog: Pick<typeof planningCenterCatalogService, "getOrganization">;
  people: Pick<typeof planningCenterPeopleService, "getCacheScope">;
}

const defaultDependencies: PresentationDependencies = {
  catalog: planningCenterCatalogService,
  people: planningCenterPeopleService,
};
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
  const firstName = FIRST_NAMES[digest[0] % FIRST_NAMES.length];
  // A short suffix keeps the small fictional-name vocabulary distinguishable in large rosters.
  const surname = LAST_NAMES[digest[1] % LAST_NAMES.length];
  const lastName = `${surname} ${digest.subarray(2, 5).toString("hex").toUpperCase()}`;
  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    initials: `${firstName[0]}${surname[0]}`,
    photoUrl: null,
    photoThumbnailUrl: null,
  };
};

export const getPresentationIdentityMapper = async (
  dependencies: PresentationDependencies = defaultDependencies
) => {
  if (!isPresentationMode()) {
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
    async () => {
      const organization = await dependencies.catalog.getOrganization();
      if (!organization.id) {
        throw new Error("Missing Planning Center organization ID");
      }
      return organization.id;
    }
  );
  const seed = getPresentationSeed();
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
  dependencies: PresentationDependencies = defaultDependencies
): Promise<PersonWithAvailability[]> => {
  const identity = await getPresentationIdentityMapper(dependencies);
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
  dependencies: PresentationDependencies = defaultDependencies
): Promise<TeamPositionGroup[]> => {
  const identity = await getPresentationIdentityMapper(dependencies);
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
  dependencies: PresentationDependencies = defaultDependencies
): Promise<PeopleDashboardData> => {
  const identity = await getPresentationIdentityMapper(dependencies);
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
  dependencies: PresentationDependencies = defaultDependencies
): Promise<PeopleDashboardPersonDetail> => {
  const identity = await getPresentationIdentityMapper(dependencies);
  return identity
    ? { ...data, person: maskDashboardPerson(data.person, identity) }
    : data;
};

export const presentBlockouts = (blockouts: Blockout[]): Blockout[] =>
  isPresentationMode() ? blockouts.map(maskBlockout) : blockouts;
