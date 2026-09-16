import { presentationCacheKey } from "@/lib/presentation-cache";
import type {
  PeopleDashboardData,
  PeopleDashboardDay,
  PeopleDashboardPerson,
  PeopleDashboardPersonDetail,
  PeopleDashboardRange,
} from "@/lib/use-cases/planning-center/people-dashboard-types";

const CACHE_VERSION = "v1";
const KEY_PREFIX = `worshipadmin:people-dashboard:${CACHE_VERSION}:`;
const PERSON_DETAIL_KEY_PREFIX = `${KEY_PREFIX}person:`;

interface CachedPayload<T> {
  savedAt: number;
  data: T;
}

export interface PeopleDashboardCacheEntry {
  savedAt: number;
  data: PeopleDashboardData;
}

export interface PeopleDashboardPersonCacheEntry {
  savedAt: number;
  data: PeopleDashboardPersonDetail;
}

export function readCachedPeopleDashboard(
  range: PeopleDashboardRange
): PeopleDashboardCacheEntry | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    const raw = window.localStorage.getItem(buildCacheKey(range));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<CachedPayload<PeopleDashboardData>>;
    if (!parsed || typeof parsed !== "object") return undefined;
    if (typeof parsed.savedAt !== "number") return undefined;
    if (!isPeopleDashboardData(parsed.data, range)) return undefined;
    return {
      savedAt: parsed.savedAt,
      data: parsed.data,
    };
  } catch {
    return undefined;
  }
}

export function writeCachedPeopleDashboard(data: PeopleDashboardData) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      buildCacheKey(data.range),
      JSON.stringify({
        savedAt: Date.now(),
        data,
      } satisfies CachedPayload<PeopleDashboardData>)
    );
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
}

export function readCachedPeopleDashboardPerson(
  personId: string,
  month: string | null
): PeopleDashboardPersonCacheEntry | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    const raw = window.localStorage.getItem(buildPersonDetailCacheKey(personId, month));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<CachedPayload<PeopleDashboardPersonDetail>>;
    if (!parsed || typeof parsed !== "object") return undefined;
    if (typeof parsed.savedAt !== "number") return undefined;
    if (!isPeopleDashboardPersonDetail(parsed.data)) return undefined;

    return {
      savedAt: parsed.savedAt,
      data: parsed.data,
    };
  } catch {
    return undefined;
  }
}

export function writeCachedPeopleDashboardPerson(
  personId: string,
  month: string | null,
  data: PeopleDashboardPersonDetail
) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      buildPersonDetailCacheKey(personId, month),
      JSON.stringify({
        savedAt: Date.now(),
        data,
      } satisfies CachedPayload<PeopleDashboardPersonDetail>)
    );
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
}

export function clearCachedPeopleDashboards() {
  if (typeof window === "undefined") return;

  try {
    const prefix = KEY_PREFIX;
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(prefix)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage read/write failures.
  }
}

function buildCacheKey(range: PeopleDashboardRange) {
  return presentationCacheKey(`${KEY_PREFIX}${range}`);
}

function buildPersonDetailCacheKey(personId: string, month: string | null) {
  return presentationCacheKey(`${PERSON_DETAIL_KEY_PREFIX}${encodeURIComponent(personId)}:${encodeURIComponent(month ?? "current")}`);
}

function isPeopleDashboardData(
  value: unknown,
  range: PeopleDashboardRange
): value is PeopleDashboardData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PeopleDashboardData>;
  return candidate.range === range &&
    typeof candidate.generatedAt === "string" &&
    isDashboardMonth(candidate.month) &&
    Array.isArray(candidate.people) &&
    candidate.people.every(isDashboardPerson) &&
    isDashboardStats(candidate.stats) &&
    Array.isArray(candidate.monthDays) &&
    candidate.monthDays.every(isDashboardDay) &&
    Array.isArray(candidate.matrixDays) &&
    candidate.matrixDays.every((day) => typeof day === "number") &&
    isRequestBudget(candidate.requestBudget);
}

function isPeopleDashboardPersonDetail(
  value: unknown
): value is PeopleDashboardPersonDetail {
  if (!value || typeof value !== "object") return false;
  const detail = value as Partial<PeopleDashboardPersonDetail>;

  return typeof detail.generatedAt === "string" &&
    isDashboardMonth(detail.month) &&
    typeof detail.previousMonth === "string" &&
    typeof detail.nextMonth === "string" &&
    isDashboardPerson(detail.person) &&
    Array.isArray(detail.trend) &&
    detail.trend.every(isPersonDetailTrend) &&
    isPersonDetailRequestBudget(detail.requestBudget);
}

