import { isNonEmptyString } from "@worship-admin/api/json";
import { orgCalendarDaysRefMinusItem } from "@worship-admin/api/planning-center/org-calendar";
import type {
  ScheduleFrequency,
  ServiceHistoryItem,
} from "@worship-admin/api/types";
import { formatCalendarDayInTimeZone } from "@worship-admin/api/use-cases/planning-center/people/calendar-day";

const displayDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const localDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Distinct engagement days in the plan-history band (parity: past = service days + rehearsal-only days; future = same split). */
export const formatScheduleFrequencyLine = (
  frequency: ScheduleFrequency | undefined
): string | null => {
  if (!frequency) {
    return null;
  }
  const served =
    frequency.recentServedDays + (frequency.recentRehearsalOnlyDays ?? 0);
  const upcoming =
    (frequency.upcomingServices ?? 0) + (frequency.upcomingRehearsals ?? 0);
  return `${served} served | ${upcoming} upcoming`;
};

export const toServiceHistoryDate = (value: Date | string | undefined) => {
  if (value instanceof Date) {
    return value;
  }
  const parsed = isNonEmptyString(value)
    ? new Date(value)
    : new Date(Number.NaN);
  return parsed;
};

export const formatServiceHistoryDisplayDate = (
  date: Date | string | undefined
) => {
  if (date === undefined || date === "") {
    return "Unknown date";
  }
  const dateObj = toServiceHistoryDate(date);
  if (Number.isNaN(dateObj.getTime())) {
    return "Invalid date";
  }

  return displayDateFormatter.format(dateObj);
};

export const formatHistoryStatusLabel = (
  status: string | undefined
): string => {
  const raw = (status ?? "").trim();
  const normalized = raw.toLowerCase();
  if (raw === "C" || normalized === "confirmed") {
    return "Confirmed";
  }
  if (raw === "U" || normalized === "unconfirmed") {
    return "Scheduled";
  }
  if (raw === "D" || normalized === "declined") {
    return "Declined";
  }
  return raw || "Unknown";
};

export const getHistoryStatusBadgeClass = (
  status: string | undefined
): string => {
  const raw = (status ?? "").trim();
  const normalized = raw.toLowerCase();
  if (raw === "C" || normalized === "confirmed") {
    return "border-emerald-400/70 bg-emerald-600/45 text-emerald-50 dark:bg-emerald-600/50";
  }
  if (raw === "U" || normalized === "unconfirmed") {
    return "border-amber-400/70 bg-amber-600/45 text-amber-50 dark:bg-amber-600/50";
  }
  if (raw === "D" || normalized === "declined") {
    return "border-red-400/70 bg-red-600/45 text-red-50 dark:bg-red-600/50";
  }
  return "border-border bg-muted/80 text-muted-foreground";
};

export const getHistoryStatusDotClass = (
  status: string | undefined
): string => {
  const raw = (status ?? "").trim();
  const normalized = raw.toLowerCase();
  if (raw === "C" || normalized === "confirmed") {
    return "bg-status-confirmed";
  }
  if (raw === "U" || normalized === "unconfirmed") {
    return "bg-status-scheduled";
  }
  if (raw === "D" || normalized === "declined") {
    return "bg-status-declined";
  }
  return "bg-muted-foreground/50";
};

