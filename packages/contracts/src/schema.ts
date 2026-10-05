import { Schema } from "effect";

const utcInstantPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z$/u;
const offsetInstantPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/u;
const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const validInstant = Schema.makeFilter<string>((value) => {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = month === 2 && leapYear ? 29 : monthLengths[month - 1];
  return Number.isFinite(Date.parse(value)) &&
    daysInMonth !== undefined &&
    day >= 1 &&
    day <= daysInMonth
    ? undefined
    : "Expected a valid ISO date-time";
});
/** ISO date-time strings retain their offset, preserving congregation-day comparisons. */
export const isoInstantWithOffsetSchema = Schema.String.check(
  Schema.isPattern(offsetInstantPattern),
  validInstant
);
export const isoInstantSchema = Schema.String.check(
  Schema.isPattern(utcInstantPattern),
  validInstant
);