function isDashboardMonth(value: unknown): value is PeopleDashboardData["month"] {
  if (!value || typeof value !== "object") return false;
  const month = value as Partial<PeopleDashboardData["month"]>;
  return typeof month.year === "number" &&
    typeof month.monthIndex === "number" &&
    typeof month.label === "string" &&
    typeof month.daysInMonth === "number" &&
    typeof month.startsOnWeekday === "number";
}

function isDashboardPerson(value: unknown): value is PeopleDashboardPerson {
  if (!value || typeof value !== "object") return false;
  const person = value as Partial<PeopleDashboardPerson>;
  return typeof person.id === "string" &&
    typeof person.name === "string" &&
    typeof person.initials === "string" &&
    (person.photoThumbnailUrl === null || typeof person.photoThumbnailUrl === "string") &&
    Array.isArray(person.teams) &&
    person.teams.every((team) => typeof team === "string") &&
    typeof person.roles === "string" &&
    typeof person.status === "string" &&
    isLoad(person.load) &&
    typeof person.lastServed === "string" &&
    typeof person.nextScheduled === "string" &&
    typeof person.monthCount === "number" &&
    typeof person.thirtyDayCount === "number" &&
    typeof person.ninetyDayCount === "number" &&
    typeof person.upcomingCount === "number" &&
    typeof person.streak === "string" &&
    typeof person.highlight === "string" &&
    Array.isArray(person.monthDays) &&
    person.monthDays.every(isPersonMonthDay);
}

function isPersonMonthDay(
  value: unknown
): value is PeopleDashboardPerson["monthDays"][number] {
  if (!value || typeof value !== "object") return false;
  const day = value as Partial<PeopleDashboardPerson["monthDays"][number]>;
  return typeof day.day === "number" &&
    isDayKind(day.kind) &&
    isOptionalString(day.positionName) &&
    isOptionalString(day.serviceTypeName) &&
    isOptionalString(day.status) &&
    isOptionalString(day.planUrl);
}

function isPersonDetailTrend(
  value: unknown
): value is PeopleDashboardPersonDetail["trend"][number] {
  if (!value || typeof value !== "object") return false;
  const trend = value as Partial<PeopleDashboardPersonDetail["trend"][number]>;
  return typeof trend.month === "string" &&
    typeof trend.label === "string" &&
    typeof trend.services === "number" &&
    typeof trend.rehearsals === "number";
}

function isPersonDetailRequestBudget(
  value: unknown
): value is PeopleDashboardPersonDetail["requestBudget"] {
  if (!value || typeof value !== "object") return false;
  const budget = value as Partial<PeopleDashboardPersonDetail["requestBudget"]>;
  return typeof budget.scheduleRequests === "number" &&
    typeof budget.blockoutRequests === "number";
}

function isDashboardStats(value: unknown): value is PeopleDashboardData["stats"] {
  if (!value || typeof value !== "object") return false;
  const stats = value as Partial<PeopleDashboardData["stats"]>;
  return typeof stats.scheduledPeople === "number" &&
    typeof stats.highLoadPeople === "number" &&
    typeof stats.availableSoonPeople === "number";
}

function isDashboardDay(value: unknown): value is PeopleDashboardDay {
  if (!value || typeof value !== "object") return false;
  const day = value as Partial<PeopleDashboardDay>;
  return typeof day.day === "number" &&
    typeof day.serviceCount === "number" &&
    typeof day.confirmedServiceCount === "number" &&
    typeof day.potentialServiceCount === "number" &&
    typeof day.rehearsalCount === "number" &&
    typeof day.blockoutCount === "number";
}

function isRequestBudget(value: unknown): value is PeopleDashboardData["requestBudget"] {
  if (!value || typeof value !== "object") return false;
  const budget = value as Partial<PeopleDashboardData["requestBudget"]>;
  return typeof budget.teamRequests === "number" &&
    typeof budget.scheduleRequests === "number" &&
    typeof budget.blockoutRequests === "number" &&
    typeof budget.rosterPeopleCount === "number" &&
    typeof budget.hydratedPeopleCount === "number" &&
    typeof budget.sampled === "boolean";
}

function isLoad(value: unknown) {
  return value === "low" || value === "normal" || value === "high" || value === "rest";
}

function isDayKind(value: unknown) {
  return value === "service" || value === "rehearsal" || value === "blockout" || value === "rest";
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}
