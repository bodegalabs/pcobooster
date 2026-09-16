import { formatCalendarDayInTimeZone } from "@/lib/use-cases/planning-center/people/calendar-day";

export { formatCalendarDayInTimeZone };

/** Pure calendar helpers — supply IANA `timeZone` from Planning Center org resolution (server/client). */

function utcCivilMidnight(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Add civil calendar days to a YYYY-MM-DD key; result formatted in `timeZone`. */
export function addCalendarDaysToDayKey(
  dayKey: string,
  deltaDays: number,
  timeZone: string
): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const rolled = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  return formatCalendarDayInTimeZone(rolled, timeZone);
}

/**
 * Calendar-day distance from `itemDayKey` to `refDayKey` (ref − item).
 * Positive when the reference day is after the item day.
 */
export function orgCalendarDaysRefMinusItem(
  itemDayKey: string,
  refDayKey: string
): number {
  return Math.round(
    (utcCivilMidnight(refDayKey) - utcCivilMidnight(itemDayKey)) / 86_400_000
  );
}

/** Calendar days from instant `a` to instant `b` in org zone (b − a). */
export function orgCalendarDaysBetween(
  a: Date,
  b: Date,
  orgTimeZone: string
): number {
  return orgCalendarDaysRefMinusItem(
    formatCalendarDayInTimeZone(a, orgTimeZone),
    formatCalendarDayInTimeZone(b, orgTimeZone)
  );
}

export interface ZonedWallTime {
  dateKey: string;
  timeValue: string;
}

type ZonedDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const zonedDateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function getZonedDateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  const tz = timeZone || "UTC";
  const existing = zonedDateTimeFormatters.get(tz);
  if (existing) return existing;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  zonedDateTimeFormatters.set(tz, formatter);
  return formatter;
}

function getZonedDateTimeParts(
  instant: Date,
  timeZone: string
): ZonedDateTimeParts {
  const parts = getZonedDateTimeFormatter(timeZone).formatToParts(instant);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
  };
}

function civilUtcMs(parts: ZonedDateTimeParts): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute
  );
}

function getTimeZoneOffsetMs(instantMs: number, timeZone: string): number {
  return (
    civilUtcMs(getZonedDateTimeParts(new Date(instantMs), timeZone)) - instantMs
  );
}

export function formatWallTimeInTimeZone(
  instant: Date,
  timeZone: string
): ZonedWallTime {
  const parts = getZonedDateTimeParts(instant, timeZone);
  return {
    dateKey: [
      String(parts.year).padStart(4, "0"),
      String(parts.month).padStart(2, "0"),
      String(parts.day).padStart(2, "0"),
    ].join("-"),
    timeValue: [
      String(parts.hour).padStart(2, "0"),
      String(parts.minute).padStart(2, "0"),
    ].join(":"),
  };
}

export function zonedWallTimeToUtcIso(
  dateKey: string,
  timeValue: string,
  timeZone: string
): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  const targetCivilMs = Date.UTC(year, month - 1, day, hour, minute);
  let utcMs = targetCivilMs;

  for (let i = 0; i < 3; i++) {
    utcMs = targetCivilMs - getTimeZoneOffsetMs(utcMs, timeZone);
  }

  return new Date(utcMs).toISOString();
}
