/**
 * Schema building blocks the contracts share, each matching the zod rule it replaces
 * (`../*.ts`), so the API contracts accept and answer exactly what the zod transport did.
 */
import { Schema } from "effect";

/** `z.string().trim().min(1)`: trimmed, then non-empty. */
export const requiredId = Schema.Trim.check(Schema.isMinLength(1));

/**
 * `z.array(item)`: a mutable array, as zod infers, so payloads pass to programs that take
 * `T[]` and answers keep the element types the apps already use.
 */
export const mutableArray = <Item extends Schema.Top>(item: Item) =>
  Schema.mutable(Schema.Array(item));

/** `z.number()`: zod rejects NaN and the infinities. */
export const finiteNumber = Schema.Finite;

/** `z.number().int()`: a safe integer. */
export const integer = Schema.Int;

/** `z.number().int().nonnegative()`. */
export const nonNegativeInteger = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0)
);

/**
 * zod 4's ISO date regex: a real calendar day (leap years included), `T`, a 24-hour time with
 * seconds and any fraction, then `Z` or (with offsets) `±hh:mm`.
 */
const isoDate =
  "(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))";
const isoTime = "(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?";
const isoOffset = "[+-](?:[01]\\d|2[0-3]):[0-5]\\d";

const UTC_DATE_TIME = new RegExp(`^${isoDate}T${isoTime}Z$`, "u");
const OFFSET_DATE_TIME = new RegExp(
  `^${isoDate}T${isoTime}(?:Z|${isoOffset})$`,
  "u"
);

/** `z.iso.datetime()`: a UTC instant written with `Z`. */
export const isoDateTime = Schema.String.check(Schema.isPattern(UTC_DATE_TIME));

/** `z.iso.datetime({ offset: true })`: `Z` or a numeric offset, kept as written. */
export const isoDateTimeWithOffset = Schema.String.check(
  Schema.isPattern(OFFSET_DATE_TIME)
);
