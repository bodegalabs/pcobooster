/** Formatters contain no account data and can be shared by every date in the same zone. */
const calendarDayFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Calendar YYYY-MM-DD for an instant in an IANA timezone (matches Planning Center wall times).
 */
export const formatCalendarDayInTimeZone = (
  instant: Date,
  timeZone: string
): string => {
  const zone = timeZone === "" ? "UTC" : timeZone;
  let formatter = calendarDayFormatters.get(zone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    calendarDayFormatters.set(zone, formatter);
  }
  return formatter.format(instant);
};

/**
 * True if the plan's sort instant falls on a local calendar day that is touched by the
 * blockout's [startsAt, endsAt] range in the blockout's timezone (Services blockouts use this model).
 */
export const blockoutCoversPlanSortInstant = (
  planSortAt: Date,
  blockout: { startsAt: Date; endsAt: Date; timeZone?: string | null }
): boolean => {
  const tz = blockout.timeZone?.trim() ?? "UTC";
  const planDay = formatCalendarDayInTimeZone(planSortAt, tz);
  const startDay = formatCalendarDayInTimeZone(blockout.startsAt, tz);
  const endDay = formatCalendarDayInTimeZone(blockout.endsAt, tz);
  return planDay >= startDay && planDay <= endDay;
};
