import type {
  PeopleDashboardData,
  PeopleDashboardPersonDetail,
  PeopleDashboardRange,
} from "@worship-admin/contracts/people-schemas";
import { z } from "zod";

import { presentationCacheKey } from "@/lib/presentation-cache";

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

const dashboardMonthSchema = z.object({
  year: z.number(),
  monthIndex: z.number(),
  label: z.string(),
  daysInMonth: z.number(),
  startsOnWeekday: z.number(),
});

const personMonthDaySchema = z.object({
  day: z.number(),
  kind: z.enum(["service", "rehearsal", "blockout", "rest"]),
  positionName: z.string().optional(),
  serviceTypeName: z.string().optional(),
  status: z.string().optional(),
  planUrl: z.string().optional(),
});

const dashboardPersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  initials: z.string(),
  photoThumbnailUrl: z.string().nullable(),
  teams: z.array(z.string()),
  roles: z.string(),
  status: z.string(),
  load: z.enum(["low", "normal", "high", "rest"]),
  lastServed: z.string(),
  lastRehearsal: z.string().optional(),
  nextScheduled: z.string(),
  nextRehearsal: z.string().optional(),
  monthCount: z.number(),
  thirtyDayCount: z.number(),
  ninetyDayCount: z.number(),
  upcomingCount: z.number(),
  streak: z.string(),
  highlight: z.string(),
  monthDays: z.array(personMonthDaySchema),
});

const dashboardDaySchema = z.object({
  day: z.number(),
  serviceCount: z.number(),
  confirmedServiceCount: z.number(),
  potentialServiceCount: z.number(),
  rehearsalCount: z.number(),
  blockoutCount: z.number(),
});

const requestBudgetSchema = z.object({
  teamRequests: z.number(),
  scheduleRequests: z.number(),
  blockoutRequests: z.number(),
  rosterPeopleCount: z.number(),
  hydratedPeopleCount: z.number(),
  sampled: z.boolean(),
});

const peopleDashboardDataSchema = z.object({
  range: z.enum(["month", "30", "90"]),
  generatedAt: z.string(),
  month: dashboardMonthSchema,
  people: z.array(dashboardPersonSchema),
  stats: z.object({
    scheduledPeople: z.number(),
    highLoadPeople: z.number(),
    availableSoonPeople: z.number(),
  }),
  monthDays: z.array(dashboardDaySchema),
  matrixDays: z.array(z.number()),
  requestBudget: requestBudgetSchema,
});

const peopleDashboardPersonDetailSchema = z.object({
  generatedAt: z.string(),
  month: dashboardMonthSchema,
  previousMonth: z.string(),
  nextMonth: z.string(),
  person: dashboardPersonSchema,
  trend: z.array(
    z.object({
      month: z.string(),
      label: z.string(),
      services: z.number(),
      rehearsals: z.number(),
    })
  ),
  requestBudget: z.object({
    scheduleRequests: z.number(),
    blockoutRequests: z.number(),
  }),
});

const cachedDashboardPayloadSchema = z.object({
  savedAt: z.number(),
  data: peopleDashboardDataSchema,
});

const cachedPersonDetailPayloadSchema = z.object({
  savedAt: z.number(),
  data: peopleDashboardPersonDetailSchema,
});

const buildCacheKey = (range: PeopleDashboardRange): string =>
  presentationCacheKey(`${KEY_PREFIX}${range}`);

const buildPersonDetailCacheKey = (
  personId: string,
  month: string | null
): string =>
  presentationCacheKey(
    `${PERSON_DETAIL_KEY_PREFIX}${encodeURIComponent(personId)}:${encodeURIComponent(month ?? "current")}`
  );

export const readCachedPeopleDashboard = (
  range: PeopleDashboardRange
): PeopleDashboardCacheEntry | undefined => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return undefined;
  }

  try {
    const raw = storage.getItem(buildCacheKey(range));
    if (raw === null) {
      return undefined;
    }
    const parsed = cachedDashboardPayloadSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.data.range !== range) {
      return undefined;
    }
    return parsed.data;
  } catch {
    return undefined;
  }
};

export const writeCachedPeopleDashboard = (data: PeopleDashboardData): void => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return;
  }

  try {
    storage.setItem(
      buildCacheKey(data.range),
      JSON.stringify({
        savedAt: Date.now(),
        data,
      } satisfies CachedPayload<PeopleDashboardData>)
    );
  } catch {
    // Ignore storage failures; query invalidation still refreshes live data.
  }
};

export const readCachedPeopleDashboardPerson = (
  personId: string,
  month: string | null
): PeopleDashboardPersonCacheEntry | undefined => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return undefined;
  }

  try {
    const raw = storage.getItem(buildPersonDetailCacheKey(personId, month));
    if (raw === null) {
      return undefined;
    }
    const parsed = cachedPersonDetailPayloadSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return undefined;
    }
    return parsed.data;
  } catch {
    return undefined;
  }
};

export const writeCachedPeopleDashboardPerson = (
  personId: string,
  month: string | null,
  data: PeopleDashboardPersonDetail
): void => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return;
  }

  try {
    storage.setItem(
      buildPersonDetailCacheKey(personId, month),
      JSON.stringify({
        savedAt: Date.now(),
        data,
      } satisfies CachedPayload<PeopleDashboardPersonDetail>)
    );
  } catch {
    // Ignore storage failures; query invalidation still refreshes live data.
  }
};

export const clearCachedPeopleDashboards = (): void => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return;
  }

  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(KEY_PREFIX) === true) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage read/write failures.
  }
};
