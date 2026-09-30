import { ORPCError } from "@orpc/client";
import type { captureAnalyticsException } from "@pcobooster/analytics/client";
import { QueryCache } from "@tanstack/react-query";
import { z } from "zod";

const readOperationSchema = z.enum([
  "planning-center-accounts",
  "planning-center-access",
  "feature",
  "cleanup-songs",
  "cleanup-people-roster",
  "cleanup-people-activity",
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
  "song-suggestions",
  "song-history",
  "song-options",
  "chord-chart-song",
  "lyrics-search",
  "chord-chart-pdf",
]);
const errorCodeSchema = z.enum([
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
  "GATEWAY_TIMEOUT",
]);

/** One report for every terminal read failure, after retries, including background work. */
export const createReadErrorCache = (
  capture: typeof captureAnalyticsException
): QueryCache =>
  new QueryCache({
    onError: (error, query) => {
      const operation = readOperationSchema.safeParse(query.queryKey[0]);
      const code = errorCodeSchema.safeParse(
        error instanceof ORPCError ? error.code : undefined
      );
      const operationName = operation.success ? operation.data : "unknown-read";
      const errorCode = code.success ? code.data : "UNKNOWN";
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
