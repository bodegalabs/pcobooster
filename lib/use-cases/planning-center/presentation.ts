import "server-only";
import { createHmac } from "node:crypto";

import { planningCenterCatalogService } from "@/lib/planning-center/services/catalog-service";
import { planningCenterPeopleService } from "@/lib/planning-center/services/people-service";
import { PlanningCenterReadCache } from "@/lib/planning-center/services/read-cache";
import {
  getPresentationSeed,
  isPresentationMode,
} from "@/lib/presentation-mode";
import type {
  Blockout,
  FilledPositionPerson,
  PersonWithAvailability,
  TeamPosition,
  TeamPositionGroup,
} from "@/lib/types";

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
const organizationCache = new PlanningCenterReadCache();

export interface PresentationIdentity {
  firstName: string;
  lastName: string;
  fullName: string;
  initials: string;
  photoUrl: null;
  photoThumbnailUrl: null;
}

/** Stable across endpoints, ordering, restarts, and account token refreshes. */
export function presentationIdentity(
  organizationId: string,
  personId: string,
  seed: string
): PresentationIdentity {
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
}

export async function getPresentationIdentityMapper() {
  if (!isPresentationMode()) return null;
  const organizationId = await organizationCache.get(
    planningCenterPeopleService.getCacheScope(),
    5 * 60 * 1000,
    async () => {
      const organization = await planningCenterCatalogService.getOrganization();
      if (!organization.id)
        throw new Error("Missing Planning Center organization ID");
      return organization.id;
    }
  );
  const seed = getPresentationSeed();
  return (personId: string) =>
    presentationIdentity(organizationId, personId, seed);
}

type IdentityMapper = (personId: string) => PresentationIdentity;

function maskBlockout(blockout: Blockout): Blockout {
  return { ...blockout, reason: "Unavailable", description: "" };
}

function maskFilledPerson(
  person: FilledPositionPerson,
  identity: IdentityMapper
): FilledPositionPerson {
  return {
    ...person,
    name: person.personId
      ? identity(person.personId).fullName
      : "Guest volunteer",
    photoThumbnailUrl: null,
  };
}

function maskPosition(
  position: TeamPosition,
  identity: IdentityMapper
): TeamPosition {
  return {
    ...position,
    ...(position.filledPeople
      ? {
          filledPeople: position.filledPeople.map((person) =>
            maskFilledPerson(person, identity)
          ),
        }
      : {}),
  };
}

export async function presentPeople(
  people: PersonWithAvailability[]
): Promise<PersonWithAvailability[]> {
  const identity = await getPresentationIdentityMapper();
  if (!identity) return people;
  return people.map((person) => ({
    ...person,
    ...identity(person.id),
    positions: person.positions.map((position) =>
      maskPosition(position, identity)
    ),
    ...(person.blockouts
      ? { blockouts: person.blockouts.map(maskBlockout) }
      : {}),
    selectedPlanDeclineReason: person.selectedPlanDeclineReason
      ? "Unavailable"
      : person.selectedPlanDeclineReason,
  }));
}

export async function presentTeamPositions(
  groups: TeamPositionGroup[]
): Promise<TeamPositionGroup[]> {
  const identity = await getPresentationIdentityMapper();
  if (!identity) return groups;
  return groups.map((group) => ({
    ...group,
    positions: group.positions.map((position) =>
      maskPosition(position, identity)
    ),
  }));
}

function maskDashboardPerson(
  person: PeopleDashboardPerson,
  identity: IdentityMapper
): PeopleDashboardPerson {
  const alias = identity(person.id);
  return {
    ...person,
    name: alias.fullName,
    initials: alias.initials,
    photoThumbnailUrl: null,
  };
}

export async function presentDashboard(
  data: PeopleDashboardData
): Promise<PeopleDashboardData> {
  const identity = await getPresentationIdentityMapper();
  return identity
    ? {
        ...data,
        people: data.people.map((person) =>
          maskDashboardPerson(person, identity)
        ),
      }
    : data;
}

export async function presentDashboardPerson(
  data: PeopleDashboardPersonDetail
): Promise<PeopleDashboardPersonDetail> {
  const identity = await getPresentationIdentityMapper();
  return identity
    ? { ...data, person: maskDashboardPerson(data.person, identity) }
    : data;
}

export function presentBlockouts(blockouts: Blockout[]): Blockout[] {
  return isPresentationMode() ? blockouts.map(maskBlockout) : blockouts;
}
