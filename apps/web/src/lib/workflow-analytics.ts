import type { captureAnalytics } from "@pcobooster/analytics/client";
import { failureCode } from "@pcobooster/client/product-client";
import { z } from "zod";

const OPERATIONS = new Set([
  "schedule.assign",
  "schedule.remove",
  "schedule.updateStatus",
  "planItems.create",
  "planItems.update",
  "planItems.delete",
  "planItems.reorder",
  "planTimes.create",
  "planTimes.update",
  "planTimes.delete",
  "accounts.select",
  "neededPositions.adjust",
  "planPeople.updateTimes",
  "chordCharts.update",
  "chordCharts.create",
  "chordCharts.createSong",
  "feedback.submit",
]);
const errorCodeSchema = z.enum([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "BAD_REQUEST",
  "ALREADY_SCHEDULED",
  "POSITION_MISMATCH",
  "CONFLICT",
  "SERVICE_UNAVAILABLE",
  "NETWORK_ERROR",
  "GATEWAY_TIMEOUT",
  "TOO_MANY_REQUESTS",
  "BAD_GATEWAY",
  "INTERNAL_SERVER_ERROR",
  "CLIENT_OUTDATED",
]);

/** Only operation names and outcomes are captured, never request/response bodies or error messages. */
export const measureWorkflow = async <T>(
  operation: string,
  execute: () => Promise<T>,
  capture: typeof captureAnalytics
): Promise<T> => {
  if (!OPERATIONS.has(operation)) {
    return await execute();
  }
  const start = performance.now();
  try {
    const result = await execute();
    capture("workflow completed", {
      operation,
      duration_ms: Math.round(performance.now() - start),
    });
    return result;
  } catch (error) {
    const errorCode = errorCodeSchema.safeParse(
      error instanceof Error ? failureCode(error) : undefined
    );
    capture("workflow failed", {
      operation,
      error_code: errorCode.success ? errorCode.data : "UNKNOWN",
    });
    throw error;
  }
};
