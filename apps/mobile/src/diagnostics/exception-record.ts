/**
 * Turns a thrown value into the `$exception_list` PostHog's error tracking reads, with the same
 * builder, coercers, and Hermes stack parser `posthog-react-native` uses, so frames carry the
 * `chunk_id` the Metro plugin injects (`metro.config.js`) and symbolicate against the uploaded
 * Hermes source maps. The list is then rebuilt by `sanitize.ts` before anything keeps it.
 *
 * Imported by `fatal-persistence.ts` right after the sentinel, so it depends only on
 * `@posthog/core`'s error-tracking entry (plain JavaScript with no React Native or polyfill needs)
 * and the sanitizer.
 */
import {
  chromeStackLineParser,
  createStackParser,
  ErrorCoercer,
  ErrorEventCoercer,
  ErrorPropertiesBuilder,
  geckoStackLineParser,
  ObjectCoercer,
  PrimitiveCoercer,
  PromiseRejectionEventCoercer,
  StringCoercer,
} from "@posthog/core/error-tracking";
import { Schema } from "effect";

import { SafeExceptionSchema, sanitizeExceptionList } from "./sanitize";
import type { SafeException } from "./sanitize";

export type ExceptionLevel = "error" | "fatal";

/** How the error reached diagnostics; becomes the exception's mechanism. */
export type ExceptionSource =
  | "uncaught"
  | "fatal"
  | "unhandled-rejection"
  | "react-error-boundary"
  | "handled";

export const ExceptionRecordSchema = Schema.Struct({
  level: Schema.Literals(["error", "fatal"]),
  exceptions: Schema.Array(SafeExceptionSchema),
  /** Groups repeats for deduplication: type, message, and the innermost frame's position. */
  fingerprint: Schema.String.check(Schema.isMaxLength(400)),
});
export type ExceptionRecord = typeof ExceptionRecordSchema.Type;

const builder = new ErrorPropertiesBuilder(
  [
    new PromiseRejectionEventCoercer(),
    new ErrorCoercer(),
    new ErrorEventCoercer(),
    new ObjectCoercer(),
    new StringCoercer(),
    new PrimitiveCoercer(),
  ],
  createStackParser("hermes", chromeStackLineParser, geckoStackLineParser)
);

const mechanisms: Record<
  ExceptionSource,
  { readonly type: string; readonly handled: boolean }
> = {
  fatal: { type: "onuncaughtexception", handled: false },
  uncaught: { type: "onuncaughtexception", handled: false },
  "unhandled-rejection": { type: "onunhandledrejection", handled: false },
  "react-error-boundary": { type: "react-error-boundary", handled: true },
  handled: { type: "generic", handled: true },
};

const fingerprintOf = (exceptions: readonly SafeException[]): string => {
  const [first] = exceptions;
  if (first === undefined) {
    return "empty";
  }
  const frames = first.stacktrace?.frames ?? [];
  const top = frames.at(-1);
  const position =
    top === undefined
      ? ""
      : `${top.filename}:${top.lineno ?? 0}:${top.colno ?? 0}`;
  return `${first.type}|${first.value}|${position}`;
};

/** The sanitized record for a thrown value; never throws. */
export const buildExceptionRecord = (
  cause: unknown,
  source: ExceptionSource
): ExceptionRecord => {
  const level: ExceptionLevel = source === "fatal" ? "fatal" : "error";
  let exceptions: SafeException[];
  try {
    const properties = builder.buildFromUnknown(cause, {
      mechanism: mechanisms[source],
    });
    exceptions = sanitizeExceptionList(properties.$exception_list);
  } catch {
    exceptions = [];
  }
  if (exceptions.length === 0) {
    exceptions = [
      {
        type: "Error",
        value: "The error could not be read",
        mechanism: { ...mechanisms[source], synthetic: true },
      },
    ];
  }
  return { level, exceptions, fingerprint: fingerprintOf(exceptions) };
};
