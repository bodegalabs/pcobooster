import { isString } from "@worship-admin/api/json";
import type { JsonValue } from "@worship-admin/api/json";
import { planningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";

import { getPresentationIdentityMapper } from "./presentation";

export interface PeopleSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  photoThumbnailUrl: string | null;
}

interface SearchPeopleDependencies {
  people: Pick<
    typeof planningCenterPeopleService,
    "getAllPeople" | "searchPeopleByName"
  >;
  getIdentityMapper: typeof getPresentationIdentityMapper;
}

const defaultDependencies: SearchPeopleDependencies = {
  people: planningCenterPeopleService,
  getIdentityMapper: getPresentationIdentityMapper,
};

const readString = (value: JsonValue): string => (isString(value) ? value : "");

const readPhotoThumbnailUrl = (value: JsonValue): string | null =>
  isString(value) ? value : null;

export const searchPeople = async (
  query: string,
  limit = 15,
  dependencies: SearchPeopleDependencies = defaultDependencies
): Promise<PeopleSearchResult[]> => {
  const identity = await dependencies.getIdentityMapper();
  if (identity) {
    // Search aliases locally; fictional names must never be sent to PCO's real-name search.
    const people = await dependencies.people.getAllPeople();
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

  const people = await dependencies.people.searchPeopleByName(query, limit);
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
