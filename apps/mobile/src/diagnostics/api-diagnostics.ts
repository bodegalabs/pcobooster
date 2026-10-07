/**
 * Which terminal API failures become diagnostics, and as what. The query and mutation caches
 * call `reportApiFailure` once per failed query or mutation, after automatic retries (TanStack
 * Query's cache `onError` never sees an intermediate retry), so a read that recovers on retry
 * reports nothing.
 *
 * | Failure | Report |
 * | --- | --- |
 * | Cancelled or aborted; speculative work nothing on screen asked for | Nothing |
 * | 4xx fault: sign-in, permission, validation, not found, conflict, rate limit | Nothing; expected answers |
 * | `ClientOutdated` | `api request failed`, once per app session |
 * | 5xx fault | `api request failed` with the request ID; the Worker already reported the same request as an exception, so this is not a second alert |
 * | Network failure while the device reports a connection | `$exception` `ApiTransportError`, at most once per `NETWORK_REPORT_INTERVAL_MS` |
 * | Network failure while offline | Nothing |
 * | Undecodable answer (the request may never have reached the API, or a gateway answered) | `$exception` `ApiDecodeError` |
 * | Anything else thrown from a query or mutation (a bug) | `$exception` with the error itself |
 *
 * Reports carry only the procedure name, the failure's code and HTTP status, the request ID,
 * and the duration: never inputs, URLs, headers, or answer bodies. Exception messages are
 * synthetic (`plans.list failed (UNDECODABLE)`).
 */
import {
  failureCode,
  failureStatus,
  TransportFailure,
} from "@pcobooster/client/product-client";
import { isProductFault } from "@pcobooster/contracts/faults";
import { CancelledError } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { Option, Schema } from "effect";

import type { CallFailure } from "./call-failures";
import type { Diagnostics, ReportDetails } from "./diagnostics-client";

export const NETWORK_REPORT_INTERVAL_MS = 5 * 60 * 1000;
const SERVER_ERROR_STATUS = 500;
const PROCEDURE_NAME = /^[a-z][A-Za-z\d]*\.[a-z][A-Za-z\d]*$/u;

export interface ApiFailureContext {
  /** The failed call's request ID, procedure, and duration, when the app client sent one. */
  readonly call: CallFailure | null;
  /** The procedure the query or mutation is for (a query key's procedure tag), if known. */
  readonly operation: string | null;
  /** The query was speculative work that nothing on screen observed. */
  readonly speculative: boolean;
  /** The device reports a network connection (`onlineManager`). */
  readonly online: boolean;
}

export type ApiFailureReport =
  | { readonly kind: "ignore" }
  | {
      readonly kind: "event";
      readonly details: ReportDetails;
      readonly dedupeKey: string;
    }
  | {
      readonly kind: "exception";
      readonly type: "ApiTransportError" | "ApiDecodeError";
      readonly message: string;
      readonly fingerprint: string;
      readonly details: ReportDetails;
    }
  | { readonly kind: "defect"; readonly details: ReportDetails };

const decodeTag = Schema.decodeUnknownOption(Schema.String);

/** A query key's procedure tag (`[scope, "plans.list", ...]`), or null. */
export const operationFromQueryKey = (queryKey: QueryKey): string | null =>
  Option.getOrNull(decodeTag(queryKey[1]));

/** TanStack Query's cancellation, or an aborted call (`AbortError`). */
const isCancellation = (cause: unknown): boolean =>
  cause instanceof CancelledError ||
  (cause instanceof Object && "name" in cause && cause.name === "AbortError");

const operationName = (context: ApiFailureContext): string => {
  const name = context.call?.procedure ?? context.operation;
  return name !== null && PROCEDURE_NAME.test(name) ? name : "unknown";
};

/** Report details while they are assembled. */
type ReportDetailsDraft = {
  -readonly [Key in keyof ReportDetails]: ReportDetails[Key];
};

