import { planningCenterPeopleService } from "@/lib/planning-center/services/people-service";
import { getPresentationIdentityMapper } from "./presentation";

export interface PeopleSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  photoThumbnailUrl: string | null;
}

export async function searchPeople(query: string, limit = 15): Promise<PeopleSearchResult[]> {
  const identity = await getPresentationIdentityMapper();
  if (identity) {
    // Search aliases locally; fictional names must never be sent to PCO's real-name search.
    const people = await planningCenterPeopleService.getAllPeople();
    const terms = query.trim().toLowerCase().split(/\s+/);
    return people.map((person) => ({ id: person.id, ...identity(person.id) }))
      .filter((person) => terms.every((term) => person.fullName.toLowerCase().includes(term)))
      .toSorted((a, b) => a.fullName.localeCompare(b.fullName))
      .slice(0, limit);
  }

  const people = await planningCenterPeopleService.searchPeopleByName(query, limit);
  return people.map((person) => {
    const firstName = readString(person.attributes.first_name);
    const lastName = readString(person.attributes.last_name);
    return {
      id: person.id, firstName, lastName,
      fullName: `${firstName} ${lastName}`.trim() || "Unknown person",
      photoThumbnailUrl: typeof person.attributes.avatar === "string"
        ? person.attributes.avatar
        : typeof person.attributes.photo_thumbnail_url === "string"
          ? person.attributes.photo_thumbnail_url : null,
    };
  });
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
