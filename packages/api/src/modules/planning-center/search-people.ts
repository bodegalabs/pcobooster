import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import { isString } from "@pcobooster/planning-center-models/json";
import type { JsonValue } from "@pcobooster/planning-center-models/json";

import type { PresentationIdentity } from "./presentation";

export interface PeopleSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  photoThumbnailUrl: string | null;
}

export interface SearchPeopleDependencies {
  people: Pick<
    PlanningCenterPeopleService,
    "getAllPeople" | "searchPeopleByName"
  >;
  getIdentityMapper: (
    signal?: AbortSignal
  ) => Promise<((personId: string) => PresentationIdentity) | null>;
}

const readString = (value: JsonValue): string => (isString(value) ? value : "");

const readPhotoThumbnailUrl = (value: JsonValue): string | null =>
  isString(value) ? value : null;

export const searchPeople = async (
  query: string,
  limit: number,
  dependencies: SearchPeopleDependencies,
  signal?: AbortSignal
): Promise<PeopleSearchResult[]> => {
  const identity = await dependencies.getIdentityMapper(signal);
  if (identity) {
    // Search aliases locally; fictional names must never be sent to PCO's real-name search.
    const people = await dependencies.people.getAllPeople(signal);
    const terms = query.trim().toLowerCase().split(/\s+/u);
    const matches: PeopleSearchResult[] = [];
    for (const person of people) {
      const result = { id: person.id, ...identity(person.id) };
      if (terms.every((term) => result.fullName.toLowerCase().includes(term))) {
        matches.push(result);
      }
    }
    return matches
      .toSorted((a, b) => a.fullName.localeCompare(b.fullName))
      .slice(0, limit);
  }

  const people = await dependencies.people.searchPeopleByName(
    query,
    limit,
    signal
  );
  return people.map((person) => {
    const firstName = readString(person.attributes.first_name);
    const lastName = readString(person.attributes.last_name);
    return {
      id: person.id,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim() || "Unknown person",
      photoThumbnailUrl: isString(person.attributes.avatar)
        ? person.attributes.avatar
        : readPhotoThumbnailUrl(person.attributes.photo_thumbnail_url),
    };
  });
};
