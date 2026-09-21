import { formatCalendarDayInTimeZone } from "@worship-admin/planning-center-models/calendar-day";

export { formatCalendarDayInTimeZone } from "@worship-admin/planning-center-models/calendar-day";

/** Pure calendar helpers — supply IANA `timeZone` from Planning Center org resolution (server/client). */

const utcCivilMidnight = (dayKey: string): number => {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Add civil calendar days to a YYYY-MM-DD key; result formatted in `timeZone`. */
export const addCalendarDaysToDayKey = (
  dayKey: string,
  deltaDays: number,
  timeZone: string
): string => {
  const [y, m, d] = dayKey.split("-").map(Number);
  const rolled = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  return formatCalendarDayInTimeZone(rolled, timeZone);
};

/**
 * Calendar-day distance from `itemDayKey` to `refDayKey` (ref − item).
 * Positive when the reference day is after the item day.
 */
export const orgCalendarDaysRefMinusItem = (
  itemDayKey: string,
  refDayKey: string
): number =>
  Math.round(
    (utcCivilMidnight(refDayKey) - utcCivilMidnight(itemDayKey)) / 86_400_000
  );

/** Calendar days from instant `a` to instant `b` in org zone (b − a). */
export const orgCalendarDaysBetween = (
  a: Date,
  b: Date,
  orgTimeZone: string
): number =>
  orgCalendarDaysRefMinusItem(
    formatCalendarDayInTimeZone(a, orgTimeZone),
    formatCalendarDayInTimeZone(b, orgTimeZone)
  );

export interface ZonedWallTime {
  dateKey: string;
  timeValue: string;
}

interface ZonedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const zonedDateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

const createZonedDateTimeFormatter = (timeZone: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

const getZonedDateTimeFormatter = (timeZone: string): Intl.DateTimeFormat => {
  const tz = timeZone === "" ? "UTC" : timeZone;
  const existing = zonedDateTimeFormatters.get(tz);
  if (existing) {
    return existing;
  }

  const formatter = createZonedDateTimeFormatter(tz);
  zonedDateTimeFormatters.set(tz, formatter);
  return formatter;
};

const getZonedDateTimeParts = (
  instant: Date,
  timeZone: string
): ZonedDateTimeParts => {
  const parts = getZonedDateTimeFormatter(timeZone).formatToParts(instant);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
  };
};

const civilUtcMs = (parts: ZonedDateTimeParts): number =>
  Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);

const getTimeZoneOffsetMs = (instantMs: number, timeZone: string): number =>
  civilUtcMs(getZonedDateTimeParts(new Date(instantMs), timeZone)) - instantMs;

export const formatWallTimeInTimeZone = (
  instant: Date,
  timeZone: string
): ZonedWallTime => {
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
};

export const zonedWallTimeToUtcIso = (
  dateKey: string,
  timeValue: string,
  timeZone: string
): string => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  const targetCivilMs = Date.UTC(year, month - 1, day, hour, minute);
  let utcMs = targetCivilMs;

  for (let i = 0; i < 3; i += 1) {
    utcMs = targetCivilMs - getTimeZoneOffsetMs(utcMs, timeZone);
  }

  return new Date(utcMs).toISOString();
};
