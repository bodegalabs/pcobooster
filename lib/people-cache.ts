import { presentationCacheKey } from "@/lib/presentation-cache";
import type {
  PersonWithAvailability,
  ScheduleFrequency,
  ServiceHistoryItem,
  TeamPosition,
} from "@/lib/types";

const CACHE_VERSION = "v1";
const CACHE_KEY_PREFIX = `worshipadmin:people:${CACHE_VERSION}:`;

interface CachedPayload {
  savedAt: number;
  data: PersonWithAvailability[];
}

export interface PeopleCacheEntry {
  savedAt: number;
  data: PersonWithAvailability[];
}

export function readCachedPeople(
  serviceTypeId: string | null,
  teamId: string | null,
  positionId: string | null,
  planId: string | null,
  dateKey: string | null
): PeopleCacheEntry | undefined {
  if (!serviceTypeId || !positionId || typeof window === "undefined")
    return undefined;

  try {
    const raw = window.localStorage.getItem(
      buildCacheKey(serviceTypeId, teamId, positionId, planId, dateKey)
    );
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<CachedPayload>;
    if (!parsed || typeof parsed !== "object") return undefined;
    if (typeof parsed.savedAt !== "number") return undefined;
    if (!isPeopleArray(parsed.data)) return undefined;

    return {
      savedAt: parsed.savedAt,
      data: parsed.data,
    };
  } catch {
    return undefined;
  }
}

export function writeCachedPeople(
  serviceTypeId: string | null,
  teamId: string | null,
  positionId: string | null,
  planId: string | null,
  dateKey: string | null,
  people: PersonWithAvailability[]
) {
  if (!serviceTypeId || !positionId || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      buildCacheKey(serviceTypeId, teamId, positionId, planId, dateKey),
      JSON.stringify({
        savedAt: Date.now(),
        data: people,
      } satisfies CachedPayload)
    );
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
}

export function clearCachedPeople() {
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
  teamId: string | null,
  positionId: string,
  planId: string | null,
  dateKey: string | null
) {
  return presentationCacheKey(
    [
      CACHE_KEY_PREFIX,
      encodeURIComponent(serviceTypeId),
      ":",
      encodeURIComponent(teamId ?? "none"),
      ":",
      encodeURIComponent(positionId),
      ":",
      encodeURIComponent(planId ?? "none"),
      ":",
      encodeURIComponent(dateKey ?? "none"),
    ].join("")
  );
}

function isPeopleArray(value: unknown): value is PersonWithAvailability[] {
  return Array.isArray(value) && value.every(isPersonWithAvailability);
}

function isPersonWithAvailability(
  value: unknown
): value is PersonWithAvailability {
  if (!value || typeof value !== "object") return false;
  const person = value as Partial<PersonWithAvailability>;

  return (
    typeof person.id === "string" &&
    typeof person.firstName === "string" &&
    typeof person.lastName === "string" &&
    typeof person.fullName === "string" &&
    isOptionalString(person.photoUrl) &&
    isOptionalString(person.photoThumbnailUrl) &&
    typeof person.archived === "boolean" &&
    Array.isArray(person.positions) &&
    person.positions.every(isTeamPosition) &&
    isAvailability(person.availability) &&
    (person.frequency === undefined || isScheduleFrequency(person.frequency)) &&
    (person.serviceHistory === undefined ||
      (Array.isArray(person.serviceHistory) &&
        person.serviceHistory.every(isServiceHistoryItem))) &&
    isOptionalBoolean(person.isBlockedForDate) &&
    isOptionalBoolean(person.isScheduledForSelectedPlanPosition) &&
    isOptionalBoolean(person.isConfirmedForSelectedPlanPosition) &&
    isOptionalBoolean(person.isDeclinedForSelectedPlanPosition) &&
    isOptionalString(person.selectedPlanDeclineReason) &&
    (person.selectedPlanAssignmentLabels === undefined ||
      (Array.isArray(person.selectedPlanAssignmentLabels) &&
        person.selectedPlanAssignmentLabels.every(
          (label) => typeof label === "string"
        ))) &&
    isOptionalString(person.scheduledPlanPersonId) &&
    isOptionalNumber(person.recommendationScore) &&
    (person.recommendationReasoning === undefined ||
      (Array.isArray(person.recommendationReasoning) &&
        person.recommendationReasoning.every(
          (reason) => typeof reason === "string"
        )))
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
    isOptionalNumber(position.neededCount) &&
    isOptionalNumber(position.filledPendingCount) &&
    isOptionalNumber(position.filledConfirmedCount)
  );
}

function isAvailability(value: unknown) {
  return (
    value === undefined ||
    value === "available" ||
    value === "blocked" ||
    value === "unknown"
  );
}

function isScheduleFrequency(value: unknown): value is ScheduleFrequency {
  if (!value || typeof value !== "object") return false;
  const frequency = value as Partial<ScheduleFrequency>;

  return (
    isRequiredNumber(frequency.recentServedDays) &&
    isRequiredNumber(frequency.last60Days) &&
    isRequiredNumber(frequency.last90Days) &&
    isRequiredNumber(frequency.totalServed) &&
    isRequiredNumber(frequency.recentRehearsalOnlyDays) &&
    isRequiredNumber(frequency.rehearsalLast60Days) &&
    isRequiredNumber(frequency.rehearsalLast90Days) &&
    isRequiredNumber(frequency.totalRehearsals) &&
    isRequiredNumber(frequency.upcomingServices) &&
    isRequiredNumber(frequency.upcomingRehearsals) &&
    isOptionalDateLike(frequency.lastServedDate) &&
    isOptionalDateLike(frequency.lastRehearsalDate) &&
    isOptionalDateLike(frequency.nextUpcomingDate) &&
    isOptionalDateLike(frequency.nextRehearsalDate)
  );
}

function isServiceHistoryItem(value: unknown): value is ServiceHistoryItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ServiceHistoryItem>;

  return (
    typeof item.id === "string" &&
    typeof item.sourceScheduleId === "string" &&
    isDateLike(item.date) &&
    typeof item.teamPositionName === "string" &&
    typeof item.status === "string" &&
    isOptionalString(item.teamName) &&
    isOptionalString(item.serviceTypeName) &&
    isOptionalString(item.planTitle) &&
    (item.timeType === undefined ||
      item.timeType === "service" ||
      item.timeType === "rehearsal" ||
      item.timeType === "other")
  );
}

function isOptionalString(value: unknown) {
  return value === undefined || value === null || typeof value === "string";
}

function isOptionalNumber(value: unknown) {
  return value === undefined || typeof value === "number";
}

function isRequiredNumber(value: unknown) {
  return typeof value === "number";
}

function isOptionalBoolean(value: unknown) {
  return value === undefined || typeof value === "boolean";
}

function isOptionalDateLike(value: unknown) {
  return value === undefined || isDateLike(value);
}

function isDateLike(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date)) return false;
  return !Number.isNaN(new Date(value).getTime());
}
