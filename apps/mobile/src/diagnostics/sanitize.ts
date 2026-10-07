/**
 * What an exception may carry off the device. Every exception and frame is rebuilt from an
 * allowlist; anything not named here (source context, absolute paths, module names, variables,
 * thread IDs, SDK extras) is dropped rather than scrubbed.
 *
 * Messages lose URLs, email addresses, paths, UUIDs, token-like strings, long digit runs
 * (Planning Center IDs), and quoted or JSON-looking values (decode errors quote the data they
 * failed on), then are truncated. Frame file names keep only their last path segment without
 * query or fragment, so the device's app-container path never leaves it; chunk IDs, lines, and
 * columns are kept because symbolication needs exactly those.
 */
import type {
  Exception,
  Mechanism,
  StackFrame,
} from "@posthog/core/error-tracking";
import { Schema } from "effect";

export const MESSAGE_MAX_LENGTH = 200;
const FUNCTION_MAX_LENGTH = 120;
const FILENAME_MAX_LENGTH = 80;
export const MAX_EXCEPTIONS = 3;
export const MAX_FRAMES = 50;

const URL_PATTERN = /\b[a-z][a-z\d+.-]*:\/\/\S+/giu;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu;
const UUID_PATTERN =
  /\b[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\b/giu;
const TOKEN_PATTERN = /(?=[\w+/=.-]*\d)[\w+/=.-]{24,}/gu;
const DIGITS_PATTERN = /\d{4,}/gu;
const JSON_PATTERN = /[{[][^{}[\]]*[}\]]/gu;
const LONG_QUOTED_PATTERN = /(?<quote>["'`])[^"'`]{25,}\k<quote>/gu;
const PATH_PATTERN = /(?:\/[\w.@-]+){2,}/gu;
const WHITESPACE = /\s+/gu;
const PATH_SEPARATORS = /[\\/]/u;
const QUERY_OR_FRAGMENT = /[?#].*$/u;
const TYPE_NAME = /^[A-Za-z_$][\w$.]{0,63}$/u;
const SAFE_FUNCTION = /^[\w$.<>?\- ]+$/u;
const CHUNK_ID = /^[\da-f-]{8,64}$/iu;

/** A message safe to send, or the empty string. */
export const sanitizeMessage = (message: string): string =>
  message
    .replace(URL_PATTERN, "<url>")
    .replace(EMAIL_PATTERN, "<email>")
    .replace(UUID_PATTERN, "<id>")
    .replace(JSON_PATTERN, "<value>")
    .replace(LONG_QUOTED_PATTERN, "$<quote><value>$<quote>")
    .replace(PATH_PATTERN, "<path>")
    .replace(TOKEN_PATTERN, "<token>")
    .replace(DIGITS_PATTERN, "<n>")
    .replace(WHITESPACE, " ")
    .trim()
    .slice(0, MESSAGE_MAX_LENGTH);

/** An error class name such as `TypeError`; anything else becomes `Error`. */
export const sanitizeType = (type: string | undefined): string =>
  type !== undefined && TYPE_NAME.test(type) ? type : "Error";

/** The last path segment, without query or fragment (`main.jsbundle`). */
export const sanitizeFilename = (filename: string): string =>
  (filename.replace(QUERY_OR_FRAGMENT, "").split(PATH_SEPARATORS).pop() ?? "")
    .slice(0, FILENAME_MAX_LENGTH)
    .replace(DIGITS_PATTERN, "<n>");

const sanitizeFunction = (name: string | undefined): string =>
  name !== undefined && SAFE_FUNCTION.test(name)
    ? name.slice(0, FUNCTION_MAX_LENGTH)
    : "?";

const finite = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value);

const SafeFrameSchema = Schema.Struct({
  platform: Schema.Literals(["hermes", "web:javascript"]),
  filename: Schema.String,
  function: Schema.String,
  in_app: Schema.Boolean,
  lineno: Schema.optionalKey(Schema.Number),
  colno: Schema.optionalKey(Schema.Number),
  chunk_id: Schema.optionalKey(Schema.String),
});
export type SafeFrame = typeof SafeFrameSchema.Type;

const SafeMechanismSchema = Schema.Struct({
  type: Schema.String,
  handled: Schema.Boolean,
  synthetic: Schema.Boolean,
  exception_id: Schema.optionalKey(Schema.Number),
  parent_id: Schema.optionalKey(Schema.Number),
  source: Schema.optionalKey(Schema.Literal("cause")),
});
export type SafeMechanism = typeof SafeMechanismSchema.Type;

/** A sanitized exception; also how a kept report is read back from disk. */
export const SafeExceptionSchema = Schema.Struct({
  type: Schema.String,
  value: Schema.String,
  mechanism: SafeMechanismSchema,
  stacktrace: Schema.optionalKey(
    Schema.Struct({
      type: Schema.Literal("raw"),
      frames: Schema.Array(SafeFrameSchema),
    })
  ),
});
export type SafeException = typeof SafeExceptionSchema.Type;

type Mutable<Value> = { -readonly [Key in keyof Value]: Value[Key] };

const sanitizeFrame = (frame: StackFrame | SafeFrame): SafeFrame => {
  const safe: Mutable<SafeFrame> = {
    platform: frame.platform === "hermes" ? "hermes" : "web:javascript",
    filename:
      frame.filename === undefined ? "" : sanitizeFilename(frame.filename),
    function: sanitizeFunction(frame.function),
    in_app: frame.in_app === true,
  };
  if (finite(frame.lineno)) {
    safe.lineno = frame.lineno;
  }
  if (finite(frame.colno)) {
    safe.colno = frame.colno;
  }
  if (frame.chunk_id !== undefined && CHUNK_ID.test(frame.chunk_id)) {
    safe.chunk_id = frame.chunk_id;
  }
  return safe;
};

const MECHANISM_TYPES = new Set([
  "generic",
  "chained",
  "onuncaughtexception",
  "onunhandledrejection",
  "react-error-boundary",
]);

const sanitizeMechanism = (
  mechanism: Mechanism | SafeMechanism | undefined
): SafeMechanism => {
  const safe: Mutable<SafeMechanism> = {
    type:
      mechanism?.type !== undefined && MECHANISM_TYPES.has(mechanism.type)
        ? mechanism.type
        : "generic",
    handled: mechanism?.handled !== false,
    synthetic: mechanism?.synthetic === true,
  };
  if (finite(mechanism?.exception_id)) {
    safe.exception_id = mechanism.exception_id;
  }
  if (finite(mechanism?.parent_id)) {
    safe.parent_id = mechanism.parent_id;
  }
  if (mechanism?.source === "cause") {
    safe.source = "cause";
  }
  return safe;
};

/** Thrown values that are not errors say only that much; their keys could be data. */
const NON_ERROR_VALUE = "A non-error value was thrown";

const sanitizeException = (
  exception: Exception | SafeException
): SafeException => {
  const mechanism = sanitizeMechanism(exception.mechanism);
  const frames = (exception.stacktrace?.frames ?? [])
    // Outermost first: keep the innermost frames, where the error was thrown.
    .slice(-MAX_FRAMES)
    .map(sanitizeFrame);
  const value =
    mechanism.synthetic && mechanism.type !== "chained"
      ? NON_ERROR_VALUE
      : sanitizeMessage(exception.value ?? "");
  const safe: Mutable<SafeException> = {
    type: sanitizeType(exception.type),
    value,
    mechanism,
  };
  if (frames.length > 0) {
    safe.stacktrace = { type: "raw", frames };
  }
  return safe;
};

/** An exception list rebuilt from the allowlist above, at most `MAX_EXCEPTIONS` long. */
export const sanitizeExceptionList = (
  list: readonly (Exception | SafeException)[]
): SafeException[] => list.slice(0, MAX_EXCEPTIONS).map(sanitizeException);
