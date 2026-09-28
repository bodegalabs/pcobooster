import { ORPCError } from "@orpc/server";
import { createPostHogCaptureSender } from "@pcobooster/api/modules/analytics/posthog-capture";
import type { PostHogCaptureBody } from "@pcobooster/api/modules/analytics/posthog-capture";
import { z } from "zod";

const SERVER_ERROR_STATUS = 500;
const EXCEPTION_MESSAGE_MAX_LENGTH = 500;
const STACK_FRAME =
  /^\s*at (?:(?<fn>.+?) \()?(?<file>[^()]+?):(?<line>\d+):(?<col>\d+)\)?$/u;
/** API exceptions are not tied to a person: the handler would need a session lookup. */
const SERVER_DISTINCT_ID = "pcobooster-api";

/** Anything a handler throws, as an `Error`; oRPC's own errors pass through intact. */
export const requestErrorSchema = z
  .unknown()
  .transform((value) =>
    value instanceof Error ? value : new Error(String(value))
  );

export interface ReportedRequestError {
  readonly error: Error;
  /** The procedure's URL path, such as `/api/rpc/planItems/create`. */
  readonly path: string;
  readonly method: string;
  readonly requestId: string;
}

/**
 * Only failures the product should not produce are reported: 5xx responses and anything
 * that was not an `ORPCError`. Expected faults (auth, validation, conflicts, rate limits)
 * are ordinary outcomes and stay in the logs.
 */
export const isReportableRequestError = (error: Error): boolean =>
  !(error instanceof ORPCError) || error.status >= SERVER_ERROR_STATUS;

interface ExceptionFrame {
  readonly platform: "node:javascript";
  readonly filename: string;
  readonly function: string;
  readonly lineno: number;
  readonly colno: number;
  readonly in_app: boolean;
}

const parseStackFrames = (stack: string | undefined): ExceptionFrame[] => {
  if (stack === undefined) {
    return [];
  }
  const frames: ExceptionFrame[] = [];
  for (const line of stack.split("\n")) {
    const groups = STACK_FRAME.exec(line)?.groups;
    if (groups?.file !== undefined) {
      frames.push({
        platform: "node:javascript",
        filename: groups.file,
        function: groups.fn ?? "<anonymous>",
        lineno: Number(groups.line),
        colno: Number(groups.col),
        in_app: !groups.file.includes("node_modules"),
      });
    }
  }
  // PostHog expects the outermost frame first, as V8 lists them last.
  return frames.toReversed();
};

/** The underlying cause explains a 5xx better than the generic transport error wrapping it. */
const rootCause = (error: Error): Error =>
  error instanceof ORPCError && error.cause !== undefined
    ? requestErrorSchema.parse(error.cause)
    : error;

interface ExceptionEntry {
  readonly type: string;
  readonly value: string;
  readonly mechanism: {
    readonly handled: true;
    readonly synthetic: false;
    readonly type: "orpc";
  };
  stacktrace?: { readonly type: "raw"; readonly frames: ExceptionFrame[] };
}

const toExceptionEntry = (cause: Error): ExceptionEntry => {
  const entry: ExceptionEntry = {
    type: cause.name,
    value: cause.message.slice(0, EXCEPTION_MESSAGE_MAX_LENGTH),
    mechanism: { handled: true, synthetic: false, type: "orpc" },
  };
  const frames = parseStackFrames(cause.stack);
  if (frames.length > 0) {
    entry.stacktrace = { type: "raw", frames };
  }
  return entry;
};

export const toPostHogExceptionCapture = (
  apiKey: string,
  reported: ReportedRequestError,
  now: Date
): PostHogCaptureBody => {
  const code =
    reported.error instanceof ORPCError
      ? z.string().parse(reported.error.code)
      : "UNHANDLED";
  return {
    api_key: apiKey,
    event: "$exception",
    distinct_id: SERVER_DISTINCT_ID,
    timestamp: now.toISOString(),
    properties: {
      source: "server",
      $process_person_profile: false,
      $exception_level: "error",
      $exception_list: [toExceptionEntry(rootCause(reported.error))],
      // One issue per procedure and failure kind, so varying messages don't split it.
      $exception_fingerprint: `api:${reported.path}:${code}`,
      error_code: code,
      path: reported.path,
      method: reported.method,
      request_id: reported.requestId,
    },
  };
};

export type ReportRequestError = (
  reported: ReportedRequestError
) => Promise<void>;

/** Null when the stage has no PostHog project, which is every stage but production. */
export const createPostHogExceptionReporter = ({
  apiKey,
  fetch: send,
  now = () => new Date(),
}: {
  apiKey: string | null | undefined;
  fetch: typeof globalThis.fetch;
  now?: () => Date;
}): ReportRequestError | null => {
  if (apiKey === null || apiKey === undefined || apiKey === "") {
    return null;
  }
  const sendCapture = createPostHogCaptureSender(send);
  return async (reported) => {
    if (!isReportableRequestError(reported.error)) {
      return;
    }
    await sendCapture(toPostHogExceptionCapture(apiKey, reported, now()));
  };
};