const detailsFor = (
  context: ApiFailureContext,
  code?: string,
  status?: number
): ReportDetails => {
  const details: ReportDetailsDraft = { operation: operationName(context) };
  if (code !== undefined) {
    details.error_code = code;
  }
  if (status !== undefined) {
    details.http_status = status;
  }
  if (context.call !== null) {
    details.request_id = context.call.requestId;
    details.duration_ms = Math.max(0, Math.round(context.call.durationMs));
  }
  return details;
};

/**
 * Whether the query and mutation caches own this failure: a product fault, a transport failure,
 * or a cancellation. Other paths (uncaught errors, unhandled rejections of an unawaited
 * `mutateAsync`, the render boundary) skip it, so an expected 4xx or an offline failure is never
 * reported as an exception there.
 */
export const isApiFailureOrCancellation = (cause: unknown): boolean =>
  isCancellation(cause) ||
  isProductFault(cause) ||
  cause instanceof TransportFailure;

/** The report a terminal failure gets under the table above. */
export const classifyApiFailure = (
  cause: unknown,
  context: ApiFailureContext
): ApiFailureReport => {
  if (isCancellation(cause) || context.speculative) {
    return { kind: "ignore" };
  }
  if (isProductFault(cause)) {
    const code = failureCode(cause);
    const status = failureStatus(cause);
    if (cause._tag === "ClientOutdated") {
      return {
        kind: "event",
        details: detailsFor(context, code, status),
        dedupeKey: "CLIENT_OUTDATED",
      };
    }
    if ((status ?? 0) < SERVER_ERROR_STATUS) {
      return { kind: "ignore" };
    }
    const details = detailsFor(context, code, status);
    return {
      kind: "event",
      details,
      dedupeKey: `${details.operation}|${code}`,
    };
  }
  if (cause instanceof TransportFailure) {
    if (cause.reason === "network" && !context.online) {
      return { kind: "ignore" };
    }
    const code = cause.reason === "network" ? "NETWORK_ERROR" : "UNDECODABLE";
    const details = {
      ...detailsFor(context, code),
      failure_kind: cause.reason,
    };
    return {
      kind: "exception",
      type: cause.reason === "network" ? "ApiTransportError" : "ApiDecodeError",
      message: `${details.operation} failed (${code})`,
      fingerprint: `mobile-api:${details.operation}:${code}`,
      details,
    };
  }
  return {
    kind: "defect",
    details: detailsFor(context),
  };
};

/**
 * Sends terminal API failures to `diagnostics` under `classifyApiFailure`, adding the
 * once-per-session and network throttles the generic client does not know about.
 */
export const makeApiFailureReporter = (
  diagnostics: Pick<
    Diagnostics,
    "captureEvent" | "captureFailure" | "captureException"
  >,
  now: () => number = Date.now
) => {
  let reportedOutdated = false;
  let lastNetworkReport = Number.NEGATIVE_INFINITY;
  return (cause: unknown, context: ApiFailureContext) => {
    try {
      const report = classifyApiFailure(cause, context);
      switch (report.kind) {
        case "ignore": {
          return;
        }
        case "event": {
          if (report.dedupeKey === "CLIENT_OUTDATED") {
            if (reportedOutdated) {
              return;
            }
            reportedOutdated = true;
          }
          diagnostics.captureEvent(
            "api request failed",
            report.details,
            report.dedupeKey
          );
          return;
        }
        case "exception": {
          if (report.type === "ApiTransportError") {
            if (now() - lastNetworkReport < NETWORK_REPORT_INTERVAL_MS) {
              return;
            }
            lastNetworkReport = now();
          }
          diagnostics.captureFailure(report);
          return;
        }
        case "defect": {
          diagnostics.captureException(cause, "handled", report.details);
          return;
        }
        default: {
          report satisfies never;
        }
      }
    } catch {
      /* Reporting never breaks the app. */
    }
  };
};
