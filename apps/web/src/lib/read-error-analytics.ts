import type { captureAnalyticsException } from "@pcobooster/analytics/client";
import { failureCode } from "@pcobooster/client/product-client";
import { QueryCache } from "@tanstack/react-query";
import { Option, Schema } from "effect";

const decodeReadOperation = Schema.decodeUnknownOption(
  Schema.Literals([
    "planning-center-accounts",
    "planning-center-access",
    "features",
    "planning-center-organization-time-zone",
    "service-types",
    "plans",
    "plan-details",
    "adjacent-plans",
    "team-positions",
    "people",
    "people-plan-window-history",
    "people-candidate-details",
    "people-search",
    "people-dashboard-roster",
    "people-dashboard-activity",
    "people-dashboard-person",
    "blockouts",
    "my-scheduled-plans",
    "plan-items",
    "plan-times",
    "song-search",
    "song-library",
    "song-suggestions",
    "song-history",
    "song-options",
    "chord-chart-song",
    "lyrics-search",
    "chord-chart-pdf",
  ])
);
const decodeErrorCode = Schema.decodeUnknownOption(
  Schema.Literals([
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "BAD_REQUEST",
    "ALREADY_SCHEDULED",
    "POSITION_MISMATCH",
    "CONFLICT",
    "TOO_MANY_REQUESTS",
    "BAD_GATEWAY",
    "INTERNAL_SERVER_ERROR",
    "SERVICE_UNAVAILABLE",
    "NETWORK_ERROR",
    "GATEWAY_TIMEOUT",
    "CLIENT_OUTDATED",
  ])
);

/** One report for every terminal read failure, after retries, including background work. */
export const createReadErrorCache = (
  capture: typeof captureAnalyticsException
): QueryCache =>
  new QueryCache({
    onError: (error, query) => {
      const operationName = Option.getOrElse(
        decodeReadOperation(query.queryKey[0]),
        () => "unknown-read"
      );
      const errorCode = Option.getOrElse(
        decodeErrorCode(failureCode(error)),
        () => "UNKNOWN"
      );
      // Provider messages, query IDs, and bodies may contain private data. Report a
      // stable synthetic exception; the SDK attaches the signed-in person and session.
      const reported = new Error(
        `Failed to load ${operationName} (${errorCode})`
      );
      reported.name = "DataLoadError";
      capture(reported, {
        operation: operationName,
        error_code: errorCode,
        outcome: "read_failed",
      });
    },
  });