const toDayKey = (value: Date | string | undefined): string | null => {
  const date = toServiceHistoryDate(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return localDayFormatter.format(date);
};

export interface ServiceHistoryGroup {
  dayKey: string;
  primary: ServiceHistoryItem;
  additionalServices: ServiceHistoryItem[];
  rehearsals: ServiceHistoryItem[];
}

export const buildServiceHistoryGroups = (
  items: ServiceHistoryItem[]
): ServiceHistoryGroup[] => {
  const bySchedule = new Map<string, ServiceHistoryItem[]>();
  const order: string[] = [];

  for (const item of items) {
    const key = item.sourceScheduleId || item.id;
    let scheduleItems = bySchedule.get(key);
    if (!scheduleItems) {
      scheduleItems = [];
      bySchedule.set(key, scheduleItems);
      order.push(key);
    }
    scheduleItems.push(item);
  }

  const baseGroups = order.map((key) => {
    const groupItems = [...(bySchedule.get(key) ?? [])].toSorted(
      (a, b) =>
        toServiceHistoryDate(a.date).getTime() -
        toServiceHistoryDate(b.date).getTime()
    );
    const primary =
      groupItems.find((item) => item.timeType === "service") ??
      groupItems.find((item) => item.timeType !== "rehearsal") ??
      groupItems[0];

    const primaryDayKey = toDayKey(primary.date);
    const seenRehearsalDays = new Set<string>();
    const additionalServices = groupItems.filter((item) => {
      if (item.id === primary.id) {
        return false;
      }
      return item.timeType !== "rehearsal";
    });
    const rehearsals = groupItems.filter((item) => {
      if (item.id === primary.id || item.timeType !== "rehearsal") {
        return false;
      }
      const rehearsalDayKey = toDayKey(item.date);
      if (
        isNonEmptyString(primaryDayKey) &&
        isNonEmptyString(rehearsalDayKey) &&
        primaryDayKey === rehearsalDayKey
      ) {
        return false;
      }
      if (
        isNonEmptyString(rehearsalDayKey) &&
        seenRehearsalDays.has(rehearsalDayKey)
      ) {
        return false;
      }
      if (isNonEmptyString(rehearsalDayKey)) {
        seenRehearsalDays.add(rehearsalDayKey);
      }
      return true;
    });

    return { dayKey: key, primary, additionalServices, rehearsals };
  });

  const mergedGroups = new Map<string, ServiceHistoryGroup>();
  const mergedOrder: string[] = [];

  for (const group of baseGroups) {
    const mergeKey = [
      toDayKey(group.primary.date) ?? group.dayKey,
      group.primary.teamName ?? "",
      group.primary.serviceTypeName ?? "",
      group.primary.planTitle ?? "",
      (group.primary.status || "").trim().toLowerCase(),
    ].join("|");

    const existing = mergedGroups.get(mergeKey);
    if (!existing) {
      mergedGroups.set(mergeKey, {
        dayKey: mergeKey,
        primary: group.primary,
        additionalServices: [...group.additionalServices],
        rehearsals: [...group.rehearsals],
      });
      mergedOrder.push(mergeKey);
      continue;
    }

    existing.additionalServices.push(
      group.primary,
      ...group.additionalServices
    );

    const seenRehearsalIds = new Set(
      existing.rehearsals.map((item) => item.id)
    );
    const seenRehearsalDayKeys = new Set<string>();
    for (const rehearsal of existing.rehearsals) {
      const dayKey = toDayKey(rehearsal.date);
      if (dayKey !== null) {
        seenRehearsalDayKeys.add(dayKey);
      }
    }
    for (const rehearsal of group.rehearsals) {
      if (seenRehearsalIds.has(rehearsal.id)) {
        continue;
      }
      const rehearsalDay = toDayKey(rehearsal.date);
      if (
        isNonEmptyString(rehearsalDay) &&
        seenRehearsalDayKeys.has(rehearsalDay)
      ) {
        continue;
      }
      existing.rehearsals.push(rehearsal);
      seenRehearsalIds.add(rehearsal.id);
      if (isNonEmptyString(rehearsalDay)) {
        seenRehearsalDayKeys.add(rehearsalDay);
      }
    }
  }

  return mergedOrder.map((key) => {
    const group = mergedGroups.get(key);
    if (!group) {
      throw new Error(`Missing merged service history group: ${key}`);
    }
    return group;
  });
};

export const filterServiceHistoryWithinHalfRange = (
  items: ServiceHistoryItem[],
  referenceDate: Date | string | null | undefined,
  halfRangeDays: number,
  orgTimeZone: string
): ServiceHistoryItem[] => {
  if (halfRangeDays <= 0) {
    return [];
  }

  const reference = toServiceHistoryDate(referenceDate ?? undefined);
  if (Number.isNaN(reference.getTime())) {
    return items;
  }

  const refDayKey = formatCalendarDayInTimeZone(reference, orgTimeZone);
  return items.filter((item) => {
    const itemDayKey = formatCalendarDayInTimeZone(item.date, orgTimeZone);
    const daysDiff = orgCalendarDaysRefMinusItem(itemDayKey, refDayKey);
    return daysDiff >= -halfRangeDays && daysDiff <= halfRangeDays;
  });
};

const absOrgCalendarDaysBetween = (
  a: Date,
  b: Date,
  orgTimeZone: string
): number => {
  const tz = orgTimeZone.trim() || "UTC";
  const dayA = formatCalendarDayInTimeZone(a, tz);
  const dayB = formatCalendarDayInTimeZone(b, tz);
  return Math.abs(orgCalendarDaysRefMinusItem(dayA, dayB));
};

/** Shorthand for strip/summary: latest service day in history. */
export const pickLatestServiceHistoryGroup = (
  groups: ServiceHistoryGroup[]
): ServiceHistoryGroup | null => {
  if (groups.length === 0) {
    return null;
  }
  const [first] = groups;
  let best = first;
  for (const group of groups.slice(1)) {
    const time = toServiceHistoryDate(group.primary.date).getTime();
    const bestTime = toServiceHistoryDate(best.primary.date).getTime();
    if (time > bestTime) {
      best = group;
    }
  }
  return best;
};

/**
 * History group whose primary service is on the calendar day closest to `referenceDate` in `orgTimeZone`.
 * Tie-break: more recent calendar instant (later `primary.date`).
 */
export const pickServiceHistoryGroupClosestToReference = (
  groups: ServiceHistoryGroup[],
  referenceDate: Date | string | null | undefined,
  orgTimeZone: string
): ServiceHistoryGroup | null => {
  if (groups.length === 0) {
    return null;
  }
  const ref = toServiceHistoryDate(referenceDate ?? undefined);
  if (Number.isNaN(ref.getTime())) {
    return pickLatestServiceHistoryGroup(groups);
  }
  const tz = orgTimeZone.trim() || "UTC";
  let [best] = groups;
  let bestDelta = absOrgCalendarDaysBetween(
    toServiceHistoryDate(best.primary.date),
    ref,
    tz
  );
  for (let i = 1; i < groups.length; i += 1) {
    const g = groups[i];
    const delta = absOrgCalendarDaysBetween(
      toServiceHistoryDate(g.primary.date),
      ref,
      tz
    );
    if (delta < bestDelta) {
      best = g;
      bestDelta = delta;
    } else if (delta === bestDelta) {
      const gt = toServiceHistoryDate(g.primary.date).getTime();
      const bt = toServiceHistoryDate(best.primary.date).getTime();
      if (gt > bt) {
        best = g;
      }
    }
  }
  return best;
};

export const formatCombinedHistoryPositionLabel = (
  primary: ServiceHistoryItem,
  additionalServices: ServiceHistoryItem[]
) => {
  const positions = [primary, ...additionalServices]
    .map((item) => item.teamPositionName?.trim())
    .filter((value): value is string => Boolean(value));

  const uniquePositions = [...new Set(positions)];
  const positionText = uniquePositions.join(", ");
  if (!positionText) {
    return "Unknown position";
  }

  return isNonEmptyString(primary.teamName)
    ? `${primary.teamName} - ${positionText}`
    : positionText;
};
