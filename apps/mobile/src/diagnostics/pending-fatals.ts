/**
 * Fatal reports kept on the device until they may be sent: one small JSON file, written
 * synchronously while the app is crashing and read back on a later launch.
 *
 * Bounded: at most `MAX_PENDING` reports, each at most `MAX_RECORD_BYTES` serialized, none older
 * than `PENDING_MAX_AGE_MS`. A repeat of a kept fatal (a crash loop) raises its count instead of
 * taking another slot. Reports keep only what `sanitize.ts` allowed plus the release they were
 * captured in, the app session, and whose context they belong to (`capture-policy.ts`).
 * Anything unreadable is discarded.
 */
import { Option, Schema } from "effect";

import type { ReportOwner } from "./capture-policy";
import { ExceptionRecordSchema } from "./exception-record";
import { sanitizeExceptionList } from "./sanitize";

export const MAX_PENDING = 3;
export const MAX_RECORD_BYTES = 16_384;
export const PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** A report PostHog keeps refusing is given up after this many tries. */
export const MAX_SEND_ATTEMPTS = 5;
const REDUCED_FRAMES = 20;
const FIELD_MAX_LENGTH = 200;

/** Synchronous text file access (`expo-file-system`'s `File` on the device). */
export interface SyncTextFile {
  readonly read: () => string | null;
  readonly write: (text: string) => void;
  readonly remove: () => void;
}

const Field = Schema.String.check(Schema.isMaxLength(FIELD_MAX_LENGTH));

const ReportOwnerSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("before-sign-in") }),
  Schema.Struct({ kind: Schema.Literal("user"), userId: Field }),
]);

const ReportReleaseSchema = Schema.Struct({
  version: Field,
  build: Field,
  revision: Field,
});
/** The release a report was captured in. */
export type ReportRelease = typeof ReportReleaseSchema.Type;

const PendingFatalSchema = Schema.Struct({
  /** The event's UUID, so a repeated delivery is one event in PostHog. */
  id: Field,
  capturedAt: Field.check(
    Schema.makeFilter((value) => !Number.isNaN(Date.parse(value)))
  ),
  owner: ReportOwnerSchema,
  release: ReportReleaseSchema,
  appSessionId: Field,
  record: ExceptionRecordSchema,
  count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  attempts: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type PendingFatal = typeof PendingFatalSchema.Type;

export interface PendingFatals {
  readonly add: (fatal: PendingFatal) => void;
  /** The kept reports, after dropping expired and unreadable ones. */
  readonly list: () => PendingFatal[];
  readonly replace: (fatals: readonly PendingFatal[]) => void;
  readonly clear: () => void;
}

const decodeFile = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Array(Schema.Unknown))
);
const decodeFatal = Schema.decodeUnknownOption(PendingFatalSchema);

/**
 * Kept reports again sanitized after decoding (which drops fields the schema does not name), so
 * an altered file cannot carry anything extra off the device.
 */
const resanitized = (fatal: PendingFatal): PendingFatal => ({
  ...fatal,
  record: {
    ...fatal.record,
    exceptions: sanitizeExceptionList(fatal.record.exceptions),
  },
});

/** The report, trimmed to fit `MAX_RECORD_BYTES`, or null when even that does not fit. */
const fitted = (fatal: PendingFatal): PendingFatal | null => {
  if (JSON.stringify(fatal).length <= MAX_RECORD_BYTES) {
    return fatal;
  }
  const exceptions = fatal.record.exceptions.slice(0, 1).map((exception) =>
    exception.stacktrace === undefined
      ? exception
      : {
          ...exception,
          stacktrace: {
            type: exception.stacktrace.type,
            frames: exception.stacktrace.frames.slice(-REDUCED_FRAMES),
          },
        }
  );
  const reduced = { ...fatal, record: { ...fatal.record, exceptions } };
  return JSON.stringify(reduced).length <= MAX_RECORD_BYTES ? reduced : null;
};

const sameOwner = (left: ReportOwner, right: ReportOwner): boolean =>
  left.kind === right.kind &&
  (left.kind === "before-sign-in" ||
    (right.kind === "user" && left.userId === right.userId));

export const makePendingFatals = (
  file: SyncTextFile,
  now: () => number
): PendingFatals => {
  const list = (): PendingFatal[] => {
    const text = file.read();
    if (text === null) {
      return [];
    }
    const entries = decodeFile(text);
    if (Option.isNone(entries)) {
      file.remove();
      return [];
    }
    const oldest = now() - PENDING_MAX_AGE_MS;
    return entries.value
      .flatMap((entry) => {
        const fatal = decodeFatal(entry);
        return Option.isSome(fatal) &&
          Date.parse(fatal.value.capturedAt) >= oldest
          ? [resanitized(fatal.value)]
          : [];
      })
      .slice(0, MAX_PENDING);
  };
  const replace = (fatals: readonly PendingFatal[]) => {
    if (fatals.length === 0) {
      file.remove();
      return;
    }
    file.write(JSON.stringify(fatals.slice(0, MAX_PENDING)));
  };
  return {
    list,
    replace,
    clear: () => {
      file.remove();
    },
    add: (fatal) => {
      const kept = fitted(fatal);
      if (kept === null) {
        return;
      }
      const existing = list();
      const repeat = existing.findIndex(
        (other) =>
          other.record.fingerprint === kept.record.fingerprint &&
          other.release.build === kept.release.build &&
          sameOwner(other.owner, kept.owner)
      );
      const repeated = existing[repeat];
      if (repeated !== undefined) {
        replace(
          existing.with(repeat, { ...repeated, count: repeated.count + 1 })
        );
        return;
      }
      // Full: keep the earliest reports, which are usually the cause of the later ones.
      if (existing.length >= MAX_PENDING) {
        return;
      }
      replace([...existing, kept]);
    },
  };
};
