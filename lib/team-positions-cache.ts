import { presentationCacheKey } from "@/lib/presentation-cache";
import type {
  FilledPositionPerson,
  TeamPosition,
  TeamPositionGroup,
} from "@/lib/types";

const CACHE_VERSION = "v1";
const CACHE_KEY_PREFIX = `worshipadmin:team-positions:${CACHE_VERSION}:`;

interface CachedPayload {
  savedAt: number;
  data: TeamPositionGroup[];
}

export interface TeamPositionsCacheEntry {
  savedAt: number;
  data: TeamPositionGroup[];
}

export function readCachedTeamPositions(
  serviceTypeId: string | null,
  planId: string | null,
  seriesId: string | null
): TeamPositionsCacheEntry | undefined {
  if (!serviceTypeId || !planId || typeof window === "undefined")
    return undefined;

  try {
    const raw = window.localStorage.getItem(
      buildCacheKey(serviceTypeId, planId, seriesId)
    );
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<CachedPayload>;
    if (!parsed || typeof parsed !== "object") return undefined;
    if (typeof parsed.savedAt !== "number") return undefined;
    if (!isTeamPositionGroupArray(parsed.data)) return undefined;

    return {
      savedAt: parsed.savedAt,
      data: parsed.data,
    };
  } catch {
    return undefined;
  }
}

export function writeCachedTeamPositions(
  serviceTypeId: string | null,
  planId: string | null,
  seriesId: string | null,
  groups: TeamPositionGroup[]
) {
  if (!serviceTypeId || !planId || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      buildCacheKey(serviceTypeId, planId, seriesId),
      JSON.stringify({
        savedAt: Date.now(),
        data: groups,
      } satisfies CachedPayload)
    );
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
}

export function clearCachedTeamPositions() {
  if (typeof window === "undefined") return;

  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(CACHE_KEY_PREFIX)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage failures; live queries will still fetch from Planning Center.
  }
}

function buildCacheKey(
  serviceTypeId: string,
  planId: string,
  seriesId: string | null
) {
  return presentationCacheKey(
    [
      CACHE_KEY_PREFIX,
      encodeURIComponent(serviceTypeId),
      ":",
      encodeURIComponent(planId),
      ":",
      encodeURIComponent(seriesId ?? "none"),
    ].join("")
  );
}

function isTeamPositionGroupArray(
  value: unknown
): value is TeamPositionGroup[] {
  return Array.isArray(value) && value.every(isTeamPositionGroup);
}

function isTeamPositionGroup(value: unknown): value is TeamPositionGroup {
  if (!value || typeof value !== "object") return false;
  const group = value as Partial<TeamPositionGroup>;
  return (
    typeof group.teamId === "string" &&
    typeof group.teamName === "string" &&
    Array.isArray(group.positions) &&
    group.positions.every(isTeamPosition)
  );
}

function isTeamPosition(value: unknown): value is TeamPosition {
  if (!value || typeof value !== "object") return false;
  const position = value as Partial<TeamPosition>;
  return (
    typeof position.id === "string" &&
    typeof position.name === "string" &&
    typeof position.teamId === "string" &&
    isOptionalString(position.teamName) &&
    (position.source === undefined ||
      position.source === "team_position" ||
      position.source === "needed_position" ||
      position.source === "plan_member" ||
      position.source === "custom") &&
    isOptionalNumber(position.neededCount) &&
    isOptionalNumber(position.filledPendingCount) &&
    isOptionalNumber(position.filledConfirmedCount) &&
    (position.filledPeople === undefined ||
      (Array.isArray(position.filledPeople) &&
        position.filledPeople.every(isFilledPositionPerson)))
  );
}

function isFilledPositionPerson(value: unknown): value is FilledPositionPerson {
  if (!value || typeof value !== "object") return false;
  const person = value as Partial<FilledPositionPerson>;
  return (
    typeof person.id === "string" &&
    typeof person.planPersonId === "string" &&
    isOptionalString(person.personId) &&
    typeof person.name === "string" &&
    (person.status === "pending" || person.status === "confirmed") &&
    typeof person.rawStatus === "string" &&
    isOptionalString(person.photoThumbnailUrl) &&
    isOptionalStringArray(person.assignedTimeIds) &&
    isOptionalStringArray(person.serviceTimeIds)
  );
}

function isOptionalString(value: unknown) {
  return value === undefined || value === null || typeof value === "string";
}

function isOptionalNumber(value: unknown) {
  return value === undefined || typeof value === "number";
}

function isOptionalStringArray(value: unknown) {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}
