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

/**
 * Measures a call whose operation (`schedule.assign`) the call itself names once its request
 * is sent (`named`), as the product client reports it from the route table. Only the selected
 * writes are captured, and only operation names and outcomes, never request or response bodies
 * or error messages.
 */
export const measureWorkflow = async <T>(
  execute: (named: (operation: string) => void) => Promise<T>,
  capture: typeof captureAnalytics
): Promise<T> => {
  let operation: string | undefined;
  const start = performance.now();
  const measured = () =>
    operation !== undefined && OPERATIONS.has(operation)
      ? operation
      : undefined;
  try {
    const result = await execute((name) => {
      operation = name;
    });
    const completed = measured();
    if (completed !== undefined) {
      capture("workflow completed", {
        operation: completed,
        duration_ms: Math.round(performance.now() - start),
      });
    }
    return result;
  } catch (error) {
    const failed = measured();
    if (failed !== undefined) {
      const errorCode = errorCodeSchema.safeParse(
        error instanceof Error ? failureCode(error) : undefined
      );
      capture("workflow failed", {
        operation: failed,
        error_code: errorCode.success ? errorCode.data : "UNKNOWN",
      });
    }
    throw error;
  }
};
